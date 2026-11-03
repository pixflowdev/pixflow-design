<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

/** Attachment-owned variants. The post/template stores only the placement dimensions. */
final class DynamicFit {
    private const JOB = 'pixflow_dynamic_fit_generate';
    private const KEY = 'pixflowDynamicFit';

    public static function register(): void {
        add_action(self::JOB, [self::class, 'generate'], 10, 2);
        add_action('delete_attachment', [self::class, 'remove']);
        add_filter('register_block_type_args', static function ($args, $name) {
            if (in_array($name,['core/post-featured-image','core/cover'],true)) $args['attributes'][self::KEY] = ['type'=>'string'];
            return $args;
        }, 10, 2);
        add_filter('render_block_core/cover',static function ($html,$parsed,$block) {
            $attrs=$parsed['attrs']??[];
            if (empty($attrs['useFeaturedImage']) || empty($attrs[self::KEY])) return $html;
            return self::image($html,$attrs[self::KEY],(int)get_post_thumbnail_id($block->context['postId']??get_the_ID()),'wp-block-cover__image-background');
        },20,3);
        add_filter('render_block_core/post-featured-image', static function ($html, $parsed, $block) {
            $profile = $parsed['attrs'][self::KEY] ?? '';
            if (!$profile) return $html;
            return self::image($html, $profile, (int)get_post_thumbnail_id($block->context['postId'] ?? get_the_ID()));
        }, 10, 3);
    }

    /** Mobile, tablet, desktop. Optional heights describe a cover placement. */
    public static function slots($profile): array {
        if (!is_string($profile) || !preg_match('/^\d{1,4}(?:x\d{1,4})?(?:,\d{1,4}(?:x\d{1,4})?){2}$/D', $profile)) return [];
        $slots = [];
        foreach (explode(',', $profile) as $part) {
            [$w,$h] = array_pad(array_map('intval', explode('x', $part)), 2, 0);
            if ($w < 1 || max($w,$h) > 4096) return [];
            $slots[] = [$w,$h];
        }
        return $slots;
    }

    private static function source(int $id): ?array {
        if ($id < 1 || !in_array(get_post_mime_type($id), ['image/jpeg','image/png','image/webp'], true)) return null;
        $path = get_attached_file($id);
        $meta = wp_get_attachment_metadata($id);
        $uploads = wp_get_upload_dir();
        if (!$path || !is_file($path) || empty($meta['width']) || empty($meta['height']) || $uploads['error']) return null;
        $version = substr(hash('sha256',basename($path).'|'.filemtime($path).'|'.filesize($path).'|'.$meta['width'].'x'.$meta['height']),0,16);
        $relative = '/pixflow-dynamic-fit/'.$id;
        return ['path'=>$path,'meta'=>$meta,'dir'=>$uploads['basedir'].$relative,'url'=>$uploads['baseurl'].$relative,'version'=>$version];
    }

    private static function candidate(int $id, array $src, int $width): string|false|null {
        $meta = $src['meta'];
        foreach (($meta['sizes'] ?? []) as $name=>$size) {
            if ((int)$size['width'] === $width && abs($size['height'] - $width*$meta['height']/$meta['width']) <= 1) {
                $url = wp_get_attachment_image_url($id,$name);
                if ($url) return $url;
            }
        }
        $file = '/'.$src['version'].'-'.$width.'.webp';
        if (is_file($src['dir'].$file)) return $src['url'].$file;
        $args = [$id,$width];
        if (get_transient('pxfit_'.$id.'_'.$src['version'].'_'.$width)) return false;
        if (!wp_next_scheduled(self::JOB,$args)) {
            wp_schedule_single_event(time(),self::JOB,$args);
        }
        // Caches that honour the WordPress convention should not freeze the
        // cold response before the scheduled jobs have produced their variants.
        if (!defined('DONOTCACHEPAGE') && !is_admin() && !wp_doing_cron() && !(defined('REST_REQUEST') && REST_REQUEST)) {
            define('DONOTCACHEPAGE', true);
        }
        return null;
    }

