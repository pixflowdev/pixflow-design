<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
$remote = []; $requests = [];
function sanitize_key($value) { return $value; }
function wp_json_encode($value) { return json_encode($value, JSON_THROW_ON_ERROR); }
function wp_parse_url($value, $component = -1) { return parse_url($value, $component); }
function wp_http_validate_url($value) { return str_starts_with($value, 'https://') ? $value : false; }
function is_wp_error($value) { return false; }
function wp_remote_request($url, $args) { $GLOBALS['requests'][] = [$url, $args]; return array_shift($GLOBALS['remote']) ?? throw new RuntimeException('Unexpected network call'); }
function wp_remote_retrieve_response_code($value) { return $value['status']; }
function wp_remote_retrieve_body($value) { return json_encode($value['data']); }
function add_query_arg($key, $value, $url) { return $url . '?' . rawurlencode($key) . '=' . rawurlencode($value); }
spl_autoload_register(function ($class) { $prefix = 'PixflowDesign\\WordPress\\'; if (str_starts_with($class, $prefix)) require dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php'; });
$provider = new PixflowDesign\WordPress\Http\Routes\ProviderSettingsRoutes();
foreach (['openai', 'openai-custom', 'anthropic', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix'] as $protocol) {
    $body = match ($protocol) {
        'openai' => ['status'=>'completed','output'=>[['type'=>'message','content'=>[['type'=>'output_text','text'=>'Remember green']]]]],
        'anthropic' => ['stop_reason'=>'end_turn','content'=>[['type'=>'text','text'=>'Remember green']]],
        'google' => ['candidates'=>[['finishReason'=>'STOP','content'=>['role'=>'model','parts'=>[['text'=>'Remember green']]]]]],
        'ollama' => ['message'=>['role'=>'assistant','content'=>'Remember green']],
        default => ['choices'=>[['finish_reason'=>'stop','message'=>['role'=>'assistant','content'=>'Remember green']]]],
    };
    $remote[] = ['status'=>200,'data'=>$body];
    $input = ['apiProtocol'=>$protocol==='openai-custom'?'openai':$protocol,'baseUrl'=>$protocol==='openai'?'https://api.openai.com/v1':'https://provider.example/v1','apiKey'=>'secret-fixture','model'=>'model','turns'=>[['private'=>'do not forward']],'results'=>[['secret'=>'do not forward']]];
    if ($provider->summarize($input, 'Summarize, no tools', 'Preserve my request') !== 'Remember green') throw new RuntimeException($protocol . ' lost summary');
    $wire = json_decode(end($requests)[1]['body'], true);
    if (isset($wire['tools']) || str_contains(json_encode($wire), 'do not forward') || str_contains(json_encode($wire), 'secret-fixture')) throw new RuntimeException($protocol . ' leaked active state, tools or credentials into summary body');
    if ($protocol === 'openai' && !str_ends_with(end($requests)[0], '/responses')) throw new RuntimeException('Official OpenAI must use Responses');
}
$remote[] = ['status'=>200,'data'=>['choices'=>[['finish_reason'=>'tool_calls','message'=>['role'=>'assistant','content'=>'','tool_calls'=>[['id'=>'x','function'=>['name'=>'site_tool','arguments'=>'{"name":"wordpress.run","arguments":{}}']]]]]]]];
try { $provider->summarize(['apiProtocol'=>'openai','baseUrl'=>'https://provider.example','apiKey'=>'fixture','model'=>'model'], 'Summary', 'History'); throw new LogicException('Unexpected tool accepted'); }
catch (RuntimeException $expected) { if (!str_contains($expected->getMessage(), 'cannot run tools')) throw $expected; }
echo "Eight direct API protocol summary routes passed; no tools, active continuations or credential-bearing inputs forwarded.\n";
