<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

/** Reverse index of saved static placements. Unknown bindings use the ordinary cache lifetime. */
final class FitUsage {
    private const REF = '_pixflow_fit_usage';
    private const INDEX = '_pixflow_fit_indexed';
    private static array $pending = [];
    private static array $previous = [];
    private const BUILDER_DATA = ['_bricks_page_content_2','_bricks_page_header_2','_bricks_page_footer_2','_elementor_data'];

    public static function register(): void {
        add_action('wp_after_insert_post',static function ($id,$post,$update,$before) {
            if ($post->post_type==='revision' || $post->post_type==='attachment') return;
            if ($before && self::hasProfile($before->post_content) && !metadata_exists('post',$id,self::INDEX)) {
                $refs=[];
                self::collect(parse_blocks($before->post_content),$refs);
                self::$previous[$id]=(self::$previous[$id]??[])+$refs;
            }
            if (self::hasProfile($post->post_content) || ($before && self::hasProfile($before->post_content))) self::$pending[$id]=true;
        },10,4);
        foreach (['update','delete'] as $action) {
            add_filter($action.'_post_metadata',static function ($override,$id,$key) {
                if (in_array($key,self::BUILDER_DATA,true) && !isset(self::$previous[$id]) && !metadata_exists('post',$id,self::INDEX)) {
                    $post=get_post($id);
                    if ($post && $post->post_type!=='revision') self::$previous[$id]=self::document($post);
                }
                return $override;
            },10,3);
        }
        foreach (['added','updated','deleted'] as $action) {
            add_action($action.'_post_meta',static function ($meta,$id,$key) {
                if (in_array($key,self::BUILDER_DATA,true)) self::$pending[$id]=true;
            },10,3);
        }
        // Builders may save several fields in one request. Reconcile the final saved document.
        add_action('shutdown',[self::class,'flush']);
    }

    private static function hasProfile(string $text): bool {
        return str_contains($text,'pixflowDynamicFit') || str_contains($text,'data-pixflow-fit');
    }

    private static function collect(array $blocks,array &$refs): void {
        foreach ($blocks as $block) {
            $attrs=$block['attrs']??[];
            if (!empty($attrs['pixflowDynamicFit'])) {
                if (in_array($block['blockName'],['core/image','core/cover'],true) && empty($attrs['useFeaturedImage']) && empty($attrs['metadata']['bindings']))
                    {
                    $tag=new \WP_HTML_Tag_Processor($block['innerHTML']??'');
                    $tag->next_tag('img');
                    $id=(int)($attrs['id']??0) ?: DynamicFit::identify((string)$tag->get_attribute('src'));
                    self::placement($refs,$id,$attrs['pixflowDynamicFit']);
                }
                else $refs['?/'.$attrs['pixflowDynamicFit']]=true;
            }
            if (!empty($attrs['attributes']['data-pixflow-fit'])) self::placement($refs,(int)apply_filters('pixflow_fit_block_source',0,$block),$attrs['attributes']['data-pixflow-fit']);
            self::collect($block['innerBlocks']??[],$refs);
        }
    }

    public static function placement(array &$refs,int $id,$profile): void {
        $meta=$id ? wp_get_attachment_metadata($id) : null;
        if (empty($meta['width']) || empty($meta['height'])) { $refs['?/'.$profile]=true; return; }
        foreach (DynamicFit::widths($profile,$meta) as $width) $refs[$id.'/'.$width]=true;
    }

    private static function document($post): array {
        $id=$post->ID;
        $refs=[];
        if (self::hasProfile($post->post_content)) self::collect(parse_blocks($post->post_content),$refs);
        foreach (self::BUILDER_DATA as $key) {
            $data=get_post_meta($id,$key,true);
            if (!$data || !self::hasProfile(is_string($data)?$data:serialize($data))) continue;
            $placements=apply_filters('pixflow_fit_index_builder_data',null,$key,$data);
            $refs+=is_array($placements)?$placements:['?'=>true];
        }
        return $refs;
    }

