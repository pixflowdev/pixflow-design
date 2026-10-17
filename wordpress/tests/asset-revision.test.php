<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Assets {
    function hash_file($algorithm, $path) { $GLOBALS['asset_hash_reads']++; return \hash_file($algorithm, $path); }
}
namespace {
    define('ABSPATH', __DIR__);
    require dirname(__DIR__) . '/src/Assets/AssetRevision.php';
    use PixflowDesign\WordPress\Assets\AssetRevision;
    $GLOBALS['asset_hash_reads'] = 0;
    $GLOBALS['transients'] = [];
    function get_transient($key) { return $GLOBALS['transients'][$key] ?? false; }
    function set_transient($key, $value, $ttl) { $GLOBALS['transients'][$key] = $value; }
    function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
    $root = sys_get_temp_dir() . '/pixflow-asset-revision-' . bin2hex(random_bytes(8));
    mkdir($root, 0700);
    $asset = $root . '/bundle.js';
    $manifest = $root . '/asset-revisions.json';
    try {
        file_put_contents($asset, 'first build');
        $first = AssetRevision::fingerprint([$asset, $asset]);
        check($GLOBALS['asset_hash_reads'] === 1, 'Duplicate paths should be read once');
        check(AssetRevision::fingerprint([$asset]) === $first, 'Unchanged fallback revision drifted');
        check($GLOBALS['asset_hash_reads'] === 1, 'Repeated fallback reads must reuse metadata cache');
        file_put_contents($asset, 'second build changed size');
        check(AssetRevision::fingerprint([$asset]) !== $first, 'Changed local bytes did not invalidate revision');
        check($GLOBALS['asset_hash_reads'] === 2, 'Changed metadata must rehash fallback bytes');
        $writeManifest = static function ($digest, $size) use ($manifest) {
            file_put_contents($manifest, json_encode(['version'=>1, 'files'=>['bundle.js'=>['sha256'=>$digest, 'size'=>$size]]]));
        };
        $writeManifest(hash_file('sha256', $asset), filesize($asset));
        $built = AssetRevision::fingerprint([$asset]);
        check($GLOBALS['asset_hash_reads'] === 2, 'Generated manifest should avoid hashing JS');
        $before = stat($asset);
        file_put_contents($asset, 'third  build changed size'); // same byte length, unchanged release version
        touch($asset, $before['mtime']);
        clearstatcache(true, $asset);
        check(filesize($asset) === $before['size'], 'Fixture must preserve byte size');
        $writeManifest(hash_file('sha256', $asset), filesize($asset));
        check(AssetRevision::fingerprint([$asset]) !== $built, 'New same-version manifest must invalidate preserved-mtime assets');
        check($GLOBALS['asset_hash_reads'] === 2, 'New build unexpectedly reread JS');
        $writeManifest('not-a-digest', filesize($asset));
        $GLOBALS['transients'] = [];
        AssetRevision::fingerprint([$asset]);
        check($GLOBALS['asset_hash_reads'] === 3, 'Malformed manifest must fall back to actual bytes');
        unlink($asset);
        check(AssetRevision::fingerprint([$asset]) !== $built, 'Missing asset must not reuse successful revision');
        echo "Asset revisions: generated manifest, same-version rebuilds, metadata invalidation, fallback caching, malformed and missing files passed.\n";
    } finally {
        foreach (glob($root . '/*') ?: [] as $path) unlink($path);
        rmdir($root);
    }
}
