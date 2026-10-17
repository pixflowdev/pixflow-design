<?php
declare(strict_types=1);
define('ABSPATH',__DIR__.'/');
final class WP_Error {public function __construct(public string $code,public string $message,public array $data=[]) {}}
$GLOBALS['registeredHooks']=[];
function add_filter($name,...$args){$GLOBALS['registeredHooks'][]=$name;}
function add_action($name,...$args){$GLOBALS['registeredHooks'][]=$name;}
// An optional real core parser exercises the exact minimum-WordPress tokenizer
// without connecting to WordPress or a database.
if($processorRoot=getenv('PIXFLOW_TEST_WP_HTML_API'))foreach(['attribute-token','span','text-replacement','tag-processor']as$name)require $processorRoot.'/class-wp-html-'.$name.'.php';
require __DIR__.'/../src/autoload.php';
use PixflowDesign\WordPress\Admin\Gutenberg\GutenbergExecutableContent as Guard;
use PixflowDesign\WordPress\Modules\FeatureContributions;
$checks=0;
function check($ok,$message){if(!$ok)throw new RuntimeException($message);$GLOBALS['checks']++;}
function denied(callable $fn){try{$fn();}catch(RuntimeException){return true;}return false;}
function block(string $html):array{return ['name'=>'core/html','attributes'=>['content'=>$html],'innerBlocks'=>[]];}
foreach(['<script>alert(1)</script>','<img src=x onerror="alert(1)">','<a href="java&#x73;cript:alert(1)">x</a>','<?php dangerous(); ?>']as$html){
    check(denied(fn()=>Guard::assert_live('gutenberg.insert',['blocks'=>[block($html)]])),'Free insertion rejects new executable markup');
    check(denied(fn()=>Guard::assert_live('gutenberg.update',['attributes'=>['content'=>$html]])),'Free update rejects changed executable markup');
    check(Guard::tree_error([block($html)],'<p>Old safe content</p>')instanceof WP_Error,'Full tree cannot introduce executable fragments');
    check(Guard::content_error($html,'<p>Old safe content</p>')instanceof WP_Error,'Prepared content cannot introduce executable fragments');
}
check(denied(fn()=>Guard::assert_live('gutenberg.update',['attributes'=>['url'=>"java\nscript:alert(1)"]])),'Control characters cannot hide an executable URL');
check(denied(fn()=>Guard::assert_live('gutenberg.update',['attributes'=>(object)['style'=>(object)['href'=>'javascript:alert(1)']]])),'Nested JSON objects do not bypass URL checks');
$escaped='&lt;script&gt;alert(1)&lt;/script&gt; &lt;?php echo 1; ?&gt;';
Guard::assert_live('gutenberg.insert',['blocks'=>[['name'=>'core/code','attributes'=>['content'=>$escaped]]]]);
check(Guard::tree_error([['name'=>'core/code','attributes'=>['content'=>$escaped]]],'')===null,'Escaped native code examples remain text');
Guard::assert_live('gutenberg.insert',['blocks'=>[block('<p>This article explains javascript: URLs.</p>')]]);
check(true,'Mentioning a URL scheme in ordinary text is not executable markup');
$script='<script data-owner="existing">window.existing = 1;</script>';
$existing=$script.'<p>Old paragraph</p>';
$proposed=[block($script),['name'=>'core/paragraph','attributes'=>['content'=>'Updated paragraph','className'=>'same-class','style'=>['spacing'=>['padding'=>['top'=>'var:preset|spacing|40']]],'metadata'=>['name'=>'preserved']]]];
$copy=$proposed;
check(Guard::tree_error($proposed,$existing)===null,'An unrelated edit preserves an existing executable fragment');
check($proposed===$copy,'Guard never sanitizes or mutates a document, attributes or references');
check(Guard::content_error($script.'<p>Updated paragraph</p>',$existing)===null,'Write boundary preserves the existing script byte-for-byte');
check(Guard::tree_error([block(str_replace('= 1','= 2',$script))],$existing)instanceof WP_Error,'Changing an existing script is new executable authoring');
check(Guard::tree_error([block($script),block($script)],$existing)instanceof WP_Error,'Duplicating an existing executable fragment is new authoring');
if(class_exists('WP_HTML_Tag_Processor')){
    $comment='<!-- <script data-owner="existing">window.existing = 1;</script> -->';
    check(Guard::content_error($comment,$comment)===null,'HTML comments do not become executable code');
    check(Guard::tree_error([block($script),block($script)],$comment.$script)instanceof WP_Error,'A comment cannot inflate the allowance for existing executable scripts');
    check(Guard::content_error('<script type="application/ld+json">{"@type":"Article"}</script>','')===null,'Inert JSON-LD remains ordinary structured content');
    check(denied(fn()=>Guard::assert_live('gutenberg.insert',['blocks'=>[block('<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>')]])),'Executable nested HTML in srcdoc is rejected');
}
Guard::assert_live('gutenberg.update',['attributes'=>['className'=>'ordinary-edit']]);
Guard::assert_live('gutenberg.save',[]);
check(true,'Live ordinary attribute updates and saving do not scan or alter unrelated existing scripts');
FeatureContributions::add('advanced-site-tools',static fn():string=>'', ['allowsExecutableContent'=>static fn():bool=>$GLOBALS['rawAuthority']??false]);
check(denied(fn()=>Guard::assert_live('gutenberg.insert',['blocks'=>[block('<script>code()</script>')]])),'Pro registration alone cannot grant executable authority');
$GLOBALS['rawAuthority']=true;
Guard::assert_live('gutenberg.insert',['blocks'=>[block('<script>code()</script>')]]);
check(Guard::content_error('<script>code()</script>','')===null,'Active Pro with current raw-code authority retains its existing behavior');
FeatureContributions::authorize_using(static fn():bool=>false);
check(denied(fn()=>Guard::assert_live('gutenberg.insert',['blocks'=>[block('<script>code()</script>')]])),'Expired Pro is rechecked at execution time');
check($GLOBALS['registeredHooks']===[],'Guard installs no native WordPress content filter');
echo 'Gutenberg executable-content checks passed: '.$checks."\n";
