<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Modules;

if (!defined('ABSPATH')) exit;

/** Internal add-on API, independent of WordPress authentication and licensing. */
final class ModuleHost
{
    public const API_VERSION = 14;
    private bool $registered = false;
    private bool $booted = false;
    private ModuleRegistry $registry;
    private bool $registration_failed = false;

    public function __construct()
    {
        $this->registry = new ModuleRegistry();
    }

    public function register(): void
    {
        if ($this->registered) return;
        $this->registered = true;
        add_action('admin_notices', [$this, 'notice']);
        // All plugin entrypoints have loaded before collecting contributions,
        // regardless of whether WordPress loads Pro before or after core.
        if (did_action('plugins_loaded')) {
            $this->boot();
        } else {
            add_action('plugins_loaded', [$this, 'boot'], 20);
        }
    }

    public function boot(): void
    {
        if ($this->booted) return;
        $this->booted = true;
        try {
            do_action('pixflow_design_register_modules', $this->registry);
        } catch (\Throwable $error) {
            // A broken contributor must not take down the entire WordPress site.
            // Do not expose exception messages, paths or credentials in notices.
            $this->registration_failed = true;
        }
        $this->registry->boot();
    }

    public function notice(): void
    {
        if ((!$this->registration_failed && !$this->registry->failures()) || !current_user_can('activate_plugins')) return;
        echo '<div class="notice notice-error"><p>' . esc_html__('A Pixflow add-on could not start. Check that your Pixflow plugins are compatible, then reload. Other features may still be available.', 'pixflow-design') . '</p></div>';
    }
}