    public static function flush(): void {
        $removed=[];
        foreach (array_keys(self::$pending) as $id) {
            $post=get_post($id);
            if (!$post || wp_is_post_revision($id) || wp_is_post_autosave($id)) continue;
            $refs=self::document($post);
            foreach (array_keys($refs) as $ref) {
                if (!preg_match('~^(\d+)/(\d+)$~D',$ref,$match)) continue;
                $meta=wp_get_attachment_metadata((int)$match[1]);
                if ($meta && (int)$match[2]>$meta['width']) DynamicFit::requestLarger((int)$match[1],(int)$match[2]);
            }
            $old=get_post_meta($id,self::REF,false);
            foreach (array_diff(array_keys($refs),$old) as $ref) add_post_meta($id,self::REF,$ref);
            foreach (array_diff(array_unique(array_merge($old,array_keys(self::$previous[$id]??[]))),array_keys($refs)) as $ref) {
                delete_post_meta($id,self::REF,$ref);
                if (preg_match('~^[1-9][0-9]*/[1-9][0-9]*$~D',$ref)) $removed[$ref]=true;
            }
            if ($refs || $old) update_post_meta($id,self::INDEX,'1');
        }
        self::$pending=[];
        self::$previous=[];
        foreach (array_keys($removed) as $ref) {
            [$id,$width]=array_map('intval',explode('/',$ref));
            DynamicFit::release($id,$width,!self::uncertain($ref));
        }
    }

    public static function saved(int $id,int $width): bool {
        global $wpdb;
        $found=$wpdb->get_var($wpdb->prepare("SELECT 1 FROM $wpdb->postmeta WHERE meta_key=%s AND meta_value=%s LIMIT 1",self::REF,$id.'/'.$width));
        return (bool)$found || (bool)$wpdb->last_error;
    }

    private static function uncertain(string $ref): bool {
        global $wpdb;
        $found=$wpdb->get_var($wpdb->prepare("SELECT 1 FROM $wpdb->postmeta WHERE meta_key=%s AND meta_value IN (%s,'?') LIMIT 1",self::REF,$ref));
        if ($found || $wpdb->last_error) return true;
        [$id,$width]=array_map('intval',explode('/',$ref));
        $meta=wp_get_attachment_metadata($id);
        if (!$meta) return true;
        $matches=static function ($key) use ($ref,$meta,$width) {
            return $key===$ref || $key==='?' || (str_starts_with($key,'?/') && in_array($width,DynamicFit::widths(substr($key,2),$meta),true));
        };
        $unknown=$wpdb->get_col($wpdb->prepare("SELECT DISTINCT meta_value FROM $wpdb->postmeta WHERE meta_key=%s AND meta_value LIKE '?/%%'",self::REF));
        if ($wpdb->last_error || array_filter($unknown,$matches)) return true;
        // Bound legacy discovery on busy sites. An incomplete inventory defers deletion.
        $ids=$wpdb->get_col($wpdb->prepare("SELECT p.ID FROM $wpdb->posts p WHERE p.post_type NOT IN ('revision','attachment') AND NOT EXISTS
          (SELECT 1 FROM $wpdb->postmeta i WHERE i.post_id=p.ID AND i.meta_key=%s)
          AND (p.post_content LIKE '%%pixflowDynamicFit%%' OR p.post_content LIKE '%%data-pixflow-fit%%' OR EXISTS
          (SELECT 1 FROM $wpdb->postmeta b WHERE b.post_id=p.ID AND b.meta_key IN ('_elementor_data','_bricks_page_content_2','_bricks_page_header_2','_bricks_page_footer_2') AND b.meta_value LIKE '%%pixflowDynamicFit%%')) LIMIT 33",self::INDEX));
        if ($wpdb->last_error || count($ids)>32) return true;
        foreach ($ids as $postId) {
            $post=get_post($postId);
            if (!$post || array_filter(array_keys(self::document($post)),$matches)) return true;
        }
        return false;
    }
}
