<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require dirname(__DIR__) . '/src/Modules/FeatureContributions.php';
require dirname(__DIR__) . '/src/Admin/WordPressAdminOperations.php';
require dirname(__DIR__) . '/src/Admin/DirectCodeAccess.php';
require dirname(__DIR__) . '/src/Admin/DirectSiteWorkspace.php';
use PixflowDesign\WordPress\Modules\FeatureContributions;
use PixflowDesign\WordPress\Admin\DirectSiteWorkspace;
$checks = 0;
function check(bool $value, string $label): void { global $checks; ++$checks; if (!$value) throw new RuntimeException($label); }
$allowed = true;
FeatureContributions::authorize_using(static function () use (&$allowed): bool { return $allowed; });
$calls = [];
FeatureContributions::add('test-feature', static fn(): string => '', [
    'tools' => ['article.get' => [], 'article.save' => []],
    'directSiteCall' => static function ($tool, $args, $writable) use (&$calls) {
        $calls[] = [$tool, $args, $writable];
        if ($tool === 'article.save' && !$writable) throw new RuntimeException('Read-only feature session.');
        return ['tool' => $tool, 'id' => $args['id'] ?? null];
    },
]);
$site = new DirectSiteWorkspace();
check($site->call('article.get', ['id'=>'draft-1'], false) === ['tool'=>'article.get','id'=>'draft-1'], 'Registered read tool dispatches in a read-only session.');
check($site->call('article.save', ['id'=>'draft-1'], true)['id'] === 'draft-1', 'Registered mutation dispatches.');
$denied = false;
try { $site->call('article.save', [], false); } catch (RuntimeException $e) { $denied = $e->getMessage() === 'Read-only feature session.'; }
check($denied, 'Feature receives and enforces the actual writable state.');
check($calls[0][2] === false && $calls[1][2] === true, 'Writable state is not inferred from a tool name.');
$count = count($calls);
try { $site->call('article.unknown', [], true); } catch (RuntimeException) {}
check(count($calls) === $count, 'Unregistered operations cannot reach the callback.');
$allowed = false;
try { $site->call('article.get', [], true); } catch (RuntimeException) {}
check(count($calls) === $count, 'Revoked features cannot execute.');
echo "$checks feature site-tool checks passed.\n";
