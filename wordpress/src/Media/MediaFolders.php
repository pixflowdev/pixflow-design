<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) exit;

/** Virtual folders only: attachment files, URLs and other taxonomies are never changed. */
final class MediaFolders
{
    public const TAXONOMY = 'pixflow_media_folder';

    public static function register(): void
    {
        register_taxonomy(self::TAXONOMY, ['attachment'], [
            'label'=>'Pixflow folders', 'public'=>false, 'hierarchical'=>true,
            'show_ui'=>false, 'show_in_rest'=>false, 'rewrite'=>false,
            'capabilities'=>['manage_terms'=>'upload_files','edit_terms'=>'upload_files','delete_terms'=>'upload_files','assign_terms'=>'upload_files'],
            'update_count_callback'=>'_update_generic_term_count',
        ]);
    }

    private static function taxonomy(string $provider, bool $write = false): string|\WP_Error
    {
        if (!current_user_can('upload_files')) return self::error('You cannot organise media.', 403);
        if ($provider === 'pixflow') return self::TAXONOMY;
        if ($provider !== 'happyfiles') return self::error('Unknown folder source.');
        if (!defined('HAPPYFILES_FILE') || basename(HAPPYFILES_FILE) !== 'happyfiles-pro.php'
            || !defined('HAPPYFILES_TAXONOMY') || !taxonomy_exists(HAPPYFILES_TAXONOMY))
            return self::error('HappyFiles is unavailable. Its folders and media assignments are preserved.', 409);
        if (class_exists('HappyFiles\\User')) \HappyFiles\User::get_folder_access();
        if (!class_exists('HappyFiles\\User') || \HappyFiles\User::$folder_access === 'none'
            || ($write && \HappyFiles\User::$folder_access !== 'full')) return self::error('Your HappyFiles folder permissions do not allow this action.', 403);
        return HAPPYFILES_TAXONOMY;
    }

    private static function error(string $message, int $status = 400): \WP_Error
    {
        return new \WP_Error('media_folder', $message, ['status'=>$status]);
    }

    public static function read(string $provider): array|\WP_Error
    {
        $taxonomy=self::taxonomy($provider);
        if (is_wp_error($taxonomy)) return $taxonomy;
        $terms=get_terms(['taxonomy'=>$taxonomy,'hide_empty'=>false,'orderby'=>'name']);
        if (is_wp_error($terms)) return $terms;
        $folders=array_map(static fn($term)=>[
            'id'=>(int)$term->term_id,'name'=>$term->name,'parent'=>(int)$term->parent,'count'=>(int)$term->count,
            'position'=>($position=get_term_meta($term->term_id,$provider==='happyfiles'?'happyfiles_position':'pixflow_folder_position',true))===''?PHP_INT_MAX:(int)$position,
        ],$terms);
        usort($folders,static fn($a,$b)=>($a['position']<=>$b['position']) ?: strnatcasecmp($a['name'],$b['name']));
        return ['folders'=>$folders,'provider'=>$provider,'writable'=>!is_wp_error(self::taxonomy($provider,true)),
            'happyfilesAvailable'=>!is_wp_error(self::taxonomy('happyfiles')),
            'multiple'=>$provider==='happyfiles' && class_exists('HappyFiles\\Settings') && \HappyFiles\Settings::$multiple_folders];
    }

    public static function filter(string $provider, int $folder): array|\WP_Error
    {
        $taxonomy=self::taxonomy($provider);
        if (is_wp_error($taxonomy)) return $taxonomy;
        if ($folder<0) return self::error('Invalid folder ID.');
        if ($folder>0 && !term_exists($folder,$taxonomy)) return self::error('This folder no longer exists.',404);
        return [$folder===0 ? ['taxonomy'=>$taxonomy,'operator'=>'NOT EXISTS']
            : ['taxonomy'=>$taxonomy,'field'=>'term_id','terms'=>[$folder],'include_children'=>false]];
    }

