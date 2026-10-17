<?php
declare(strict_types=1);
define('ABSPATH', __DIR__); define('ELEMENTOR_VERSION', '3.36.0');
require dirname(__DIR__) . '/src/Fonts/SavedFontAssets.php';
require dirname(__DIR__) . '/src/Assets/SavedBuilderStyles.php';
$options = ['elementor_active_kit'=>42, 'pixflow_design_elementor_system_state'=>[42=>['css'=>':root{--pds-primary:#123456}'],43=>['css'=>'.other{}']],
 'pixflow_design_elementor_google_fonts'=>['inter'=>['family'=>'Inter','enabled'=>true,'weightRange'=>['min'=>100,'max'=>900],'files'=>[['attachmentId'=>8,'variant'=>'italic']]],'disabled'=>['family'=>'Disabled','enabled'=>false,'files'=>[['attachmentId'=>9,'variant'=>'regular']]]]];
$before=serialize($options); $styles=[]; $hooks=[];
function get_option($key,$default=[]){return $GLOBALS['options'][$key]??$default;}
function wp_get_attachment_url($id){return 'https://example.test/uploads/'.$id.'.woff2';}
function add_action($hook,$callback,$priority=10){$GLOBALS['hooks'][$hook][$priority][]=$callback;}
function add_filter(...$args){}
function wp_register_style(...$args){}
function wp_enqueue_style(...$args){}
function wp_add_inline_style($handle,$css){$GLOBALS['styles'][$handle]=$css;}
function check($ok,$message){if(!$ok)throw new RuntimeException($message);}
use PixflowDesign\WordPress\Fonts\SavedFontAssets;
use PixflowDesign\WordPress\Assets\SavedBuilderStyles;
SavedFontAssets::register();SavedBuilderStyles::register();
check(isset($hooks['wp_enqueue_scripts'][25],$hooks['wp_enqueue_scripts'][30]),'Original font/style cascade order preserved');
SavedFontAssets::enqueue_elementor();SavedBuilderStyles::enqueue();
check(str_contains($styles['pixflow-elementor-fonts'],'font-weight:100 900;font-style:italic'),'Variable italic font survives without Pro');
check(!str_contains($styles['pixflow-elementor-fonts'],'Disabled'),'Disabled faces stay disabled');
check($styles['pixflow-elementor-design-system']===':root{--pds-primary:#123456}','Only active Kit CSS renders');
check(SavedFontAssets::uses_attachment(8)&&SavedFontAssets::uses_attachment(9),'Active and disabled references remain protected');
check(serialize($options)===$before,'Rendering cannot change saved settings');
check(!class_exists('PixflowDesign\\WordPress\\Elementor\\ElementorModule',false),'Rendering does not load Pro');
echo "Saved builder assets: 7 core-only preservation checks passed\n";
