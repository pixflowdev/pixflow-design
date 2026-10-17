<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Providers;
if (!defined('ABSPATH')) exit;

/** Native provider tool messages, preserving opaque continuation/signature fields. */
final class ProviderAgentTurn
{
    public static function prepare(array $call, string $protocol, array $turns, array $results, array $images = []): array
    {
        if (in_array($protocol, ['openai', 'azure'], true) && isset($call['body']['max_tokens'])) {
            $call['body']['max_completion_tokens'] = $call['body']['max_tokens'];
            unset($call['body']['max_tokens']);
        }
        $schema = ['type'=>'object', 'properties'=>[
            'name'=>['type'=>'string', 'description'=>'WordPress site tool name from the available catalogue.'],
            'arguments'=>['type'=>'object', 'additionalProperties'=>true],
        ], 'required'=>['name','arguments']];
        $description = 'Run a tool on the connected WordPress site, including native Bricks edits, PHP, files, database access, skills and research. Choose tools according to the user request.';
        if ($protocol === 'openai-responses') {
            $messages = $turns ?: $call['body']['messages'];
            foreach ($results as $r) $messages[] = ['type'=>'function_call_output','call_id'=>$r['id'],'output'=>empty($r['images']) ? wp_json_encode($r['result']) : array_merge([['type'=>'input_text','text'=>wp_json_encode($r['result'])]],self::image_parts('openai-responses',$r['images']))];
            if (!$turns && $images) $messages[] = ['role'=>'user','content'=>self::image_parts($protocol,$images)];
            $call['url'] = preg_replace('#/chat/completions$#', '/responses', $call['url']);
            $call['body'] = [
                'model'=>$call['body']['model'], 'input'=>$messages,
                'max_output_tokens'=>$call['body']['max_completion_tokens'] ?? $call['body']['max_tokens'], 'store'=>false,
                'include'=>['reasoning.encrypted_content'],
                'tools'=>[['type'=>'function','name'=>'site_tool','description'=>$description,'parameters'=>$schema,'strict'=>false]],
            ];
        } elseif ($protocol === 'google') {
            if ($turns) $call['body']['contents'] = $turns;
            if ($results) $call['body']['contents'][] = ['role'=>'user','parts'=>array_merge(...array_map(fn($r)=>array_merge([['functionResponse'=>array_merge(['name'=>'site_tool','response'=>['result'=>$r['result']]], str_starts_with($r['id'],'google-') ? [] : ['id'=>$r['id']])]],self::image_parts($protocol,$r['images']??[])),$results))];
            if (!$turns && $images) $call['body']['contents'][array_key_last($call['body']['contents'])]['parts'] = array_merge($call['body']['contents'][array_key_last($call['body']['contents'])]['parts'],self::image_parts($protocol,$images));
            $call['body']['tools'] = [['functionDeclarations'=>[['name'=>'site_tool','description'=>$description,'parametersJsonSchema'=>$schema]]]];
        } elseif ($protocol === 'anthropic') {
            if ($turns) $call['body']['messages'] = $turns;
            if ($results) $call['body']['messages'][] = ['role'=>'user','content'=>array_map(fn($r)=>['type'=>'tool_result','tool_use_id'=>$r['id'],'content'=>array_merge([['type'=>'text','text'=>wp_json_encode($r['result'])]],self::image_parts($protocol,$r['images']??[]))],$results)];
            if (!$turns && $images) $call['body']['messages'][] = ['role'=>'user','content'=>self::image_parts($protocol,$images)];
            $call['body']['tools'] = [['name'=>'site_tool','description'=>$description,'input_schema'=>$schema]];
        } else {
            if ($turns) $call['body']['messages'] = $turns;
            foreach ($results as $r) $call['body']['messages'][] = array_merge(['role'=>'tool','content'=>wp_json_encode($r['result'])], $protocol === 'ollama' ? ['tool_name'=>'site_tool'] : ['tool_call_id'=>$r['id']]);
            $resultImages = array_merge($turns?[]:$images,...array_map(fn($r)=>$r['images']??[],$results));
            if ($resultImages) $call['body']['messages'][] = $protocol==='ollama' ? ['role'=>'user','content'=>'Images supplied with the preceding context or tool results.','images'=>array_column($resultImages,'base64')] : ['role'=>'user','content'=>self::image_parts($protocol,$resultImages)];
            $call['body']['tools'] = [['type'=>'function','function'=>['name'=>'site_tool','description'=>$description,'parameters'=>$schema]]];
        }
        return $call;
    }