    public static function change(array $data): array|\WP_Error
    {
        foreach (['provider','action','name'] as $key) if (isset($data[$key]) && !is_string($data[$key])) return self::error('Invalid folder request.');
        foreach (['id','parent','beforeId'] as $key) if (isset($data[$key]) && (!is_int($data[$key]) || $data[$key]<0)) return self::error('Folder IDs must be nonnegative integers.');
        if (isset($data['append']) && !is_bool($data['append'])) return self::error('Invalid assignment mode.');
        if (isset($data['attachmentIds'])) {
            if (!is_array($data['attachmentIds']) || !array_is_list($data['attachmentIds'])) return self::error('Media IDs must be a list.');
            foreach ($data['attachmentIds'] as $attachment) if (!is_int($attachment) || $attachment<1) return self::error('Invalid media ID.');
        }
        $provider=(string)($data['provider']??'');
        $taxonomy=self::taxonomy($provider,true);
        if (is_wp_error($taxonomy)) return $taxonomy;
        $action=(string)($data['action']??'');
        $id=absint($data['id']??0);
        if ($action==='reorder') {
            $before=absint($data['beforeId']??0);
            $folder=get_term($id,$taxonomy);
            if (!$id || !$folder || is_wp_error($folder)) return self::error('This folder no longer exists.',404);
            $inventory=self::read($provider);
            if (is_wp_error($inventory)) return $inventory;
            $parent=$data['parent']??(int)$folder->parent;
            if ($parent && !term_exists($parent,$taxonomy)) return self::error('The parent folder no longer exists.',404);
            if ($parent===$id || in_array($id,array_map('intval',get_ancestors($parent,$taxonomy,'taxonomy')),true)) return self::error('A folder cannot be moved inside itself.');
            $siblings=array_values(array_filter($inventory['folders'],static fn($item)=>$item['parent']===$parent));
            $ids=array_column($siblings,'id');
            if ($before===$id || ($before && !in_array($before,$ids,true))) return self::error('Choose another folder at the same level.');
            $ids=array_values(array_filter($ids,static fn($item)=>$item!==$id));
            $index=$before?array_search($before,$ids,true):count($ids);
            array_splice($ids,$index,0,[$id]);
            if ($parent!==(int)$folder->parent) {
                $result=wp_update_term($id,$taxonomy,['parent'=>$parent]);
                if (is_wp_error($result)) return $result;
            }
            foreach ($ids as $position=>$termId) {
                $result=update_term_meta($termId,$provider==='happyfiles'?'happyfiles_position':'pixflow_folder_position',$position);
                if (is_wp_error($result)) return $result;
            }
        } elseif ($action==='assign') {
            if ($id && !term_exists($id,$taxonomy)) return self::error('This folder no longer exists.',404);
            $ids=array_values(array_unique(array_map('absint',(array)($data['attachmentIds']??[]))));
            if (!$ids || count($ids)>100) return self::error('Choose between 1 and 100 media items.');
            foreach ($ids as $attachment) if (get_post_type($attachment)!=='attachment' || !current_user_can('edit_post',$attachment))
                return self::error('You cannot organise one of these media items.',403);
            $append=!empty($data['append']);
            if ($append && ($provider!=='happyfiles' || !\HappyFiles\Settings::$multiple_folders || !$id)) return self::error('Multiple folder assignments are unavailable.');
            $changed=[];
            foreach ($ids as $attachment) {
                $result=wp_set_object_terms($attachment,$id?[$id]:[],$taxonomy,$append);
                if (is_wp_error($result)) return new \WP_Error('media_folder_partial','Some media could not be moved. Refresh before retrying.',['status'=>500,'changed'=>$changed]);
                $changed[]=$attachment;
            }
        } elseif ($action==='create' || $action==='update') {
            $name=sanitize_text_field((string)($data['name']??''));
            $parent=absint($data['parent']??0);
            $length=preg_match_all('/./us',$name);
            if ($name==='' || $length===false || $length>120) return self::error('Enter a folder name of up to 120 characters.');
            if ($parent && !term_exists($parent,$taxonomy)) return self::error('The parent folder no longer exists.',404);
            if ($action==='update') {
                if (!$id || !term_exists($id,$taxonomy)) return self::error('This folder no longer exists.',404);
                if ($parent===$id || in_array($id,array_map('intval',get_ancestors($parent,$taxonomy,'taxonomy')),true)) return self::error('A folder cannot be moved inside itself.');
                $result=wp_update_term($id,$taxonomy,['name'=>$name,'parent'=>$parent]);
            } else $result=wp_insert_term($name,$taxonomy,['parent'=>$parent]);
            if (is_wp_error($result)) return $result;
        } elseif ($action==='delete') {
            if (!$id || !term_exists($id,$taxonomy)) return self::error('This folder no longer exists.',404);
            $children=get_terms(['taxonomy'=>$taxonomy,'parent'=>$id,'hide_empty'=>false,'number'=>1]);
            if (is_wp_error($children)) return $children;
            if ($children) return self::error('Move or remove the subfolders first. Media files will be kept.');
            $result=wp_delete_term($id,$taxonomy);
            if (is_wp_error($result)) return $result;
        } else return self::error('Unknown folder action.');
        return self::read($provider);
    }
}
