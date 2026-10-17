<?php
declare(strict_types=1);
define('ABSPATH',__DIR__);
function wp_json_encode($value) { return json_encode($value,JSON_THROW_ON_ERROR); }
require dirname(__DIR__).'/src/Providers/ProviderAgentTurn.php';
use PixflowDesign\WordPress\Providers\ProviderAgentTurn;
function verify($condition,$message) { if(!$condition)throw new RuntimeException($message); }
foreach(['openai','azure','senseaudio','aihubmix','ollama','anthropic','google'] as $protocol) {
    $base=['body'=>['messages'=>[['role'=>'user','content'=>'Build a section']], 'contents'=>[['role'=>'user','parts'=>[['text'=>'Build a section']]]]]];
    $call=ProviderAgentTurn::prepare($base,$protocol,[],[]);
    verify(!empty($call['body']['tools']),$protocol.' tools missing');
    $args=['name'=>'wordpress.run','arguments'=>['code'=>'return 42;']];
    $message=['role'=>'assistant','content'=>'Inspecting.','tool_calls'=>[['id'=>'one','type'=>'function','function'=>['name'=>'site_tool','arguments'=>wp_json_encode($args)]]]];
    $data=$protocol==='google'?['candidates'=>[['content'=>['role'=>'model','parts'=>[['text'=>'Inspecting.'],['thoughtSignature'=>'opaque-signature','functionCall'=>['name'=>'site_tool','args'=>$args]]]]]]]:($protocol==='anthropic'?['content'=>[['type'=>'text','text'=>'Inspecting.'],['type'=>'tool_use','id'=>'one','name'=>'site_tool','input'=>$args]]]:($protocol==='ollama'?['message'=>$message]:['choices'=>[['message'=>$message]]]));
    $result=ProviderAgentTurn::read($call,$protocol,$data);
    verify($result['text']==='Inspecting.' && $result['calls'][0]['input']===$args,$protocol.' did not preserve native tool call');
    $next=ProviderAgentTurn::prepare($base,$protocol,$result['turns'],[['id'=>$result['calls'][0]['id'],'result'=>['ok'=>true,'value'=>42]]]);
    $wire=wp_json_encode($next);
    verify(str_contains($wire,'42'),$protocol.' lost tool result');
    if($protocol==='google')verify(str_contains($wire,'opaque-signature'),'Gemini signature lost');
}
try { ProviderAgentTurn::read(['body'=>['messages'=>[]]],'openai',['choices'=>[['message'=>['role'=>'assistant','tool_calls'=>[['id'=>'bad','function'=>['name'=>'site_tool','arguments'=>'{broken']]]]]]]); throw new RuntimeException('Malformed JSON accepted'); } catch(JsonException $expected) {}
echo "All seven native BYOK protocol tool/result adapters passed.\n";
$base=['url'=>'https://api.openai.com/v1/chat/completions','body'=>['model'=>'gpt-6-luna','max_tokens'=>2048,'messages'=>[['role'=>'user','content'=>'What is this site called?']]]];
$call=ProviderAgentTurn::prepare($base,'openai-responses',[],[]);
verify($call['url']==='https://api.openai.com/v1/responses' && $call['body']['store']===false,'Responses route/storage changed');
$result=ProviderAgentTurn::read($call,'openai-responses',['output'=>[
    ['type'=>'reasoning','id'=>'reasoning','encrypted_content'=>'opaque'],
    ['type'=>'function_call','id'=>'fc','call_id'=>'call_1','name'=>'site_tool','arguments'=>wp_json_encode(['name'=>'wordpress.run','arguments'=>['code'=>'return 42;']])],
]]);
$next=ProviderAgentTurn::prepare($base,'openai-responses',$result['turns'],[['id'=>'call_1','result'=>42]]);
verify($next['body']['input'][1]['encrypted_content']==='opaque','Responses lost reasoning continuity');
verify($next['body']['input'][3]['call_id']==='call_1','Responses lost tool call identity');
foreach (['openai'=>['choices'=>[['finish_reason'=>'length']]],'openai-responses'=>['incomplete_details'=>['reason'=>'max_output_tokens']],'google'=>['candidates'=>[['finishReason'=>'MAX_TOKENS']]],'anthropic'=>['stop_reason'=>'max_tokens']] as $protocol=>$data) {
    try {ProviderAgentTurn::read($call,$protocol,$data);throw new LogicException('Incomplete provider response accepted');}
    catch(RuntimeException $expected) {verify(str_contains($expected->getMessage(),'token limit'),'Wrong incomplete response error');}
}
echo "Responses reasoning/tool continuity and incomplete-response tests passed.\n";
$image=['mimeType'=>'image/png','base64'=>base64_encode('fixture-image')];
foreach(['openai','azure','senseaudio','aihubmix','ollama','anthropic','google','openai-responses'] as $protocol) {
    $fixture=$base;
    $fixture['body']['contents']=[['role'=>'user','parts'=>[['text'=>'Inspect the image']]]];
    $first=ProviderAgentTurn::prepare($fixture,$protocol,[],[],[$image]);
    verify(str_contains(wp_json_encode($first),$image['base64']),$protocol.' lost initial image');
    $follow=ProviderAgentTurn::prepare($fixture,$protocol,[],[['id'=>'call_1','result'=>['ok'=>true],'images'=>[$image]]]);
    verify(str_contains(wp_json_encode($follow),$image['base64']),$protocol.' lost tool image');
}
foreach([['status'=>'failed','error'=>['message'=>'Provider unavailable']],['status'=>'incomplete','incomplete_details'=>['reason'=>'content_filter']]] as $failed) {
    try {ProviderAgentTurn::read($call,'openai-responses',$failed);throw new LogicException('Failed response accepted');}
    catch(RuntimeException $expected) {}
}
echo "All image inputs and failed-response handling passed.\n";

$modernBase = $base;
$modernBase['body']['max_completion_tokens'] = 2048;
unset($modernBase['body']['max_tokens']);
$modernResponse = ProviderAgentTurn::prepare($modernBase, 'openai-responses', [], []);
verify($modernResponse['body']['max_output_tokens'] === 2048, 'Responses must preserve the modern shared completion budget');
echo "Modern completion budget preserved for Responses.\n";
