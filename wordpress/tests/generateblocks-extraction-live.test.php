<?php
declare(strict_types=1);
if (!defined('ABSPATH') || !in_array(parse_url(home_url(), PHP_URL_HOST), ['127.0.0.1','localhost'], true)) throw new RuntimeException('Local QA only.');
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergExtensions;
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergEntity;
use PixflowDesign\WordPress\Admin\DirectSiteWorkspace;
use PixflowDesign\WordPress\Admin\DirectSkillCatalog;
$expected=($argv[1]??'')==='pro';$checks=0;
$check=static function(bool $ok,string $message)use(&$checks){if(!$ok)throw new RuntimeException($message);$checks++;};
$check(defined('GENERATEBLOCKS_VERSION'),'Native GenerateBlocks stays active.');
$check(BuilderIntegrations::active('generateblocks')===$expected,'Module availability follows Pro.');
$help=(new DirectSiteWorkspace())->help();
$check(isset($help['tools']['gutenberg.styles'])===$expected,'Shared styles tools follow Pro.');
$check(isset($help['tools']['gutenberg.read'],$help['tools']['gutenberg.insert']),'Core Gutenberg remains available.');
$skills=(new DirectSkillCatalog())->call('skills.list',['query'=>'generateblocks/']);
$check((count($skills['paths'])>0)===$expected,'References follow Pro.');
try{(new DirectSkillCatalog())->call('skills.read',['path'=>'generateblocks/generateblocks.md']);$readable=true;}catch(Throwable){$readable=false;}
$check($readable===$expected,'Direct references cannot bypass absent Pro.');
$public=(new \PixflowDesign\WordPress\Mcp\PromptSkillCatalog())->response();
$check(in_array('wp-admin-integration-generateblocks',array_column($public['branches'],'id'),true)===$expected,'Cached skill branch follows Pro.');
$check(in_array('gblocks_form',GutenbergEntity::shared_types(),true)===$expected,'Shared resources follow Pro.');
try{GutenbergExtensions::assert_tree([['name'=>'generateblocks/element','innerBlocks'=>[]]]);$allowed=true;}catch(Throwable){$allowed=false;}
$check($allowed===$expected,'Native GB block edits follow Pro.');
GutenbergExtensions::assert_tree([['name'=>'core/paragraph']]);$checks++;
try{GutenbergExtensions::assert_entity('gblocks_overlay');$entity=true;}catch(Throwable){$entity=false;}
$check($entity===$expected,'Shared entities cannot bypass absent Pro.');
$check(class_exists(\PixflowDesign\WordPress\GenerateBlocks\GenerateBlocksModule::class,false)===$expected,'Implementation is absent in Free.');
echo json_encode(['mode'=>$expected?'core-plus-pro':'core-only','checks'=>$checks,'status'=>'passed']).PHP_EOL;
