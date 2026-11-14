<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
function current_user_can(string $capability): bool { return false; }
foreach (['Modules/FeatureContributions', 'Modules/BuilderIntegrations', 'Modules/AdvancedSiteAccess', 'Modules/ImageGenerationAccess', 'Admin/WordPressAdminOperations', 'Admin/DirectCodeAccess', 'Admin/DirectSiteWorkspace'] as $file) require dirname(__DIR__) . '/src/' . $file . '.php';
use PixflowDesign\WordPress\Admin\DirectSiteWorkspace;
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
$allowed = true;
FeatureContributions::authorize_using(static function () use (&$allowed): bool { return $allowed; });
FeatureContributions::add('test-acf', static fn(): string => '', ['tools'=>['acf.fields.list'=>['description'=>'Installed fields']]]);
BuilderIntegrations::add('bricks', ['active'=>static fn():bool=>true,'help'=>static fn():array=>['native'=>'builder-specific guidance']]);
$site = new DirectSiteWorkspace();
$check=static function(bool $ok,string $message):void { if(!$ok)throw new RuntimeException($message); };
$all=$site->call('help',[],false);
$acf=$site->call('help',['topic'=>'acf'],false);
$check(array_keys($acf['tools'])===['acf.fields.list'],'Topic must not return the unrelated full catalogue.');
$wp=$site->call('help',['topic'=>'wordpress'],false);
$check(isset($wp['tools']['wordpress.posts.list'])&&!isset($wp['tools']['gutenberg.read']),'WordPress namespace is scoped.');
$check($site->call('help',['topic'=>'bricks'],false)===['native'=>'builder-specific guidance'],'Native builder help is preserved.');
$check(count($all['tools'])>count($wp['tools']),'No-topic discovery still returns all available tools.');
$check(count($site->call('help',['topic'=>'wordpress.posts.get'],false)['tools'])===1,'Exact operation returns one schema.');
$check($site->call('help',['topic'=>'missing'],false)['tools']===[],'Unknown topics do not silently repeat the full catalogue.');
$allowed=false;
$check($site->call('help',['topic'=>'acf'],false)['tools']===[],'Revoked features stay absent.');
$check(($site->call('help',['topic'=>'wordpress.run'],false)['allowed']??null)===false,'Raw-code authorization boundary remains enforced.');
echo "8 scoped help checks passed.\n";
