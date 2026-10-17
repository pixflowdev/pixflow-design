<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$fixture = sys_get_temp_dir() . '/pixflow-language-' . bin2hex(random_bytes(8));
mkdir($fixture);
$GLOBALS['fixture'] = $fixture;
$GLOBALS['options'] = ['unrelated_setting'=>['kept'=>true], 'chat_history'=>['unchanged']];
$GLOBALS['caps'] = ['edit_posts'=>true, 'manage_options'=>true];
$GLOBALS['network'] = [];
$GLOBALS['filters'] = [];
function get_option($key, $default = false) { if (isset($GLOBALS['negative_option_cache'][$key])) return $default; return $GLOBALS['options'][$key] ?? $default; }
function update_option($key, $value, $autoload = null) { if ($GLOBALS['fail_update'] ?? false) return false; $GLOBALS['options'][$key] = $value; return true; }
function wp_cache_delete($key, $group) { if ($key === 'notoptions' && $group === 'options') $GLOBALS['negative_option_cache'] = []; }
function current_user_can($cap) { return $GLOBALS['caps'][$cap] ?? false; }
function is_user_logged_in() { return $GLOBALS['logged_in'] ?? true; }
function wp_verify_nonce($nonce, $action) { return $nonce === 'valid' && $action === 'wp_rest'; }
function wp_upload_dir($time = null, $create = false) { return ['basedir'=>$GLOBALS['fixture'] . '/uploads', 'error'=>false]; }
function wp_mkdir_p($directory) { return is_dir($directory) || mkdir($directory, 0777, true); }
function wp_safe_remote_get($url, $options) { $GLOBALS['network'][] = [$url, $options]; return $GLOBALS['remote']; }
function is_wp_error($value) { return false; }
function wp_remote_retrieve_response_code($response) { return $response['status']; }
function wp_remote_retrieve_body($response) { return $response['body']; }
function add_filter($name, $callback, ...$args) { $GLOBALS['filters'][$name] = $callback; }
function determine_locale() { return 'fr_FR'; }
function load_textdomain($domain, $file) { $GLOBALS['loaded_textdomains'][] = [$domain, $file]; return true; }
function register_rest_route($namespace, $route, $args) { $GLOBALS['registered_routes'][$route] = $args; }
class WP_REST_Request {
    public function __construct(private string $method, private string $locale = '', private string $nonce = 'valid') {}
    public function get_method() { return $this->method; }
    public function get_param($name) { return $name === 'locale' ? $this->locale : null; }
    public function get_header($name) { return $this->nonce; }
}
class WP_REST_Response {
    public function __construct(private $data, private $status = 200, private $headers = []) {}
    public function get_data() { return $this->data; }
    public function get_status() { return $this->status; }
}
require __DIR__ . '/../src/Languages/LanguagePackService.php';
require __DIR__ . '/../src/Http/Routes/LanguagePackRoutes.php';
use PixflowDesign\WordPress\Languages\LanguagePackService;
use PixflowDesign\WordPress\Http\Routes\LanguagePackRoutes;
$checks = 0;
function check($condition, $message) { global $checks; if (!$condition) throw new RuntimeException($message); $checks++; }
function fails(callable $fn, $message) { try { $fn(); } catch (Throwable $e) { check(true, $message); return; } throw new RuntimeException($message); }
function language_fixture(string $word = 'Bonjour', string $locale = 'fr'): string {
    return json_encode(['schema'=>1, 'locale'=>$locale, 'dictionary'=>['hello'=>$word], 'content'=>['skills'=>[]], 'wordpress'=>['pixflow-design'=>base64_encode("\xde\x12\x04\x95" . str_repeat("\0", 24))]], JSON_UNESCAPED_UNICODE);
}
function entry(string $body, string $locale = 'fr'): array {
    $hash = hash('sha256', $body);
    return ['sha256'=>$hash, 'bytes'=>strlen($body), 'wpLocale'=>'fr_FR', 'file'=>$locale . '-' . $hash . '.json'];
}
$body = language_fixture();
$entry = entry($body);
$manifest = $fixture . '/manifest.json';
file_put_contents($manifest, json_encode(['schema'=>1, 'locales'=>['fr'=>$entry]]));
$service = new LanguagePackService($manifest);
$routes = new LanguagePackRoutes($service);
$routes->register();
check(count($GLOBALS['registered_routes']) === 2, 'Routes registered');
$status = $service->overview();
check($status['languages'][0]['locale'] === 'en' && $status['languages'][0]['installed'], 'English available offline');
check(!$status['languages'][1]['installed'] && $GLOBALS['network'] === [], 'Status never downloads');
check($routes->handle(new WP_REST_Request('GET', 'fr'))->get_status() === 404, 'Missing language readable error');
check($routes->handle(new WP_REST_Request('GET', '', 'invalid'))->get_status() === 403, 'Nonce required for reads');
$GLOBALS['caps']['manage_options'] = false;
check($routes->handle(new WP_REST_Request('POST', 'fr'))->get_status() === 403, 'Editor cannot install');
check($routes->handle(new WP_REST_Request('GET'))->get_status() === 200, 'Editor can list');
check(!$service->overview()['canInstall'], 'Editor UI knows download unavailable');
$GLOBALS['caps']['manage_options'] = true;
$GLOBALS['remote'] = ['status'=>200, 'body'=>$body];
$result = $routes->handle(new WP_REST_Request('POST', 'fr'));
check($result->get_status() === 200 && $result->get_data()['dictionary']['hello'] === 'Bonjour', 'Install returns usable dictionary');
check($GLOBALS['network'][0][0] === 'https://pixflow.dev/api/languages/v1/' . $entry['file'], 'Fixed hosting URL');
check($GLOBALS['network'][0][1]['redirection'] === 0 && $GLOBALS['network'][0][1]['limit_response_size'] === strlen($body) + 1, 'Redirect and response bounds');
check($service->overview()['languages'][1]['installed'], 'Installed status');
$requests = count($GLOBALS['network']);
check($service->read('fr')['dictionary']['hello'] === 'Bonjour' && count($GLOBALS['network']) === $requests, 'Installed read works offline');
check($GLOBALS['options']['unrelated_setting'] === ['kept'=>true] && $GLOBALS['options']['chat_history'] === ['unchanged'], 'Preferences and chats untouched');
$next = language_fixture('Salut');
$nextEntry = entry($next);
file_put_contents($manifest, json_encode(['schema'=>1, 'locales'=>['fr'=>$nextEntry]]));
check($service->overview()['languages'][1]['updateAvailable'], 'Updated pinned manifest detected');
$before = $GLOBALS['options'];
$GLOBALS['remote'] = ['status'=>200, 'body'=>str_repeat('x', strlen($next))];
fails(fn() => $service->install('fr'), 'Digest mismatch rejected');
check($GLOBALS['options'] === $before && $service->read('fr')['dictionary']['hello'] === 'Bonjour', 'Bad update preserves old pack and settings');
$GLOBALS['remote'] = ['status'=>503, 'body'=>'Unavailable'];
fails(fn() => $service->install('fr'), 'Unavailable server rejected');
check($GLOBALS['options'] === $before, 'Network failure preserves receipt');
$GLOBALS['remote'] = ['status'=>200, 'body'=>$next];
$service->install('fr');
check($service->read('fr')['dictionary']['hello'] === 'Salut', 'Valid update applies');
check(is_file($fixture . '/uploads/pixflow-design/languages/' . $entry['file']), 'Previous pack retained');
$networkCount = count($GLOBALS['network']);
fails(fn() => $service->install('../evil'), 'Unknown path rejected');
fails(fn() => $service->install('https://evil.test'), 'URL rejected');
check(count($GLOBALS['network']) === $networkCount, 'Invalid IDs never reach network');
foreach ([['schema'=>2], ['locale'=>'de'], ['dictionary'=>['hello'=>['nested']]], ['wordpress'=>['php'=>base64_encode('<?php evil();')]]] as $invalid) {
    $bad = json_encode(array_replace(json_decode($next, true), $invalid));
    file_put_contents($manifest, json_encode(['schema'=>1, 'locales'=>['fr'=>entry($bad)]]));
    $GLOBALS['remote'] = ['status'=>200, 'body'=>$bad];
    fails(fn() => $service->install('fr'), 'Malformed pinned payload rejected');
}
file_put_contents($manifest, json_encode(['schema'=>1, 'locales'=>['fr'=>$nextEntry + ['url'=>'https://evil.test']]]));
$installedFile = $fixture . '/uploads/pixflow-design/languages/' . $nextEntry['file'];
file_put_contents($installedFile, str_repeat('x', strlen($next)));
fails(fn() => $service->read('fr'), 'Tampered installed file rejected');
file_put_contents($installedFile, $next);
// Unsafe ancestor directory is rejected before writing; installation never changes existing settings.
rename($fixture . '/uploads/pixflow-design/languages', $fixture . '/saved-languages');
file_put_contents($fixture . '/uploads/pixflow-design/languages', 'blocked');
$GLOBALS['remote'] = ['status'=>200, 'body'=>$next];
fails(fn() => $service->install('fr'), 'Non-directory storage rejected');
unlink($fixture . '/uploads/pixflow-design/languages');
rename($fixture . '/saved-languages', $fixture . '/uploads/pixflow-design/languages');
check($service->read('fr')['dictionary']['hello'] === 'Salut', 'Existing pack survives blocked storage');
$third = language_fixture('Bienvenue');
file_put_contents($manifest, json_encode(['schema'=>1, 'locales'=>['fr'=>entry($third)]]));
$GLOBALS['remote'] = ['status'=>200, 'body'=>$third];
$GLOBALS['fail_update'] = true;
fails(fn() => $service->install('fr'), 'Database failure reported');
check($service->read('fr')['dictionary']['hello'] === 'Salut', 'Database failure retains old pack');
$GLOBALS['fail_update'] = false;
// Another request created a language receipt after this request cached the option as absent.
// A stale WordPress notoptions cache must not erase that concurrently installed language.
$GLOBALS['options']['pixflow_design_language_packs_v1']['de'] = ['sha256'=>str_repeat('a', 64), 'file'=>'existing-german-pack'];
$concurrentReceipt = $GLOBALS['options']['pixflow_design_language_packs_v1']['de'];
$GLOBALS['negative_option_cache']['pixflow_design_language_packs_v1'] = true;
$service->install('fr');
check($GLOBALS['options']['pixflow_design_language_packs_v1']['de'] === $concurrentReceipt, 'Concurrent first-install receipt survives negative option cache');
check($service->read('fr')['dictionary']['hello'] === 'Bienvenue', 'New receipt readable after negative cache invalidation');
define('PIXFLOW_DESIGN_PLUGIN_DIR', $fixture . '/');
mkdir($fixture . '/resources');
copy($manifest, $fixture . '/resources/language-packs.json');
LanguagePackService::register();
$hook = $GLOBALS['filters']['load_textdomain_mofile'];
$moPath = $hook('/missing/fr_FR.mo', 'pixflow-design');
check(is_file($moPath) && str_ends_with($moPath, '.mo'), 'WordPress locale uses installed MO');
check($hook('/missing/fr_FR.mo', 'pixflow-ai') === $moPath, 'Directory text domain reuses existing language receipts without migration');
LanguagePackService::load_installed('pixflow-ai');
check($GLOBALS['loaded_textdomains'] === [['pixflow-ai', $moPath]], 'Directory explicitly loads the verified MO without relying on JIT registry behaviour');
check($hook('/other.mo', 'unrelated-plugin') === '/other.mo', 'Other textdomains untouched');
file_put_contents($moPath, str_repeat('x', filesize($moPath)));
check($hook('/missing/fr_FR.mo', 'pixflow-design') === '/missing/fr_FR.mo', 'Tampered MO is rejected');
LanguagePackService::load_installed('pixflow-ai');
LanguagePackService::load_installed('unrelated');
check(count($GLOBALS['loaded_textdomains']) === 1, 'Invalid or unrelated MO is never loaded');

