<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Bridge;

if (!defined('ABSPATH')) {
    exit;
}

final class BridgeConfig
{
    public function base_url(): string
    {
        $configured_url = '';

        if (defined('PIXFLOW_DESIGN_BRIDGE_URL') && is_string(PIXFLOW_DESIGN_BRIDGE_URL)) {
            $configured_url = trim(PIXFLOW_DESIGN_BRIDGE_URL);
        }

        if ($configured_url === '') {
            $configured_url = (string) get_option('pixflow_design_bridge_url', 'http://127.0.0.1:7456');
        }

        $filtered_url = apply_filters('pixflow_design_bridge_url', $configured_url);
        $url = is_string($filtered_url) ? trim($filtered_url) : $configured_url;

        return rtrim($url, '/');
    }

    public function origin(): string
    {
        $parts = wp_parse_url($this->base_url());

        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $origin = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
        if (!empty($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }

        return $origin;
    }
}
