<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/** Read-only adapter for the Pixflow integration catalogue. */
final class WpAdminIntegrationStatusService
{
    public function __construct(
        private readonly WpAdminIntegrationCatalogue $catalogue = new WpAdminIntegrationCatalogue(),
    ) {
    }

    /** @return array<string, mixed>|\WP_Error */
    public function status(array $arguments): array|\WP_Error
    {
        $slug = sanitize_key((string) ($arguments['integration'] ?? $arguments['slug'] ?? ''));
        if ($slug === '' || $this->catalogue->get_definition($slug) === null) {
            return new \WP_Error('integration_not_catalogued', 'The requested integration is not in the Pixflow catalogue.', ['status' => 404]);
        }

        return $this->catalogue->status($slug);
    }
}
