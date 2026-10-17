<?php
declare(strict_types=1);
define('ABSPATH',__DIR__);
require __DIR__.'/../src/autoload.php';
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergExtensions;
use PixflowDesign\WordPress\Modules\BuilderIntegrations;
BuilderIntegrations::add('generateblocks',['active'=>static fn()=>true,'blockAdapter'=>new class {public function support(string $name):array{return ['allowed'=>true];}}]);
// Direct tool payloads preserve JSON objects; parsed WordPress blocks are arrays.
GutenbergExtensions::assert_tree([(object)['name'=>'generateblocks/element','innerBlocks'=>[(object)['name'=>'generateblocks/text']]]]);
GutenbergExtensions::assert_tree([['blockName'=>'generateblocks/element','innerBlocks'=>[['blockName'=>'core/paragraph']]]]);
echo "Gutenberg extension boundary accepts JSON and parsed block trees.\n";