    private static function image_parts(string $protocol, array $images): array
    {
        return array_map(static function(array $image) use ($protocol): array {
            $mime=$image['mimeType']; $data=$image['base64'];
            if (!in_array($mime,['image/png','image/jpeg','image/webp','image/gif'],true) || !is_string($data)) throw new \InvalidArgumentException('Unsupported image attachment.');
            return match($protocol) {
                'google'=>['inlineData'=>['mimeType'=>$mime,'data'=>$data]],
                'anthropic'=>['type'=>'image','source'=>['type'=>'base64','media_type'=>$mime,'data'=>$data]],
                'openai-responses'=>['type'=>'input_image','image_url'=>'data:'.$mime.';base64,'.$data],
                default=>['type'=>'image_url','image_url'=>['url'=>'data:'.$mime.';base64,'.$data]],
            };
        },$images);
    }

    public static function read(array $call, string $protocol, array $data): array
    {
        if (!empty($data['error']) || in_array($data['status'] ?? '', ['failed','cancelled'], true)) {
            $error=$data['error'] ?? [];
            throw new \RuntimeException(is_string($error) ? $error : ($error['message'] ?? 'The provider did not complete this response.'));
        }
        $finish = $data['choices'][0]['finish_reason'] ?? $data['stop_reason'] ?? $data['candidates'][0]['finishReason'] ?? $data['incomplete_details']['reason'] ?? '';
        if (in_array($finish, ['length', 'max_tokens', 'max_output_tokens', 'MAX_TOKENS'], true)) {
            throw new \RuntimeException('The provider reached its response token limit. Increase the response token setting and retry; no tool calls from this incomplete response were executed.');
        }
        if (($data['status'] ?? '') === 'incomplete') throw new \RuntimeException('The provider returned an incomplete response. No tools from that response were executed.');
        $calls = []; $text = '';
        if ($protocol === 'openai-responses') {
            $assistant = $data['output'] ?? [];
            foreach ($assistant as $item) {
                if (($item['type'] ?? '') === 'message') foreach ($item['content'] ?? [] as $part) {
                    if (($part['type'] ?? '') === 'output_text') $text .= $part['text'];
                    if (($part['type'] ?? '') === 'refusal') $text .= $part['refusal'];
                }
                if (($item['type'] ?? '') === 'function_call') $calls[] = ['id'=>$item['call_id'],'function'=>$item['name'],'input'=>json_decode($item['arguments'],true,512,JSON_THROW_ON_ERROR)];
            }
            $turns = $call['body']['input'];
        } elseif ($protocol === 'google') {
            $assistant = $data['candidates'][0]['content'] ?? [];
            foreach ($assistant['parts'] ?? [] as $part) {
                if (isset($part['text']) && empty($part['thought'])) $text .= $part['text'];
                if (isset($part['functionCall'])) $calls[] = ['id'=> $part['functionCall']['id'] ?? 'google-' . count($calls), 'function'=>$part['functionCall']['name'] ?? '', 'input'=>$part['functionCall']['args'] ?? []];
            }
            $turns = $call['body']['contents'];
        } elseif ($protocol === 'anthropic') {
            $assistant = ['role'=>'assistant','content'=>$data['content'] ?? []];
            foreach ($assistant['content'] as $block) {
                if (($block['type'] ?? '') === 'text') $text .= $block['text'] ?? '';
                if (($block['type'] ?? '') === 'tool_use') $calls[] = ['id'=>$block['id'],'function'=>$block['name'],'input'=>$block['input'] ?? []];
            }
            $turns = $call['body']['messages'];
        } else {
            $assistant = $protocol === 'ollama' ? ($data['message'] ?? []) : ($data['choices'][0]['message'] ?? []);
            $text = (string) ($assistant['content'] ?? '');
            foreach ($assistant['tool_calls'] ?? [] as $index=>$entry) {
                $args = $entry['function']['arguments'] ?? [];
                $calls[] = ['id'=>$entry['id'] ?? 'call-' . $index,'function'=>$entry['function']['name'] ?? '', 'input'=>is_string($args) ? json_decode($args,true,512,JSON_THROW_ON_ERROR) : $args];
            }
            $turns = $call['body']['messages'];
        }
        if (!$assistant || (!$calls && trim($text) === '')) throw new \RuntimeException('Provider returned no answer or tool calls.');
        foreach ($calls as $entry) {
            if ($entry['function'] !== 'site_tool' || !is_array($entry['input']) || !is_string($entry['input']['name'] ?? null) || !is_array($entry['input']['arguments'] ?? null)) throw new \RuntimeException('Provider returned an invalid site tool call. No tools were executed.');
        }
        if ($protocol === 'openai-responses') array_push($turns, ...$assistant);
        else $turns[] = $assistant;
        return ['text'=>$text,'calls'=>$calls,'turns'=>$turns];
    }
}
