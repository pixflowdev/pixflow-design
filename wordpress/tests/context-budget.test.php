<?php
declare(strict_types=1);
define('ABSPATH', __DIR__);
require dirname(__DIR__) . '/src/Chat/ContextBudget.php';
use PixflowDesign\WordPress\Chat\ContextBudget;
$input=['apiProtocol'=>'openai','baseUrl'=>'https://api.openai.com/v1','model'=>'gpt-6-luna','maxTokens'=>8192];
foreach ([[$input,192000], [array_replace($input,['baseUrl'=>'https://proxy.example']),48000], [array_replace($input,['transport'=>'composio','provider'=>'openai','model'=>'openai/gpt-6-luna']),192000], [array_replace($input,['model'=>'unknown']),48000], [array_replace($input,['maxTokens'=>700000]),6144]] as [$config,$expected]) {
 if (ContextBudget::bytes($config)!==$expected) throw new RuntimeException('Incorrect context budget');
}
echo "Context budget tests passed\n";
