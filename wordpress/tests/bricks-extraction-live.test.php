<?php
declare(strict_types=1);
if (!defined('ABSPATH') || !in_array(parse_url(home_url(), PHP_URL_HOST), ['127.0.0.1','localhost'],true)) throw new RuntimeException('Local QA only.');
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
$expected=($argv[1]??'')==='pro';$checks=0;
$check=static function(bool $ok,string $message)use(&$checks):void {if(!$ok)throw new RuntimeException($message);$checks++;};
$check(get_template()==='bricks','Keep the real Bricks theme active for this test.');
$check(BuilderIntegrations::active('bricks')===$expected,'Bricks integration follows Pro availability.');
$help=(new \PixflowDesign\WordPress\Admin\DirectSiteWorkspace())->help();
$check(isset($help['tools']['bricks.run'])===$expected,'Bricks execution is contributed only by Pro.');
$check(isset($help['tools']['gutenberg.read'],$help['tools']['wordpress.posts.list']),'Free WordPress/Gutenberg tools remain.');
$skills=(new \PixflowDesign\WordPress\Admin\DirectSkillCatalog())->call('skills.list',['query'=>'bricks/']);
$check((count($skills['paths'])>0)===$expected,'Bricks references follow Pro.');
try{(new \PixflowDesign\WordPress\Admin\DirectSkillCatalog())->call('skills.read',['path'=>'bricks/operations/live-builder.md']);$read=true;}catch(Throwable){$read=false;}
$check($read===$expected,'Direct reads cannot bypass Pro.');
try{new \PixflowDesign\WordPress\Admin\DirectCanvasRelay('bricks');$relay=true;}catch(Throwable){$relay=false;}
$check($relay===$expected,'Live Bricks mailbox cannot bypass Pro.');
$routes=rest_get_server()->get_routes();
foreach(['/bricks/content','/bricks-mcp/status','/framework/state','/templates/list','/cookie-consent/scan','/pixflow-mcp/build-in-bricks-authority'] as $suffix){
 $present=isset($routes['/pixflow-design/v1'.$suffix]);
 // Template discovery endpoint names are taken from the installed route table below.
 $check($present===$expected,'Route ownership: '.$suffix);
}
$check(class_exists(\PixflowDesign\WordPress\Bricks\BricksModule::class,false)===$expected,'Core never loads the absent module.');
$check(class_exists(\PixflowDesign\WordPress\Bricks\Extensions\TwoFactorAuthentication\Integration::class,false)===$expected,'2FA registration is Pro-owned.');
$check(is_array((new \PixflowDesign\WordPress\Framework\DesignSystem\SavedDesignSystems())->all()),'Saved profiles remain readable with and without Pro.');
$check(class_exists(\PixflowDesign\WordPress\Fonts\SavedFontAssets::class),'Saved font rendering remains in Free.');
$check(class_exists(\PixflowDesign\WordPress\Icons\WordPressIconLibrary::class),'Saved icon rendering remains in Free.');
$assets=new \PixflowDesign\WordPress\Assets\AssetRegistrar(new \PixflowDesign\WordPress\Bridge\BridgeConfig());
$config=(new ReflectionMethod($assets,'build_wp_admin_config'))->invoke($assets,[]);
$check(($config['bricksIntegrationActive']??false)===$expected,'Shared panel exposes the correct settings availability.');
$runtime=(new ReflectionMethod(\PixflowDesign\WordPress\Http\RestController::class,'wordpress_runtime_config'))->invoke(new \PixflowDesign\WordPress\Http\RestController());
$check(($runtime['bricksIntegrationActive']??null)===$expected,'Refreshed runtime explicitly reports Bricks availability, including false.');
$check(class_exists(\PixflowDesign\WordPress\Icons\IconSetManager::class)===$expected,'Icon management is supplied only by Pro.');
$edit_url=apply_filters('pixflow_design_sitemap_edit_url',admin_url('post.php?post=3108&action=edit'),3108);
$check(str_contains($edit_url,'bricks=run')===$expected,'Sitemap editor links follow the installed integration.');
if($expected){
 $profile=\PixflowDesign\WordPress\Framework\DesignSystem\DesignSystemDefaults::default_profile();
 $css=(new \PixflowDesign\WordPress\Framework\DesignSystem\PortableDesignSystemCompiler())->compile($profile);
 $check(str_contains($css,'--pds-')&&!str_contains($css,'.bricks'),'Pro retains portable design-system compilation.');
 $icons=\PixflowDesign\WordPress\Icons\IconSetManager::get_shell_config();
 $check(isset($icons['installedSets'],$icons['savedSubsets'],$icons['bricksSetId']),'Pro retains installed icon state and Bricks metadata.');
 $state=\PixflowDesign\WordPress\Fonts\GoogleFontManager::get_shell_config('bricks');$check(is_array($state),'Pro font facade loads.');
 $check(is_array(\PixflowDesign\WordPress\Icons\BricksIconLibrary::get_bricks_icon_registry()),'Pro icon facade loads.');
 $controller=new \PixflowDesign\WordPress\Http\BricksRestController();
 $check(is_array((new \PixflowDesign\WordPress\Framework\DesignSystem\DesignSystemService())->state()),'Legacy framework profiles load from Pro.');
 $profile=(new \PixflowDesign\WordPress\Framework\DesignSystem\BricksDesignSystemProfileStore())->get('pixflow');
 $check($profile===null||is_array($profile),'Bricks colour controls use the Pro profile reader.');
}
echo json_encode(['mode'=>$expected?'free-plus-pro':'free-only','checks'=>$checks,'skills'=>count($skills['paths']),'status'=>'passed']).PHP_EOL;