    /** Match only actual local attachment URLs, including WP intermediate sizes. */
    private static function identify(string $url, int $hint): int {
        if (!$url) return 0;
        if ($hint) {
            if ($url === wp_get_attachment_url($hint)) return $hint;
            $meta = wp_get_attachment_metadata($hint);
            foreach (array_keys($meta['sizes'] ?? []) as $size) {
                if ($url === wp_get_attachment_image_url($hint,$size)) return $hint;
            }
        }
        return (int)attachment_url_to_postid($url);
    }

    public static function image(string $html, $profile, int $hint = 0, ?string $imageClass=null): string {
        $slots = self::slots($profile);
        if (!$slots || !$html || !class_exists('WP_HTML_Tag_Processor')) return $html;
        $tags = new \WP_HTML_Tag_Processor($html);
        if (!$tags->next_tag($imageClass ? ['tag_name'=>'IMG','class_name'=>$imageClass] : 'IMG')) return $html;
        $prefix = $tags->get_attribute('data-src') ? 'data-' : '';
        $url = (string)$tags->get_attribute($prefix.'src');
        if (!$hint && preg_match('/\bwp-image-(\d+)\b/',(string)$tags->get_attribute('class'),$match)) $hint=(int)$match[1];
        $id = self::identify($url,$hint);
        $src = self::source($id);
        if (!$src) return $html;
        $meta = $src['meta'];
        $variants = [];
        $required = [];
        foreach ($slots as [$w,$h]) {
            $width = (int)min(4096,$meta['width'],max($w,ceil($h*$meta['width']/$meta['height'])));
            $required[]=$width;
            if (!array_key_exists($width,$variants)) $variants[$width] = self::candidate($id,$src,$width);
        }
        // A cold visitor sees the same complete responsive image until all widths are ready.
        if (in_array(null,$variants,true)) return $html;
        $variants=array_filter($variants);
        if (!$variants) return $html;
        ksort($variants);
        $largest = end($variants);
        // Preserve native higher-density candidates and art direction. Only replace matching width descriptors.
        $candidates = [];
        foreach (explode(',', (string)$tags->get_attribute($prefix.'srcset')) as $item) {
            if (preg_match('/^\s*(\S+)\s+(\d+)w\s*$/D',$item,$match)) $candidates[(int)$match[2]]=$match[1];
            elseif (trim($item)!=='') return $html;
        }
        $candidates = $variants + $candidates;
        ksort($candidates);
        $list = [];
        foreach ($candidates as $w=>$u) $list[]=$u.' '.$w.'w';
        $tags->set_attribute($prefix.'src',$largest);
        $tags->set_attribute($prefix.'srcset',implode(', ',$list));
        $tags->set_attribute($prefix.'sizes',sprintf('(max-width: 600px) %dpx, (max-width: 1024px) %dpx, %dpx',...$required));
        return $tags->get_updated_html();
    }

    /** Only rewrite a single local background URL declared on this placement.
     * A stylesheet, layered background or arbitrary external expression retains native output. */
    public static function background(string $html, $profile, int $resolvedId=0): string {
        $slots=self::slots($profile);
        if (!$slots || !class_exists('WP_HTML_Tag_Processor')) return $html;
        $tag=new \WP_HTML_Tag_Processor($html);
        if (!$tag->next_tag()) return $html;
        $style=(string)$tag->get_attribute('style');
        $id=$resolvedId;
        $hasInline=preg_match('~(?:^|;)\s*background-image\s*:\s*(url\(\s*["\']?([^"\'()]+?)["\']?\s*\))\s*(?:;|$)~i',$style,$match);
        if ($hasInline) $id=self::identify(trim($match[2]),$resolvedId);
        elseif (stripos($style,'background')!==false || !$resolvedId) return $html;
        $src=self::source($id);
        if (!$src) return $html;
        $urls=[];
        foreach ($slots as [$w,$h]) {
            $width=(int)min(4096,$src['meta']['width'],max($w,ceil($h*$src['meta']['width']/$src['meta']['height'])));
            $urls[]=self::candidate($id,$src,$width);
        }
        if (in_array(null,$urls,true) || in_array(false,$urls,true)) return $html;
        $token='pf'.substr(hash('sha256',implode('|',$urls)),0,12);
        $cssUrl=static fn($url)=>'url("'.str_replace(['"',')','<'],['%22','%29','%3C'],esc_url_raw($url)).'")';
        $tag->set_attribute('data-pixflow-fit-bg',$token);
        $value='var(--'.$token.','.$cssUrl($urls[2]).')';
        $tag->set_attribute('style',$hasInline ? str_replace($match[1],$value,$style) : rtrim($style,';').';background-image:'.$value.';');
        $selector='[data-pixflow-fit-bg="'.$token.'"]{--'.$token.':';
        return $tag->get_updated_html().'<style>@media(max-width:1024px){'.$selector.$cssUrl($urls[1]).'}}@media(max-width:600px){'.$selector.$cssUrl($urls[0]).'}}</style>';
    }