// Older immutable packs omitted hash_addr for an empty hash table. WordPress
// 6.2's POMO reader requires it to bound the translation descriptors.
$original = 'Open settings'; $translated = 'Ouvrir les paramètres';
$legacyMo = pack('V*', 0x950412de, 0, 1, 28, 36, 0, 0)
    . pack('V*', strlen($original), 44, strlen($translated), 45 + strlen($original))
    . $original . "\0" . $translated . "\0";
$legacyPayload = json_decode(language_fixture(), true);
$legacyPayload['wordpress']['pixflow-design'] = base64_encode($legacyMo);
$legacyBody = json_encode($legacyPayload, JSON_UNESCAPED_UNICODE);
$legacyEntry = entry($legacyBody);
file_put_contents($manifest, json_encode(['schema'=>1, 'locales'=>['fr'=>$legacyEntry]]));
copy($manifest, $fixture . '/resources/language-packs.json');
$GLOBALS['remote'] = ['status'=>200, 'body'=>$legacyBody];
$service->install('fr');
$legacyReceipt = $GLOBALS['options']['pixflow_design_language_packs_v1']['fr'];
$legacyPath = $fixture . '/uploads/pixflow-design/languages/' . $legacyReceipt['mo']['pixflow-design']['file'];
$compatiblePath = $hook('', 'pixflow-ai');
check(is_file($compatiblePath) && realpath($compatiblePath) !== realpath($legacyPath), 'Verified legacy MO gets a separate compatible immutable derivative');
$compatibleBytes = file_get_contents($compatiblePath);
check(unpack('V', substr($compatibleBytes, 24, 4))[1] === 44, 'Derived MO bounds translation descriptors for WordPress 6.2');
check(substr_replace($compatibleBytes, pack('V', 0), 24, 4) === $legacyMo, 'Conversion changes only the omitted empty hash address');
check(file_get_contents($legacyPath) === $legacyMo && $GLOBALS['options']['pixflow_design_language_packs_v1']['fr'] === $legacyReceipt, 'Original pinned bytes and saved receipt remain unchanged');
check($hook('', 'pixflow-ai') === $compatiblePath, 'Repeated loads reuse the same derived filename');
file_put_contents($compatiblePath, str_repeat('x', strlen($compatibleBytes)));
check($hook('', 'pixflow-ai') === $compatiblePath && file_get_contents($compatiblePath) === $compatibleBytes, 'Corrupt derivative is rebuilt only from the verified original');
file_put_contents($legacyPath, str_repeat('x', strlen($legacyMo)));
check($hook('/missing/fr_FR.mo', 'pixflow-ai') === '/missing/fr_FR.mo', 'Invalid original cannot use a previously derived MO');
echo "Language pack checks passed: {$checks}\n";


