<?php
declare(strict_types=1);
define('ABSPATH', dirname(__DIR__) . '/');
define('PIXFLOW_DESIGN_PLUGIN_DIR', dirname(__DIR__) . '/');
require_once dirname(__DIR__) . '/src/autoload.php';
function get_option(string $key, mixed $default = false): mixed { return $default; }
function sanitize_key(string $value): string { return $value; }
function sanitize_text_field(string $value): string { return $value; }
$root=dirname(__DIR__).'/resources/mcp-skills';
$directory=$root.'/pixflow/frontend-design';
$catalog=new \PixflowDesign\WordPress\Admin\DirectSkillCatalog();
if (!\PixflowDesign\WordPress\Modules\SkillAccess::reference_allowed($directory . '/references/design-taste.md')) {
    throw new RuntimeException('Native Free guidance must use its declared identity, not a paid catalogue folder name');
}
foreach(['pixflow-frontend-design','pixflow-design-taste','pixflow-rendered-quality'] as $id){
 $result=$catalog->call('skills.list',['ids'=>[$id]]);
 if(empty($result['mentions'][0]['paths']))throw new RuntimeException('Missing frontend reference: '.$id);
}
foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory,FilesystemIterator::SKIP_DOTS)) as $file){
 if($file->getExtension()!=='md')continue;
 preg_match_all('/\]\(([^)]+)\)/',(string)file_get_contents($file->getPathname()),$links);
 foreach($links[1] as $link){
  if(preg_match('~^https?://~',$link))continue;
  $resolved=realpath(dirname($file->getPathname()).'/'.$link);
  if($resolved===false || !str_starts_with($resolved,realpath($root).DIRECTORY_SEPARATOR))throw new RuntimeException('Broken or external local reference: '.$link);
 }
}
$license=(string)file_get_contents($directory.'/LICENSE.taste-skill.txt');
if(!str_contains($license,'Copyright (c) 2026 Leonxlnx') || !str_contains($license,'Permission is hereby granted'))throw new RuntimeException('Missing upstream MIT notice');

$fixture = sys_get_temp_dir() . '/pixflow-skill-identity-' . bin2hex(random_bytes(6));
mkdir($fixture . '/frontend-design', 0700, true);
try {
    $manifest = $fixture . '/frontend-design/SKILL.md';
    file_put_contents($manifest, "---\nname: frontend-design\n---\n# Paid workflow\n");
    if (\PixflowDesign\WordPress\Modules\SkillAccess::reference_allowed($manifest)) throw new RuntimeException('Paid workflow became available through the native guidance identity fix');
    file_put_contents($manifest, "# Legacy workflow without a manifest name\n");
    if (\PixflowDesign\WordPress\Modules\SkillAccess::reference_allowed($manifest)) throw new RuntimeException('Legacy folder identity must retain paid authorization');
} finally {
    unlink($fixture . '/frontend-design/SKILL.md');
    rmdir($fixture . '/frontend-design');
    rmdir($fixture);
}
echo "Pixflow frontend references and attribution: ok\n";
