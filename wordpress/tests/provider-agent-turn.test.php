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
    $bad=$data;
    if($protocol==='google')$bad['candidates'][0]['content']['parts'][1]['functionCall']['args']['arguments']='invalid';
    elseif($protocol==='anthropic')$bad['content'][1]['input']['arguments']='invalid';
    elseif($protocol==='ollama')$bad['message']['tool_calls'][0]['function']['arguments']='{broken';
    else $bad['choices'][0]['message']['tool_calls'][0]['function']['arguments']='{broken';
    $invalid=ProviderAgentTurn::read($call,$protocol,$bad);
    verify(!empty($invalid['calls'][0]['validationError']),$protocol.' must allow corrective feedback without dispatch');
    $feedback=ProviderAgentTurn::prepare($base,$protocol,$invalid['turns'],[['id'=>$invalid['calls'][0]['id'],'result'=>['executed'=>false,'error'=>'invalid_tool_call']]]);
    verify(str_contains(wp_json_encode($feedback),'invalid_tool_call'),$protocol.' lost correction feedback');
}
foreach (['{broken', '{"name":"gutenberg.save"}', '{"name":"gutenberg.save","arguments":"wrong"}', '{"name":"","arguments":{}}'] as $malformed) {
    $native=['role'=>'assistant','tool_calls'=>[['id'=>'bad','function'=>['name'=>'site_tool','arguments'=>$malformed]]]];
    $rejected=ProviderAgentTurn::read(['body'=>['messages'=>[]]],'openai',['choices'=>[['message'=>$native]]]);
    verify(!empty($rejected['calls'][0]['validationError']), 'Malformed call must return a non-executable validation result');
    verify($rejected['turns'][0] === $native, 'Malformed call must retain exact native continuation');
    $retry=ProviderAgentTurn::prepare($base,'openai',$rejected['turns'],[['id'=>'bad','result'=>['ok'=>false,'error'=>$rejected['calls'][0]['validationError']]]]);
    verify($retry['body']['messages'][1]['tool_call_id']==='bad', 'Validation feedback must match the rejected call');
}
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
$badResponse=['output'=>[['type'=>'function_call','id'=>'fc-bad','call_id'=>'bad-response','name'=>'site_tool','arguments'=>'{broken']]];
$invalidResponse=ProviderAgentTurn::read($call,'openai-responses',$badResponse);
verify(!empty($invalidResponse['calls'][0]['validationError']),'Responses malformed JSON must allow correction');
$feedback=ProviderAgentTurn::prepare($base,'openai-responses',$invalidResponse['turns'],[['id'=>'bad-response','result'=>['executed'=>false]]]);
verify(end($feedback['body']['input'])['call_id']==='bad-response','Responses correction lost call ID');
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

$strictBase=['url'=>'https://api.openai.com/v1/chat/completions','body'=>['model'=>'gpt-4.1-mini','messages'=>[],'max_tokens'=>2048]];
foreach (['openai','openai-responses'] as $strictProtocol) {
    $strictCall=ProviderAgentTurn::prepare($strictBase,$strictProtocol,[],[]);
    $tool=$strictProtocol==='openai'?$strictCall['body']['tools'][0]['function']:$strictCall['body']['tools'][0];
    verify(($tool['strict']??false)===true,'Official OpenAI must enforce its tool envelope');
    verify($tool['parameters']['additionalProperties']===false && $tool['parameters']['required']===['name','argumentsJson'],'Strict envelope must require tool name and serialized arguments');
    foreach (['{"canvasId":"fixture","expectedPostId":10}', '{}', '[]', 'null', '{broken'] as $json) {
        $wire=wp_json_encode(['name'=>'gutenberg.save','argumentsJson'=>$json]);
        $native=['role'=>'assistant','tool_calls'=>[['id'=>'strict-call','function'=>['name'=>'site_tool','arguments'=>$wire]]]];
        $data=$strictProtocol==='openai'?['choices'=>[['message'=>$native]]]:['output'=>[['type'=>'function_call','call_id'=>'strict-call','name'=>'site_tool','arguments'=>$wire]]];
        $parsed=ProviderAgentTurn::read($strictCall,$strictProtocol,$data);
        $valid=str_starts_with($json,'{') && $json!=='{broken';
        verify(empty($parsed['calls'][0]['validationError'])===$valid,'Serialized arguments must be a valid JSON object');
        if($valid) verify($parsed['calls'][0]['input']===['name'=>'gutenberg.save','arguments'=>json_decode($json,true)],'Strict envelope must normalize without losing arguments');
        if($strictProtocol==='openai') verify(end($parsed['turns'])===$native,'Normalization must not modify native continuation');
    }
}
$custom=$strictBase;$custom['url']='https://example.test/v1/chat/completions';
$customCall=ProviderAgentTurn::prepare($custom,'openai',[],[]);
verify(!isset($customCall['body']['tools'][0]['function']['strict']),'Do not require OpenAI strict support from custom endpoints');
echo "Strict envelope and compatible endpoint tests passed.\n";
$ambiguous=['role'=>'assistant','tool_calls'=>[['id'=>'ambiguous','function'=>['name'=>'site_tool','arguments'=>wp_json_encode(['name'=>'gutenberg.save','arguments'=>['postId'=>1],'argumentsJson'=>'{"postId":2}'])]]]];
$rejected=ProviderAgentTurn::read(['body'=>['messages'=>[]]],'openai',['choices'=>[['message'=>$ambiguous]]]);
verify(!empty($rejected['calls'][0]['validationError']),'Conflicting argument formats must never be guessed');
