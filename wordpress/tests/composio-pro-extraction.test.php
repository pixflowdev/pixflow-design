<?php
declare(strict_types=1);
define('ABSPATH', dirname(__DIR__) . '/');
require dirname(__DIR__) . '/src/autoload.php';

use PixflowDesign\WordPress\Modules\ComposioAccess;
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Modules\SkillAccess;

function check(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function blocked(callable $call): void {
    try { $call(); throw new LogicException('Expected unavailable Pro feature.'); }
    catch (RuntimeException $error) { check(str_contains($error->getMessage(), 'active Pixflow Design Pro'), 'Clear missing/expired feature error'); }
}

check(!class_exists('PixflowDesign\\WordPress\\Providers\\ComposioApps'), 'Free cannot load the app implementation');
check(!class_exists('PixflowDesign\\WordPress\\Providers\\ComposioInference'), 'Free cannot load the inference implementation');
check(!ComposioAccess::available() && !ComposioAccess::configured(), 'Free status is unavailable without touching saved secrets');
check(!isset(FeatureContributions::catalogue()['composio.apps']), 'Free agent catalogue excludes connected-app tools');
check(SkillAccess::entry('composio')['edition'] === 'pro' && !SkillAccess::skill_allowed(['id'=>'composio']), 'Free cannot read the bundled Pro skill');
blocked(fn()=>ComposioAccess::call('composio.apps', [], true));
blocked(fn()=>ComposioAccess::summarize([], 'system', 'full retained history'));

// The core bridge must preserve its exact writable and context arguments.
$allowed=true;$calls=[];
FeatureContributions::authorize_using(static function()use(&$allowed):bool{return $allowed;});
FeatureContributions::add('composio', static fn(): string=>'', [
    'status'=>static fn():array=>['configured'=>true],
    'appCall'=>static function(string $tool,array $args,bool $writable)use(&$calls):array{$calls[]=[$tool,$args,$writable];return ['ok'=>true];},
    'summarize'=>static function(array $input,string $system,string $text)use(&$calls):string{$calls[]=[$input,$system,$text];return 'summary';},
    'tools'=>['composio.apps'=>['description'=>'Pro implementation']],
]);
check(ComposioAccess::configured(), 'Installed authorized contribution supplies status');
ComposioAccess::call('composio.execute', ['accountId'=>'saved'], false);
check($calls[0]===['composio.execute',['accountId'=>'saved'],false], 'Read-only session flag reaches the Pro action boundary');
check(ComposioAccess::summarize(['provider'=>'saved'],'system','retained history')==='summary', 'Working context uses the contributed provider');
check($calls[1]===[['provider'=>'saved'],'system','retained history'], 'Context inputs remain unchanged');
$allowed=false;$before=$calls;
check(!ComposioAccess::configured(), 'Expiry removes configured capability');
blocked(fn()=>ComposioAccess::call('composio.execute', [], true));
blocked(fn()=>ComposioAccess::summarize([], 'system', 'retained history'));
check($calls===$before, 'Expiry does not invoke stale providers or tools');
echo "Composio Free/Pro contribution boundary: passed\n";
