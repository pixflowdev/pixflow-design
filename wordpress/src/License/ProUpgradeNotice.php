<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\License;
if (!defined('ABSPATH')) exit;

/** A per-user, dismissible invitation. Dismissal never changes site entitlements. */
final class ProUpgradeNotice
{
    public const DISMISSED = 'pixflow_design_pro_banner_dismissed';
    public const ACTION = 'pixflow_design_dismiss_pro_banner';

    public function register(): void
    {
        add_action('admin_notices', [$this, 'render']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('admin_post_' . self::ACTION, [$this, 'dismiss']);
        add_action('wp_ajax_' . self::ACTION, [$this, 'dismiss_ajax']);
        add_filter('plugin_row_meta', [$this, 'plugin_meta'], 10, 2);
    }

    public function offer(bool $respect_dismissal = true): ?array
    {
        if (!current_user_can('activate_plugins') || is_network_admin()
            || ($respect_dismissal && get_user_meta(get_current_user_id(), self::DISMISSED, true))) return null;
        $screen = get_current_screen();
        // Keep immersive editors free of promotional chrome.
        if (!$screen || in_array($screen->base, ['post', 'site-editor', 'customize'], true)) return null;
        $pro = (new LicenseService())->status()['pro'] ?? null;
        if (!is_array($pro) || (!empty($pro['eligible']) && ($pro['installation'] ?? '') === 'active')) return null;
        if (!empty($pro['eligible'])) {
            $inactive = ($pro['installation'] ?? '') === 'inactive';
            return [
                'title' => __('Your Pixflow plan includes Pro', 'pixflow-design'),
                'description' => __('Bring back your premium tools with the Pro add-on. Your licence, content and saved settings stay in place. If you used Bricks two-factor authentication, re-enable it in settings after activating Pro.', 'pixflow-design'),
                'label' => $inactive ? __('Activate Pro', 'pixflow-design') : __('Download Pro', 'pixflow-design'),
                'url' => $inactive ? $pro['plugins_url'] : $pro['account_url'],
            ];
        }
        $trial_status = $pro['trial_status'] ?? 'unknown';
        $trial = !empty($pro['trial_url']) && $trial_status === 'eligible';
        $check_trial = !empty($pro['trial_url']) && $trial_status === 'unknown';
        return [
            'title' => __('More possibilities with Pixflow Design Pro', 'pixflow-design'),
            'description' => __('Build in your favourite builder. Add annotations, voice, design systems and image generation to your workflow.', 'pixflow-design'),
            'label' => $trial ? __('Try Pro for 7 days', 'pixflow-design') : ($check_trial ? __('Check Pro trial', 'pixflow-design') : __('Upgrade to Pro', 'pixflow-design')),
            'trial' => $trial,
            'url' => ($trial || $check_trial) ? $pro['trial_url'] : CentralEntitlements::delivery_origin() . '/pricing/',
        ];
    }

    public function enqueue(): void
    {
        if ($this->offer(false) === null) return;
        wp_enqueue_style('pixflow-pro-upgrade-notice', PIXFLOW_DESIGN_ASSETS_URL . 'pro-upgrade-notice.css', [],
            (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . 'pro-upgrade-notice.css'));
        wp_enqueue_script('pixflow-pro-upgrade-notice', PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-pro-upgrade-notice.js', [],
            (string) filemtime(PIXFLOW_DESIGN_ASSETS_DIR . 'app/pixflow-pro-upgrade-notice.js'), true);
    }

    public function plugin_meta(array $links, string $file): array
    {
        if (!defined('PIXFLOW_DESIGN_PLUGIN_FILE') || $file !== plugin_basename(PIXFLOW_DESIGN_PLUGIN_FILE)) return $links;
        $offer = $this->offer(false);
        if ($offer === null) return $links;
        $label = !empty($offer['trial']) ? __('Start your 7-day Pro trial', 'pixflow-design') : $offer['label'];
        $links[] = '<a class="pixflow-pro-upgrade-link" href="' . esc_url($offer['url']) . '">' . esc_html($label) . '</a>';
        return $links;
    }

    public function render(): void
    {
        $offer = $this->offer();
        if ($offer === null) return;
        // Keep this below screen metadata; WordPress relocates elements with .notice.
        echo '<section class="pixflow-pro-upgrade" aria-label="Pixflow Design Pro">';
        echo '<span class="pixflow-pro-upgrade__brand" aria-hidden="true"><img src="' . esc_url(PIXFLOW_DESIGN_ASSETS_URL . 'brand/pixflow-icon-light.svg') . '" alt="" width="32" height="32"></span>';
        echo '<div class="pixflow-pro-upgrade__copy"><h2>' . esc_html($offer['title']) . '</h2><p>' . esc_html($offer['description']) . '</p><span class="pixflow-pro-upgrade__error" role="status" hidden></span></div>';
        echo '<a class="pixflow-pro-upgrade__cta" href="' . esc_url($offer['url']) . '">' . esc_html($offer['label']) . '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>';
        echo '<form class="pixflow-pro-upgrade__dismiss" method="post" action="' . esc_url(admin_url('admin-post.php')) . '" data-dismiss-url="' . esc_url(admin_url('admin-ajax.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACTION) . '">';
        wp_nonce_field(self::ACTION);
        echo '<button type="submit" aria-label="' . esc_attr(__('Dismiss Pixflow Pro banner', 'pixflow-design')) . '" title="' . esc_attr(__('Dismiss', 'pixflow-design')) . '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></form></section>';
    }

    public function dismiss_ajax(): void
    {
        if (!current_user_can('activate_plugins')) {
            wp_send_json_error(['message' => __('You cannot dismiss this notice.', 'pixflow-design')], 403);
            return;
        }
        if (!check_ajax_referer(self::ACTION, '_wpnonce', false)) {
            wp_send_json_error(['message' => __('Refresh this page and try again.', 'pixflow-design')], 403);
            return;
        }
        update_user_meta(get_current_user_id(), self::DISMISSED, 1);
        if (!get_user_meta(get_current_user_id(), self::DISMISSED, true)) {
            wp_send_json_error(['message' => __('Could not save dismissal. Please try again.', 'pixflow-design')], 500);
            return;
        }
        wp_send_json_success();
    }

    public function dismiss(): void
    {
        if (!current_user_can('activate_plugins')) wp_die(esc_html(__('You cannot dismiss this notice.', 'pixflow-design')), '', ['response' => 403]);
        check_admin_referer(self::ACTION);
        update_user_meta(get_current_user_id(), self::DISMISSED, 1);
        wp_safe_redirect(wp_get_referer() ?: admin_url());
        exit;
    }
}
