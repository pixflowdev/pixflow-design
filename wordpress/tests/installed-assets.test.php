<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Icons {
    final class IconMediaCleanup {
        public static function run($id,$sets): array { $GLOBALS['cleanup']=[$id,$sets]; return ['retained'=>1]; }
        public static function message($report): string {return 'Referenced icons retained.';}
    }
}
namespace {
define('ABSPATH',__DIR__);
$options=[];$admin=true;$writes=[];
function get_option($key,$default=false){return $GLOBALS['options'][$key]??$default;}
function update_option($key,$value,$autoload=false){$GLOBALS['writes'][]=$key;$GLOBALS['options'][$key]=$value;return true;}
function current_user_can($cap){return $GLOBALS['admin'] && $cap==='manage_options';}
function get_post($id){return (object)['ID'=>$id];}
function get_post_meta($id,$key,$single){return 'another-owner';}
function wp_get_attachment_url($id){return 'https://site.test/font-'.$id.'.woff2';}
function check($ok,$message){if(!$ok)throw new \RuntimeException($message);echo "PASS $message\n";}
function rejects($fn){try{$fn();throw new \LogicException('Unexpected success');}catch(\RuntimeException $e){if($e instanceof \LogicException)throw $e;}}
require __DIR__.'/../src/Modules/BuilderIntegrations.php';
require __DIR__.'/../src/Fonts/WordPressFontManager.php';
require __DIR__.'/../src/Assets/InstalledAssets.php';
use PixflowDesign\WordPress\Assets\InstalledAssets as Assets;
use PixflowDesign\WordPress\Fonts\WordPressFontManager as Fonts;
$font=['id'=>'work-sans','family'=>'Work Sans','slug'=>'pixflow-font-work-sans','enabled'=>true,'weightRange'=>['min'=>100,'max'=>900],'files'=>[['variant'=>'regular','attachmentId'=>7],['variant'=>'italic','attachmentId'=>8]]];
$options=['pixflow_design_wordpress_google_fonts'=>['work-sans'=>$font],'pixflow_design_etch_google_fonts'=>['work-sans'=>$font],'pixflow_ai_icon_sets_installed'=>['qa'=>['name'=>'QA','icons'=>[['attachment_id'=>9]]],'keep'=>['name'=>'Keep','icons'=>[['attachment_id'=>10]]]]];
$before=$options;$css=Fonts::css();
check(count(Assets::state()['items'])===4 && $options===$before && $writes===[], 'Listing saved assets performs no downloads or writes');
check(str_contains($css,'font-weight:100 900')&&str_contains($css,'font-style:italic'),'Variable and italic faces render without Pro');
check(!method_exists(Fonts::class,'install')&&!method_exists(Fonts::class,'toggle'),'Free font renderer has no install or toggle capability');
$admin=false;rejects(fn()=>Assets::remove(['kind'=>'font','builder'=>'wordpress','id'=>'work-sans']));check($options===$before,'Unauthorised removal preserves every registration');$admin=true;
rejects(fn()=>Assets::remove(['kind'=>'font','builder'=>'../bad','id'=>'work-sans']));check($options===$before,'Invalid builder cannot address arbitrary storage');
Assets::remove(['kind'=>'font','builder'=>'wordpress','id'=>'work-sans']);
check(Fonts::records()===[]&&Fonts::css()==='','Free removes its own font registration');
check($options['pixflow_design_etch_google_fonts']===$before['pixflow_design_etch_google_fonts'],'Other builder registrations stay unchanged');
check($options['pixflow_design_font_registration_history']['wordpress']['work-sans']===true,'Removal is remembered for Pro reactivation');
Assets::remove(['kind'=>'icons','id'=>'qa']);
check(!isset($options['pixflow_ai_icon_sets_installed']['qa'])&&isset($options['pixflow_ai_icon_sets_installed']['keep']),'Icon removal preserves unrelated sets');
check($GLOBALS['cleanup'][0]==='qa'&&isset($GLOBALS['cleanup'][1]['keep']),'Icon removal delegates to conservative shared usage protection');
$options['pixflow_ai_google_fonts_installed']['foreign']=['family'=>'Foreign','postId'=>42];
$before=$options;
rejects(fn()=>Assets::remove(['kind'=>'font','builder'=>'bricks','id'=>'foreign']));
check($options===$before,'Foreign Bricks registration and removal history remain untouched');
}
