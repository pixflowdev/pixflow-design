<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
class WP_Error { public function __construct(public string $code, public string $message) {} }
require_once dirname(__DIR__) . '/src/License/CentralArtifacts.php';
use PixflowDesign\WordPress\License\CentralArtifacts;
function check($value, $message) { if (!$value) throw new RuntimeException($message); }
$current = ['artifact_id'=>'plugin-116','type'=>'plugin','slug'=>'pixflow-design','channel'=>'stable','current'=>true,'version'=>'1.1.6'];
$old = array_merge($current, ['artifact_id'=>'plugin-115','current'=>false,'version'=>'1.1.5']);
check(CentralArtifacts::select_current([$old,$current],'plugin','pixflow-design') === $current, 'Select the exact current stable product');
check(CentralArtifacts::select_current([$current,$current],'plugin','pixflow-design') instanceof WP_Error, 'Ambiguous releases must not be downloaded');
check(CentralArtifacts::select_current([$current],'resource-pack','plugins') instanceof WP_Error, 'Never infer product from a filename or display name');
check(CentralArtifacts::select_current([array_merge($current,['channel'=>'beta'])],'plugin','pixflow-design') instanceof WP_Error, 'Never auto-promote beta');
echo "Central artifact selection passed\n";
