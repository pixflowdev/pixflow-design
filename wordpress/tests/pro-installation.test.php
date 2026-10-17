<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License {
    class CentralEntitlements { public static function delivery_origin(): string { return self::authority(); } public static function authority(): string { return 'https://pixflow.dev'; } }
    function hash_file($algorithm, $path) { $GLOBALS['integrity_reads'] = ($GLOBALS['integrity_reads'] ?? 0) + 1; return \hash_file($algorithm, $path); }
}
namespace PixflowDesign\Pro {
    class Plugin { public static function dependency_error(): ?string { return $GLOBALS['dependency_error'] ?? null; } }
}
namespace {
    define('ABSPATH', __DIR__);
    define('WP_PLUGIN_DIR', sys_get_temp_dir().'/pixflow-pro-migration-'.bin2hex(random_bytes(6)));
    $GLOBALS['options']=[];
    function get_option($key,$default=null) { return $GLOBALS['options'][$key] ?? $default; }
    function get_transient($key) { return $GLOBALS['transients'][$key] ?? false; }
    function set_transient($key,$value,$ttl) { $GLOBALS['transients'][$key]=$value; }
    function delete_transient($key) { unset($GLOBALS['transients'][$key]); }
    function is_multisite() { return $GLOBALS['multisite'] ?? false; }
    function get_site_option($key,$default=null) { return $GLOBALS['network'][$key] ?? $default; }
    function self_admin_url($path) { return 'https://site.test/wp-admin/'.$path; }
    require dirname(__DIR__).'/src/License/ProInstallation.php';
    function check($value,$message) { if (!$value) throw new \RuntimeException($message); }
    $service=new \PixflowDesign\WordPress\License\ProInstallation();
    $root=WP_PLUGIN_DIR.'/pixflow-design-pro';
    mkdir($root.'/src',0777,true);
    try {
        check($service->status(true)['installation']==='missing','Missing Pro misreported');
        check($service->status(false)['trial_url']==='', 'Unreleased trial advertised');
        check($service->status(false)['trial_status']==='unknown', 'New installation claimed account eligibility');
        check($service->status(false, true)['trial_status']==='ineligible', 'Previous licence offered another trial');
        define('PIXFLOW_DESIGN_PRO_TRIALS_ENABLED', true);
        check($service->status(false)['trial_url']==='https://pixflow.dev/account#pro-trial', 'Trial account link missing');
        check($service->status(true)['trial_url']==='', 'Existing customer offered trial');
        $files=['pixflow-design-pro.php'=>'entry','src/Plugin.php'=>'module','src/autoload.php'=>'loader','assets/ui.js'=>'built UI'];
        mkdir($root.'/assets');
        foreach($files as $path=>$body) file_put_contents($root.'/'.$path,$body);
        $manifest=['schema'=>1,'product'=>'pixflow-design-pro','files'=>array_map(fn($s)=>hash('sha256',$s),$files)];
        file_put_contents($root.'/package-integrity.json',json_encode($manifest));
        check($service->status(true)['installation']==='inactive','Inactive Pro misreported');
        $GLOBALS['options']['active_plugins']=[\PixflowDesign\WordPress\License\ProInstallation::BASENAME];
        $saved=$GLOBALS['options'];
        check($service->status(true)['installation']==='active','Complete active Pro rejected');
        $reads = $GLOBALS['integrity_reads'];
        check($service->status(true)['installation']==='active', 'Cached status failed');
        check($GLOBALS['integrity_reads'] === $reads, 'Repeated status reread every package byte');
        check($service->complete($root), 'Explicit integrity check failed');
        check($GLOBALS['integrity_reads'] === $reads + count($files), 'Explicit checks must not trust the diagnostic cache');
        foreach ($GLOBALS['transients'] as &$cached) $cached['verified_at'] = time() - 61;
        unset($cached);
        $reads = $GLOBALS['integrity_reads'];
        check($service->status(true)['installation']==='active', 'Expired diagnostic recheck failed');
        check($GLOBALS['integrity_reads'] === $reads + count($files), 'Expired cache skipped byte verification');
        check($service->status(false)['eligible']===false,'Installed Pro invented a licence');
        check($GLOBALS['options']===$saved,'Diagnostic rewrote settings');
        $GLOBALS['dependency_error']='Incompatible API';
        check($service->status(true)['installation']==='incompatible','Version mismatch ignored');
        unset($GLOBALS['dependency_error']);
        unlink($root.'/assets/ui.js');
        check($service->status(true)['installation']==='incomplete','Interrupted upload accepted');
        file_put_contents($root.'/assets/ui.js','different bundle');
        check(!$service->complete($root),'Mixed package accepted');
        file_put_contents($root.'/assets/ui.js',$files['assets/ui.js']);
        $GLOBALS['options']['active_plugins']=[];
        $GLOBALS['multisite']=true;
        $GLOBALS['network']['active_sitewide_plugins']=[\PixflowDesign\WordPress\License\ProInstallation::BASENAME=>1];
        check($service->status(true)['installation']==='active','Network activation ignored');
        $manifest['files']['../outside.php']=hash('sha256','outside');
        file_put_contents($root.'/package-integrity.json',json_encode($manifest));
        check(!$service->complete($root),'Unsafe inventory path accepted');
        echo "Pro installation: missing, inactive, active, incompatible, interrupted, mixed, unlicensed, network and traversal checks passed.\n";
    } finally {
        // Remove only this randomly created fixture tree, using no supplied path.
        $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator(WP_PLUGIN_DIR,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
        foreach($iterator as $file) $file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname());
        rmdir(WP_PLUGIN_DIR);
    }
}
