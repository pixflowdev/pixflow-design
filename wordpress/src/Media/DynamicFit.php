<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

/** Attachment-owned variants. The post/template stores only the placement dimensions. */
final class DynamicFit {
    private const JOB = 'pixflow_dynamic_fit_generate';
    private const KEY = 'pixflowDynamicFit';

    public static function register(): void {
        FitUsage::register();
        add_action('rest_api_init',[self::class,'registerUpscaleRoutes']);
        add_action('pixflow_fit_expire_pending',static function ($id,$job) { delete_post_meta($id,self::PENDING,$job); },10,2);
        add_action(self::JOB, [self::class, 'generate'], 10, 2);
        add_action('pixflow_fit_expire_sizes', [self::class, 'expire']);
        add_action('delete_attachment', [self::class, 'remove']);
        add_filter('register_block_type_args', static function ($args, $name) {
            if (in_array($name,['core/image','core/post-featured-image','core/cover'],true)) $args['attributes'][self::KEY] = ['type'=>'string'];
            return $args;
        }, 10, 2);
        add_filter('render_block_core/image',static function ($html,$parsed) {
            return self::image($html,$parsed['attrs'][self::KEY]??'',(int)($parsed['attrs']['id']??0));
        },20,2);
        add_filter('render_block_core/cover',static function ($html,$parsed,$block) {
            $attrs=$parsed['attrs']??[];
            if (empty($attrs[self::KEY])) return $html;
            return self::image($html,$attrs[self::KEY],empty($attrs['useFeaturedImage']) ? (int)($attrs['id']??0) : (int)get_post_thumbnail_id($block->context['postId']??get_the_ID()),'wp-block-cover__image-background');
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

    public static function widths($profile,array $meta): array {
        return array_map(static fn($slot)=>(int)min(4096,max($slot[0],ceil($slot[1]*$meta['width']/$meta['height']))),self::slots($profile));
    }

    /** Only freshly generated files with no unresolved HTML consumers qualify. */
    public static function release(int $id,int $width,bool $unused): void {
        $src=self::source($id);
        if (!$src || $width<1 || $width>4096) return;
        $file=$src['dir'].'/'.$src['version'].'-'.$width.'.webp';
        if ($unused) self::dropPending($id,$src['version'].'-'.$width);
        if ($unused) wp_clear_scheduled_hook(self::JOB,[$id,$width]);
        if (!is_file($file) || is_link($file)) return;
        $lock=fopen($src['dir'].'/.lock','c');
        if (!$lock) return;
        try {
            if (!flock($lock,LOCK_EX|LOCK_NB)) return;
            clearstatcache(true,$file.'.unserved');
            if ($unused && is_file($file.'.unserved')) {
                wp_delete_file($file);
                if (!is_file($file)) wp_delete_file($file.'.unserved');
            } elseif (is_file($file)) {
                // Start the grace period on the replacement save, even for a cold page.
                touch($file);
                self::scheduleExpiry($id);
            }
        } finally { fclose($lock); }
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

    private const PENDING = '_pixflow_fit_upscale';

    private static function dropPending(int $id,string $job): void {
        if (delete_post_meta($id,self::PENDING,$job)) wp_clear_scheduled_hook('pixflow_fit_expire_pending',[$id,$job]);
    }

    /** Serve a real native-width candidate until a paired editor deposits the larger version. */
    private static function availableWidth(int $id,array $src,int $width): int {
        if ($width<=$src['meta']['width'] || is_file($src['dir'].'/'.$src['version'].'-'.$width.'.webp')) return $width;
        self::requestLarger($id,$width);
        return (int)$src['meta']['width'];
    }

    public static function requestLarger(int $id,int $width): void {
        $src=self::source($id);
        if (!$src || $width<=$src['meta']['width'] || $width>min(4096,$src['meta']['width']*4)
            || $width*ceil($width*$src['meta']['height']/$src['meta']['width'])>32000000
            || is_file($src['dir'].'/'.$src['version'].'-'.$width.'.webp')) return;
        $job=$src['version'].'-'.$width;
        $pending=get_post_meta($id,self::PENDING,false);
        if (in_array($job,$pending,true) || count($pending)>=24) return;
        if (get_post_mime_type($id)!=='image/jpeg' && self::animated($src['path'],get_post_mime_type($id))) return;
        if (add_post_meta($id,self::PENDING,$job) && !wp_next_scheduled('pixflow_fit_expire_pending',[$id,$job]))
            wp_schedule_single_event(time()+30*DAY_IN_SECONDS,'pixflow_fit_expire_pending',[$id,$job]);
    }

    public static function fitSource($request) {
        $url=explode('#',(string)$request['source'],2)[0];
        if (!in_array(wp_parse_url($url,PHP_URL_SCHEME),['http','https'],true) || !wp_parse_url($url,PHP_URL_HOST)
            || wp_parse_url($url,PHP_URL_USER)!==null || strlen($url)>4096) return new \WP_Error('url',__('Enter a valid image URL.','pixflow-design'),['status'=>400]);
        global $wpdb;
        $import=$request['import']===true;
        $lock='pixfit_'.substr(hash('sha256',$wpdb->prefix.$url),0,48);
        if ($import && !$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 2)',$lock))) return new \WP_Error('busy',__('Import already in progress. Try again.','pixflow-design'),['status'=>409]);
        try {
            $id=self::identify($url);
            if ($id && !current_user_can('edit_post',$id)) return new \WP_Error('denied',__('Cannot edit this attachment.','pixflow-design'),['status'=>403]);
            if ($id || !$import) return ['id'=>$id];
            require_once ABSPATH.'wp-admin/includes/file.php';
            require_once ABSPATH.'wp-admin/includes/media.php';
            require_once ABSPATH.'wp-admin/includes/image.php';
            $tmp=wp_tempnam('pixflow-image');
            if (!$tmp) return new \WP_Error('storage',__('Temporary storage unavailable.','pixflow-design'),['status'=>503]);
            $limit=12*MB_IN_BYTES;
            try {
                $response=wp_safe_remote_get($url,['stream'=>true,'filename'=>$tmp,'timeout'=>20,'limit_response_size'=>$limit+1,'redirection'=>2]);
                if (is_wp_error($response) || wp_remote_retrieve_response_code($response)!==200 || filesize($tmp)>$limit)
                    return new \WP_Error('download',__('Could not import this image. Check the URL and file size.','pixflow-design'),['status'=>400]);
                $size=wp_getimagesize($tmp);
                $extensions=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
                if (!$size || !isset($extensions[$size['mime']]) || $size[0]*$size[1]>32000000)
                    return new \WP_Error('format',__('Choose a JPEG, PNG or WebP up to 32 megapixels.','pixflow-design'),['status'=>400]);
                $name=sanitize_file_name(pathinfo(wp_parse_url($url,PHP_URL_PATH)??'',PATHINFO_FILENAME)) ?: 'imported-image';
                $id=media_handle_sideload(['name'=>$name.'.'.$extensions[$size['mime']],'tmp_name'=>$tmp],0);
                if (is_wp_error($id)) return $id;
                update_post_meta($id,'_pixflow_fit_origin',hash('sha256',$url));
                return ['id'=>$id];
            } finally { if (is_file($tmp)) wp_delete_file($tmp); }
        } finally { if ($import) $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock)); }
    }

    public static function registerUpscaleRoutes(): void {
        $permission=static fn()=>current_user_can('upload_files');
        register_rest_route('pixflow-design/v1','/media/fit-source',[
            'methods'=>'POST','permission_callback'=>$permission,'callback'=>[self::class,'fitSource']
        ]);
        register_rest_route('pixflow-design/v1','/media/fit-canvas',[
            'methods'=>['GET','POST'],'permission_callback'=>$permission,
            'callback'=>static function($r) {
                $id=absint($r['attachment']);
                if (!$id) $id=self::identify((string)$r['source'],0);
                if (!$id || !current_user_can('edit_post',$id) || !self::slots($r['profile'])) return [];
                $tag=new \WP_HTML_Tag_Processor(self::image('<img src="'.esc_url(wp_get_attachment_url($id)).'">',$r['profile'],$id));
                $tag->next_tag('img');
                return ['srcset'=>$tag->get_attribute('srcset'),'sizes'=>$tag->get_attribute('sizes')];
            }
        ]);
        register_rest_route('pixflow-design/v1','/media/fit-upscale/(?P<id>\d+)/preview',[
            'methods'=>'GET','permission_callback'=>static fn($r)=>current_user_can('upload_files') && current_user_can('edit_post',(int)$r['id']),
            'callback'=>static function($r) {
                $src=self::source((int)$r['id']);
                $variants=[];
                if ($src) foreach (array_slice(explode(',',(string)$r['widths']),0,3) as $value) {
                    $width=absint($value);
                    $name=$src['version'].'-'.$width.'.webp';
                    if ($width>$src['meta']['width'] && is_file($src['dir'].'/'.$name)) $variants[$width]=$src['url'].'/'.$name;
                }
                return rest_ensure_response((object)$variants);
            }
        ]);
        register_rest_route('pixflow-design/v1','/media/fit-upscale',[
            'methods'=>'GET','permission_callback'=>$permission,'callback'=>static function($request) {
                global $wpdb;
                $rows=$wpdb->get_results($wpdb->prepare("SELECT meta_id,post_id,meta_value FROM $wpdb->postmeta WHERE meta_key=%s AND meta_id>%d ORDER BY meta_id LIMIT 64",self::PENDING,absint($request['after'])));
                $jobs=[];
                foreach($rows as $row) {
                    $id=(int)$row->post_id;
                    if (!current_user_can('edit_post',$id)) continue;
                    $src=self::source($id);
                    [$version,$width]=array_pad(explode('-',$row->meta_value,2),2,'');
                    if (!$src || $version!==$src['version'] || is_file($src['dir'].'/'.$row->meta_value.'.webp')) {
                        self::dropPending($id,$row->meta_value); continue;
                    }
                    $jobs[]=['id'=>$id,'version'=>$version,'width'=>(int)$width,'url'=>wp_get_attachment_url($id),'mime'=>get_post_mime_type($id)];
                }
                return ['jobs'=>$jobs,'next'=>count($rows)===64?(int)end($rows)->meta_id:0];
            }
        ]);
        register_rest_route('pixflow-design/v1','/media/fit-upscale/(?P<id>\d+)',[
            'methods'=>'POST','permission_callback'=>static fn($r)=>current_user_can('upload_files') && current_user_can('edit_post',(int)$r['id']),
            'callback'=>static function($r) {
                $id=(int)$r['id'];$width=(int)$r['width'];$src=self::source($id);
                $job=(string)$r['version'].'-'.$width;
                if (!$src || $src['version']!==$r['version'] || !in_array($job,get_post_meta($id,self::PENDING,false),true))
                    return new \WP_Error('stale',__('The placement has changed.','pixflow-design'),['status'=>409]);
                $file=$r->get_file_params()['file']??[];
                $tmp=$file['tmp_name']??'';
                if (!$tmp || !is_uploaded_file($tmp) || filesize($tmp)>32*1024*1024) return new \WP_Error('invalid',__('Invalid image upload.','pixflow-design'),['status'=>400]);
                $size=wp_getimagesize($tmp);
                if (!$size || $size['mime']!=='image/webp' || $size[0]!==$width || $size[1]!==max(1,(int)round($width*$src['meta']['height']/$src['meta']['width'])))
                    return new \WP_Error('dimensions',__('Incorrect image dimensions.','pixflow-design'),['status'=>400]);
                if (!wp_mkdir_p($src['dir'])) return new \WP_Error('directory',__('Could not create cache directory.','pixflow-design'),['status'=>500]);
                $dest=$src['dir'].'/'.$job.'.webp';
                $lock=fopen($src['dir'].'/.lock','c');
                if (!$lock) return new \WP_Error('lock',__('Cache unavailable.','pixflow-design'),['status'=>503]);
                try {
                    if (!flock($lock,LOCK_EX) || !in_array($job,get_post_meta($id,self::PENDING,false),true)) return new \WP_Error('stale',__('Job expired.','pixflow-design'),['status'=>409]);
                    if (!is_file($dest)) {
                        $stage=$dest.'.'.wp_generate_uuid4().'.tmp';
                        if (!move_uploaded_file($tmp,$stage)) return new \WP_Error('upload',__('Could not stage image.','pixflow-design'),['status'=>500]);
                        try {
                            touch($dest.'.unserved');
                            if (!rename($stage,$dest)) return new \WP_Error('cache',__('Could not save image.','pixflow-design'),['status'=>500]);
                        } finally { if (is_file($stage)) wp_delete_file($stage); }
                    }
                    self::dropPending($id,$job);self::scheduleExpiry($id);
                    return ['ok'=>true];
                } finally { fclose($lock); }
            }
        ]);
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
        $path=$src['dir'].$file;
        if (is_file($path)) {
            // After first exposure, intermediaries may continue serving the URL.
            if (is_file($path.'.unserved')) {
                $lock=fopen($src['dir'].'/.lock','c');
                if (!$lock) return null;
                try {
                    if (!flock($lock,LOCK_EX)) return null;
                    if (is_file($path.'.unserved') && !unlink($path.'.unserved')) return null;
                    clearstatcache(true,$path);
                } finally { fclose($lock); }
            }
            clearstatcache(true,$path);
            if (is_file($path)) {
                if (filemtime($path)<time()-DAY_IN_SECONDS) touch($path);
                self::scheduleExpiry($id);
                return $src['url'].$file;
            }
        }
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
    public static function identify(string $url, int $hint=0): int {
        if (!$url) return 0;
        if ($hint) {
            if ($url === wp_get_attachment_url($hint)) return $hint;
            $meta = wp_get_attachment_metadata($hint);
            foreach (array_keys($meta['sizes'] ?? []) as $size) {
                if ($url === wp_get_attachment_image_url($hint,$size)) return $hint;
            }
        }
        $url=explode('#',$url,2)[0];
        $upload=wp_get_upload_dir();
        $base=trailingslashit($upload['baseurl']);
        if (str_starts_with($url,$base)) {
            $local=explode('?',$url,2)[0];
            $id=(int)attachment_url_to_postid($local);
            if ($id) return $id;
            $full=preg_replace('/-\d+x\d+(?=\.[^.]+$)/','',$local);
            if ($full!==$local && ($id=attachment_url_to_postid($full))) {
                foreach (array_keys(wp_get_attachment_metadata($id)['sizes']??[]) as $size)
                    if (wp_get_attachment_image_url($id,$size)===$local) return (int)$id;
            }
        }
        $ids=get_posts(['post_type'=>'attachment','post_status'=>'inherit','fields'=>'ids','posts_per_page'=>1,
            'meta_key'=>'_pixflow_fit_origin','meta_value'=>hash('sha256',$url),'no_found_rows'=>true]);
        return (int)($ids[0]??0);
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
        foreach (self::widths($profile,$meta) as $width) {
            $required[]=$width;
            $width=self::availableWidth($id,$src,$width);
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
        foreach (self::widths($profile,$src['meta']) as $width) {
            $urls[]=self::candidate($id,$src,self::availableWidth($id,$src,$width));
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
                    touch($file.'.unserved');
                    if (rename($tmp,$file)) { delete_transient($failure); self::scheduleExpiry($id); }
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

    private static function scheduleExpiry(int $id): void {
        if (!wp_next_scheduled('pixflow_fit_expire_sizes',[$id]))
            wp_schedule_single_event(time()+30*DAY_IN_SECONDS,'pixflow_fit_expire_sizes',[$id]);
    }

    public static function expire(int $id): void {
        $dir=wp_get_upload_dir()['basedir'].'/pixflow-dynamic-fit/'.$id;
        if ($id<1 || !is_dir($dir) || is_link($dir)) return;
        $remaining=false;
        foreach(glob($dir.'/*.webp') ?: [] as $file) {
            if (!preg_match('/^[a-f0-9]{16}-[0-9]+\.webp$/D',basename($file)) || is_link($file)) continue;
            if (filemtime($file)<=time()-30*DAY_IN_SECONDS) {
                $src=self::source($id);
                $width=(int)substr(strrchr(basename($file),'-'),1);
                if ($src && basename($file)===$src['version'].'-'.$width.'.webp' && FitUsage::saved($id,$width)) {
                    $remaining=true;
                    continue;
                }
                wp_delete_file($file);
                if (!is_file($file) && is_file($file.'.unserved')) wp_delete_file($file.'.unserved');
            }
            if (is_file($file)) $remaining=true;
        }
        if ($remaining) self::scheduleExpiry($id);
    }

    public static function remove(int $id): void {
        $dir=wp_get_upload_dir()['basedir'].'/pixflow-dynamic-fit/'.$id;
        wp_clear_scheduled_hook('pixflow_fit_expire_sizes',[$id]);
        foreach(get_post_meta($id,self::PENDING,false) as $job) self::dropPending($id,$job);
        if(!is_dir($dir)||is_link($dir))return;
        foreach(glob($dir.'/*.webp') ?: [] as $file)wp_delete_file($file);
        foreach(glob($dir.'/*.webp.unserved') ?: [] as $marker)wp_delete_file($marker);
        if(is_file($dir.'/.lock'))wp_delete_file($dir.'/.lock');
        @rmdir($dir);
    }
}