    public static function generate(int $id,int $w): void {
        $src=self::source($id);
        if (!$src || $w<1 || $w>min(4096,$src['meta']['width']) || !wp_mkdir_p($src['dir'])) return;
        $file=$src['dir'].'/'.$src['version'].'-'.$w.'.webp';
        if (is_file($file)) return;
        $lock=fopen($src['dir'].'/.lock','c');
        if (!$lock) return;
        try {
            if (!flock($lock,LOCK_EX|LOCK_NB)) {
                if (!wp_next_scheduled(self::JOB,[$id,$w])) wp_schedule_single_event(time()+30,self::JOB,[$id,$w]);
                return;
            }
            if (is_file($file)) return;
            $failure='pxfit_'.$id.'_'.$src['version'].'_'.$w;
            set_transient($failure,1,DAY_IN_SECONDS);
            // Preserve animated inputs. These chunk types precede the first animation frame.
            $mime=get_post_mime_type($id);
            if ($mime!=='image/jpeg' && self::animated($src['path'],$mime)) return;
            $editor=wp_get_image_editor($src['path']);
            if (is_wp_error($editor) || !$editor->supports_mime_type('image/webp')) return;
            if ($w < $src['meta']['width'] && is_wp_error($editor->resize($w,null,false))) return;
            $editor->set_quality(82);
            $tmp=$file.'.'.wp_generate_uuid4().'.webp';
            try {
                $saved=$editor->save($tmp,'image/webp');
                if (!is_wp_error($saved) && $saved['mime-type']==='image/webp' && (int)$saved['width']===$w && filesize($tmp)<filesize($src['path'])) {
                    if (rename($tmp,$file)) delete_transient($failure);
                }
            } finally { if (is_file($tmp)) wp_delete_file($tmp); }
        } finally { fclose($lock); }
    }

    private static function animated(string $path,string $mime): bool {
        $png=$mime==='image/png';$f=fopen($path,'rb');if(!$f)return true;
        try {
            fseek($f,$png?8:12);
            for ($i=0;$i<4096;++$i) {
                $head=fread($f,8);if(strlen($head)!==8)return true;
                $kind=$png?substr($head,4):substr($head,0,4);
                if(in_array($kind,['acTL','ANIM'],true))return true;
                if(in_array($kind,['IDAT','VP8 ','VP8L'],true))return false;
                $len=unpack($png?'N':'V',$png?substr($head,0,4):substr($head,4))[1];
                if(fseek($f,$len+($png?4:$len%2),SEEK_CUR)!==0)return true;
            }
            return true;
        } finally {fclose($f);}
    }

    public static function remove(int $id): void {
        $dir=wp_get_upload_dir()['basedir'].'/pixflow-dynamic-fit/'.$id;
        if(!is_dir($dir)||is_link($dir))return;
        foreach(glob($dir.'/*.webp') ?: [] as $file)wp_delete_file($file);
        if(is_file($dir.'/.lock'))wp_delete_file($dir.'/.lock');
        @rmdir($dir);
    }
}
