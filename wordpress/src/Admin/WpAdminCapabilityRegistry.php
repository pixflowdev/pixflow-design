<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Server-owned manifest for the WP Admin capability plane.
 *
 * The manifest is intentionally explicit. WordPress/third-party public
 * abilities are never copied into this registry merely because they exist.
 * Each adopted family must supply its own gate and each capability must have
 * a declared schema, risk, mode, permission, idempotency, and rollback policy.
 */
final class WpAdminCapabilityRegistry
{
    private const CACHE_KEY = 'pixflow_design_wp_admin_capability_families_v1';
    private const CACHE_TTL = 300;

    /** @var array<string, array<string, mixed>>|null */
    private ?array $manifest = null;
    private string $contributionSignature = '';

    public function register(): void
    {
        add_action('activated_plugin', [$this, 'invalidate'], 10, 2);
        add_action('deactivated_plugin', [$this, 'invalidate'], 10, 2);
        add_action('upgrader_process_complete', [$this, 'invalidate'], 10, 2);
        add_action('switch_theme', [$this, 'invalidate']);
        add_action('updated_option', [$this, 'invalidate_option'], 10, 3);
        add_action('added_option', [$this, 'invalidate_option'], 10, 2);
        add_action('deleted_option', [$this, 'invalidate_option'], 10, 1);
        add_action('update_site_option_active_sitewide_plugins', [$this, 'invalidate']);

        // WordPress 6.9+ exposes the Abilities API. The adapter is optional;
        // Pixflow routes remain authoritative on older and newer versions.
        if (function_exists('wp_register_ability')) {
            add_action('wp_abilities_api_categories_init', [$this, 'register_native_category'], 20);
            add_action('wp_abilities_api_init', [$this, 'register_native_read_only_adapters'], 20);
        }
    }

    public function invalidate(...$unused): void
    {
        $this->manifest = null;
        delete_transient(self::CACHE_KEY);
    }

    public function invalidate_option($option = null, ...$unused): void
    {
        if (in_array((string) $option, ['active_plugins', 'stylesheet', 'template', 'uninstall_plugins'], true)) {
            $this->invalidate();
        }
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function manifest(): array
    {
        $signature = implode(',', array_keys(\PixflowDesign\WordPress\Modules\FeatureContributions::all())) . '|' . implode(',', array_keys(\PixflowDesign\WordPress\Modules\BuilderIntegrations::all()));
        if ($signature !== $this->contributionSignature) {
            $this->manifest = null;
            $this->contributionSignature = $signature;
        }
        if ($this->manifest !== null) {
            return $this->manifest;
        }

        $this->manifest = [
            'wordpress-core' => [
                'slug' => 'wordpress-core',
                'label' => 'WordPress Core',
                'description' => 'Bounded, resource-aware WordPress Admin reads.',
                'group' => 'core',
                'gate' => static fn(): array => [
                    'available' => true,
                    'status' => 'active',
                    'version' => (string) get_bloginfo('version'),
                    'edition' => 'free',
                    'reason' => null,
                ],
                'versionFloors' => [],
                'editions' => ['free'],
                'loader' => null,
                'linkedSkillIds' => ['wordpress-admin-context'],
                'capabilities' => $this->core_capabilities(),
            ],
            'wordpress-gutenberg' => [
                'slug' => 'wordpress-gutenberg',
                'label' => 'WordPress Block Editor',
                'description' => 'Exact block-document discovery and validation through a dedicated typed capability family.',
                'group' => 'core',
                'gate' => static fn(): array => [
                    'available' => function_exists('parse_blocks') && class_exists('WP_Block_Type_Registry'),
                    'status' => function_exists('parse_blocks') && class_exists('WP_Block_Type_Registry') ? 'active' : 'incompatible',
                    'version' => (string) get_bloginfo('version'),
                    'edition' => 'free',
                    'reason' => function_exists('parse_blocks') && class_exists('WP_Block_Type_Registry') ? null : 'block_editor_runtime_unavailable',
                ],
                'versionFloors' => [['version' => '6.0.0', 'kind' => 'tested-foundation']],
                'editions' => ['free'],
                'loader' => 'wordpress-gutenberg',
                'linkedSkillIds' => ['wordpress-gutenberg-authoring'],
                'capabilities' => $this->gutenberg_capabilities(),
            ],


        ];

        foreach (\PixflowDesign\WordPress\Modules\BuilderIntegrations::all() as $integration) if (isset($integration['capabilityFamilies'])) $this->manifest += ($integration['capabilityFamilies'])();
        foreach (\PixflowDesign\WordPress\Modules\FeatureContributions::all() as $feature) if (isset($feature['capabilityFamilies'])) $this->manifest += ($feature['capabilityFamilies'])();
        $this->append_integration_catalogue();

        $this->assert_manifest($this->manifest);
        return $this->manifest;
    }

    /**
     * Add the full Pixflow-owned catalogue while retaining dedicated Core,
     * ACF, and Bricks adapters above. Status leaves stay discoverable even
     * when their package gate is unavailable so the agent can explain why a
     * family cannot be used; every other leaf remains gate-hidden.
     */
    private function append_integration_catalogue(): void
    {
        foreach (WpAdminIntegrationCatalogue::definitions() as $slug => $definition) {
            $status_capability = $this->integration_status_capability($definition);
            if (isset($this->manifest[$slug])) {
                $existing = $this->manifest[$slug];
                $existing['linkedSkillIds'] = array_values(array_unique(array_merge(
                    (array) ($existing['linkedSkillIds'] ?? []),
                    (array) ($definition['linkedSkillIds'] ?? []),
                )));
                $existing_ids = array_map(static fn(array $capability): string => (string) ($capability['id'] ?? ''), (array) ($existing['capabilities'] ?? []));
                if (!in_array((string) $status_capability['id'], $existing_ids, true)) {
                    $existing['capabilities'][] = $status_capability;
                }
                $this->manifest[$slug] = $existing;
                continue;
            }

            $this->manifest[$slug] = [
                'slug' => $slug,
                'label' => (string) ($definition['label'] ?? $slug),
                'description' => (string) ($definition['description'] ?? ''),
                'group' => (string) ($definition['category'] ?? 'integration'),
                'gate' => static fn(): array => (new WpAdminIntegrationCatalogue())->gate($slug),
                'versionFloors' => (array) ($definition['versionFloors'] ?? []),
                'editions' => (array) ($definition['editions'] ?? []),
                'loader' => null,
                'linkedSkillIds' => (array) ($definition['linkedSkillIds'] ?? []),
                'capabilities' => [$status_capability],
            ];
        }
    }

    /** @param array<string, mixed> $definition @return array<string, mixed> */
    private function integration_status_capability(array $definition): array
    {
        $slug = sanitize_key((string) ($definition['slug'] ?? ''));
        $skill_id = 'wp-admin-integration-' . $slug;
        return [
            'id' => 'pixflow/wp-admin/integrations/' . $slug . '/status',
            'label' => 'Read ' . (string) ($definition['label'] ?? $slug) . ' Status',
            'description' => 'Returns bounded, redacted Pixflow catalogue status for ' . (string) ($definition['label'] ?? $slug) . '; it never invokes generic plugin abilities.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => ['integration' => ['type' => 'string', 'enum' => [$slug]]],
                'required' => ['integration'],
                'additionalProperties' => false,
            ],
            'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
            'risk' => 'read_only',
            'idempotency' => 'idempotent',
            'reversible' => false,
            'requiresApproval' => false,
            'allowedModes' => ['ask', 'chat', 'plan', 'design'],
            'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
            'rollback' => ['supported' => false, 'policy' => 'none'],
            'handler' => 'integration_status',
            'linkedSkillIds' => ['wp-admin-integrations', $skill_id],
        ];
    }

    /**
     * @return array{families: list<array<string, mixed>>, unavailable: list<array<string, mixed>>}
     */
    public function family_summary(): array
    {
        $families = [];
        $unavailable = [];
        foreach ($this->manifest() as $family) {
            $gate = is_callable($family['gate'] ?? null) ? (array) call_user_func($family['gate']) : [];
            $available = ($gate['available'] ?? false) === true;
            $summary = [
                'id' => (string) $family['slug'],
                'label' => (string) $family['label'],
                'description' => (string) $family['description'],
                'group' => (string) $family['group'],
                'capabilityCount' => $available ? count((array) ($family['capabilities'] ?? [])) : 0,
                'available' => $available,
                'integrationId' => (string) $family['slug'],
                'linkedSkillIds' => array_values(array_map('strval', (array) ($family['linkedSkillIds'] ?? []))),
                'version' => isset($gate['version']) ? (string) $gate['version'] : null,
                'edition' => isset($gate['edition']) ? (string) $gate['edition'] : null,
            ];
            foreach ((array) ($family['capabilities'] ?? []) as $candidate) {
                if (is_array($candidate) && ($candidate['handler'] ?? '') === 'integration_status') {
                    $summary['statusCapabilityId'] = (string) ($candidate['id'] ?? '');
                    break;
                }
            }
            if ($available) {
                $summary['capabilities'] = [];
                foreach ($this->capabilities() as $capability) {
                    if ((string) ($capability['familyId'] ?? '') !== (string) $family['slug']) continue;
                    $summary['capabilities'][] = [
                        'id' => (string) ($capability['id'] ?? ''),
                        'label' => (string) ($capability['label'] ?? ''),
                        'risk' => (string) ($capability['annotations']['risk'] ?? 'unknown'),
                        'allowedModes' => array_values(array_map('strval', (array) ($capability['allowedModes'] ?? []))),
                    ];
                }
                $summary['capabilityIds'] = array_values(array_map(
                    static fn(array $capability): string => (string) ($capability['id'] ?? ''),
                    (array) ($summary['capabilities'] ?? []),
                ));
                if (\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($family['slug'])) {
                    $catalogue = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get($family['slug'], 'catalogue');
                    foreach ($catalogue ? $catalogue() : [] as $id => $tool) $summary['capabilities'][] = ['id' => $id, 'label' => $tool['label'] ?? $id];
                    $summary['capabilityCount'] = count($summary['capabilities']);
                    $summary['capabilityIds'] = array_column($summary['capabilities'], 'id');
                }
                $families[] = $summary;
                continue;
            }
            $unavailable[] = [
                'id' => $summary['id'],
                'label' => $summary['label'],
                'requiresPro' => ($gate['reason'] ?? '') === 'pro_integration_unavailable',
                'reason' => in_array((string) ($gate['status'] ?? 'unknown'), ['missing', 'inactive', 'incompatible'], true)
                    ? (string) $gate['status']
                    : 'unknown',
                'version' => $summary['version'],
                'requiredVersion' => isset($family['versionFloors'][0]['version'])
                    ? (string) $family['versionFloors'][0]['version']
                    : null,
                'diagnostic' => sanitize_text_field((string) ($gate['reason'] ?? 'family_unavailable')),
                'statusCapabilityId' => $summary['statusCapabilityId'] ?? null,
                'linkedSkillIds' => $summary['linkedSkillIds'],
                'supportTier' => (string) ($family['supportTier'] ?? 'status-read'),
            ];
        }

        return ['families' => $families, 'unavailable' => $unavailable];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function capabilities(): array
    {
        $available = [];
        foreach ($this->manifest() as $family) {
            $gate = is_callable($family['gate'] ?? null) ? (array) call_user_func($family['gate']) : [];
            $is_available = ($gate['available'] ?? false) === true;
            $capabilities = (array) ($family['capabilities'] ?? []);
            $has_status_capability = false;
            foreach ($capabilities as $candidate) {
                if (is_array($candidate) && ($candidate['handler'] ?? '') === 'integration_status') {
                    $has_status_capability = true;
                    break;
                }
            }
            if (!$is_available && !$has_status_capability) {
                continue;
            }
            foreach ($capabilities as $capability) {
                if (!is_array($capability)) continue;
                $is_status_capability = (($capability['handler'] ?? '') === 'integration_status');
                if (!$is_available && !$is_status_capability) continue;
                if (isset($capability['requiresFunction']) && !function_exists((string) $capability['requiresFunction'])) continue;
                $available[] = $this->public_capability($capability, $family, $gate);
            }
        }

        return $available;
    }

    public function find(string $id): ?array
    {
        foreach ($this->capabilities() as $capability) {
            if ((string) ($capability['id'] ?? '') === trim($id)) {
                return $capability;
            }
        }
        return null;
    }

    /** @return array<string, mixed> */
    public function native_definition(string $id): ?array
    {
        foreach ($this->manifest() as $family) {
            foreach ((array) ($family['capabilities'] ?? []) as $capability) {
                if (is_array($capability) && (string) ($capability['id'] ?? '') === $id) return $capability;
            }
        }
        return null;
    }

    /** @return list<array<string, mixed>> */
    private function core_capabilities(): array
    {
        $read_modes = ['ask', 'chat', 'plan', 'design'];
        return [
            [
                'id' => 'pixflow/wp-admin/context',
                'label' => 'Read Admin Context',
                'description' => 'Reads the bounded server-verified WordPress Admin screen and resource context.',
                'inputSchema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'context', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/list-post-types',
                'label' => 'List Post Types',
                'description' => 'Lists public and editable post types without exposing option or filesystem state.',
                'inputSchema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true], 'maxItems' => 100],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'list_post_types', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/get-post',
                'label' => 'Read Post',
                'description' => 'Reads bounded post metadata only. Gutenberg body and structure require pixflow/wp-admin/gutenberg/read-document.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => ['postId' => ['type' => 'integer', 'minimum' => 1]],
                    'required' => ['postId'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['read_post'], 'targetType' => 'post'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'get_post', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/list-taxonomies',
                'label' => 'List Taxonomies',
                'description' => 'Lists registered taxonomies and their public/editable status.',
                'inputSchema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true], 'maxItems' => 200],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'list_taxonomies', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/list-terms',
                'label' => 'List Taxonomy Terms',
                'description' => 'Lists bounded terms for one taxonomy after checking its assignment capability.',
                'inputSchema' => ['type' => 'object', 'properties' => ['taxonomy' => ['type' => 'string', 'maxLength' => 64], 'search' => ['type' => 'string', 'maxLength' => 160], 'perPage' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100]], 'required' => ['taxonomy'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'list_terms', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/list-media',
                'label' => 'List Media',
                'description' => 'Lists bounded WordPress media attachments without exposing file contents.',
                'inputSchema' => ['type' => 'object', 'properties' => ['search' => ['type' => 'string', 'maxLength' => 160], 'mimeType' => ['type' => 'string', 'enum' => ['image', 'audio', 'video', 'application']], 'page' => ['type' => 'integer', 'minimum' => 1], 'perPage' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50]], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['upload_files'], 'targetType' => 'site'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'list_media', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/get-media',
                'label' => 'Read Media Attachment',
                'description' => 'Reads bounded metadata for one WordPress media attachment.',
                'inputSchema' => ['type' => 'object', 'properties' => ['attachmentId' => ['type' => 'integer', 'minimum' => 1]], 'required' => ['attachmentId'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['read_post'], 'targetType' => 'media'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'get_media', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/list-posts',
                'label' => 'List Posts',
                'description' => 'Lists bounded editable WordPress content using the live post type capability map. When postType is omitted, searches across all supported editable content types.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postType' => ['type' => 'string', 'maxLength' => 64], 'status' => ['type' => 'string', 'maxLength' => 32], 'search' => ['type' => 'string', 'maxLength' => 160], 'page' => ['type' => 'integer', 'minimum' => 1], 'perPage' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50]], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'array', 'items' => ['type' => 'object', 'additionalProperties' => true], 'maxItems' => 50],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false, 'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'], 'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'list_posts', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/create-post',
                'label' => 'Create Draft Post',
                'description' => 'Creates a draft WordPress post through an explicit post-type capability map.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postType' => ['type' => 'string', 'maxLength' => 64], 'title' => ['type' => 'string', 'maxLength' => 200], 'slug' => ['type' => 'string', 'maxLength' => 200], 'status' => ['type' => 'string', 'enum' => ['draft', 'pending', 'private', 'publish']], 'content' => ['type' => 'string', 'maxLength' => 100000], 'excerpt' => ['type' => 'string', 'maxLength' => 5000], 'parent' => ['type' => 'integer', 'minimum' => 0], 'terms' => ['type' => 'object', 'maxProperties' => 16, 'additionalProperties' => true], 'featuredMediaId' => ['type' => 'integer', 'minimum' => 1]], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'reversible_write', 'idempotency' => 'non_idempotent', 'reversible' => true, 'requiresApproval' => false, 'allowedModes' => ['design'],
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'], 'rollback' => ['supported' => true, 'policy' => 'revision'],
                'handler' => 'create_post', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/update-post',
                'label' => 'Update Post',
                'description' => 'Updates allowlisted WordPress post fields with an optimistic modified-time precondition.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postId' => ['type' => 'integer', 'minimum' => 1], 'expectedModifiedGmt' => ['type' => 'string', 'maxLength' => 32], 'fields' => ['type' => 'object', 'additionalProperties' => true]], 'required' => ['postId', 'expectedModifiedGmt', 'fields'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'reversible_write', 'idempotency' => 'idempotent', 'reversible' => true, 'requiresApproval' => false, 'allowedModes' => ['design'],
                'permission' => ['required' => ['edit_post'], 'targetType' => 'post'], 'rollback' => ['supported' => true, 'policy' => 'recorded_before_state'],
                'handler' => 'update_post', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/trash-post',
                'label' => 'Trash WordPress Content',
                'description' => 'Moves one exact, revision-matched WordPress content item to trash without deleting referenced Media Library attachments, and supports restoration.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postId' => ['type' => 'integer', 'minimum' => 1], 'expectedModifiedGmt' => ['type' => 'string', 'maxLength' => 32], 'expectedFingerprint' => ['type' => 'string', 'maxLength' => 128]], 'required' => ['postId', 'expectedModifiedGmt'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'destructive', 'idempotency' => 'idempotent', 'reversible' => true, 'requiresApproval' => true, 'allowedModes' => ['design'],
                'permission' => ['required' => ['delete_post'], 'targetType' => 'post'], 'rollback' => ['supported' => true, 'policy' => 'restore_trashed_post'],
                'handler' => 'trash_post', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/restore-post',
                'label' => 'Restore WordPress Content',
                'description' => 'Restores one exact, revision-matched WordPress content item from trash without changing its content or referenced Media Library attachments.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postId' => ['type' => 'integer', 'minimum' => 1], 'expectedModifiedGmt' => ['type' => 'string', 'maxLength' => 32], 'expectedFingerprint' => ['type' => 'string', 'maxLength' => 128]], 'required' => ['postId', 'expectedModifiedGmt'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'reversible_write', 'idempotency' => 'idempotent', 'reversible' => true, 'requiresApproval' => false, 'allowedModes' => ['design'],
                'permission' => ['required' => ['delete_post'], 'targetType' => 'post'], 'rollback' => ['supported' => true, 'policy' => 'retrash_restored_post'],
                'handler' => 'restore_post', 'linkedSkillIds' => ['wordpress-admin-context'],
            ],
            [
                'id' => 'pixflow/wp-admin/read-settings',
                'label' => 'Read Site Settings',
                'description' => 'Reads the small, allowlisted WordPress site-settings view with a current fingerprint.',
                'inputSchema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'read_only', 'idempotency' => 'idempotent', 'reversible' => false,
                'requiresApproval' => false, 'allowedModes' => $read_modes,
                'permission' => ['required' => ['manage_options'], 'targetType' => 'site'],
                'rollback' => ['supported' => false, 'policy' => 'none'],
                'handler' => 'settings_read', 'linkedSkillIds' => ['wordpress-admin-settings'],
            ],
            [
                'id' => 'pixflow/wp-admin/update-settings',
                'label' => 'Update Site Settings',
                'description' => 'Updates only explicitly allowlisted WordPress site settings after an exact read fingerprint and approval.',
                'inputSchema' => ['type' => 'object', 'properties' => ['settings' => ['type' => 'object', 'maxProperties' => 7, 'additionalProperties' => true], 'expectedFingerprint' => ['type' => 'string', 'maxLength' => 128]], 'required' => ['settings', 'expectedFingerprint'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'privileged', 'idempotency' => 'idempotent', 'reversible' => true,
                'requiresApproval' => true, 'allowedModes' => ['design'],
                'permission' => ['required' => ['manage_options'], 'targetType' => 'site'],
                'rollback' => ['supported' => true, 'policy' => 'recorded_before_state'],
                'handler' => 'settings_update', 'linkedSkillIds' => ['wordpress-admin-settings'],
            ],
            [
                'id' => 'pixflow/wp-admin/create-term',
                'label' => 'Create Taxonomy Term',
                'description' => 'Creates one bounded taxonomy term after checking the taxonomy-specific management capability.',
                'inputSchema' => ['type' => 'object', 'properties' => ['taxonomy' => ['type' => 'string', 'maxLength' => 64], 'name' => ['type' => 'string', 'maxLength' => 200], 'slug' => ['type' => 'string', 'maxLength' => 200], 'description' => ['type' => 'string', 'maxLength' => 1000], 'parent' => ['type' => 'integer', 'minimum' => 0]], 'required' => ['taxonomy', 'name'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'reversible_write', 'idempotency' => 'non_idempotent', 'reversible' => true,
                'requiresApproval' => false, 'allowedModes' => ['design'],
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
                'rollback' => ['supported' => true, 'policy' => 'delete_unused_created_term'],
                'handler' => 'create_term', 'linkedSkillIds' => ['wordpress-admin-content'],
            ],
            [
                'id' => 'pixflow/wp-admin/update-term',
                'label' => 'Update Taxonomy Term',
                'description' => 'Updates an existing taxonomy term using an exact fingerprint and an allowlisted field set.',
                'inputSchema' => ['type' => 'object', 'properties' => ['taxonomy' => ['type' => 'string', 'maxLength' => 64], 'termId' => ['type' => 'integer', 'minimum' => 1], 'expectedFingerprint' => ['type' => 'string', 'maxLength' => 128], 'fields' => ['type' => 'object', 'additionalProperties' => true]], 'required' => ['taxonomy', 'termId', 'expectedFingerprint', 'fields'], 'additionalProperties' => false],
                'outputSchema' => ['type' => 'object', 'additionalProperties' => true],
                'risk' => 'reversible_write', 'idempotency' => 'idempotent', 'reversible' => true,
                'requiresApproval' => false, 'allowedModes' => ['design'],
                'permission' => ['required' => ['edit_posts'], 'targetType' => 'site'],
                'rollback' => ['supported' => true, 'policy' => 'recorded_before_state'],
                'handler' => 'update_term', 'linkedSkillIds' => ['wordpress-admin-content'],
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function gutenberg_capabilities(): array
    {
        $read_modes = ['ask', 'chat', 'plan', 'design'];
        $post_id = ['type' => 'integer', 'minimum' => 1];
        $fingerprint = ['type' => 'string', 'maxLength' => 128];
        $read_permission = ['required' => ['read_post'], 'targetType' => 'post'];
        $edit_permission = ['required' => ['edit_post'], 'targetType' => 'post'];
        $output = ['type' => 'object', 'additionalProperties' => true];
        $common = [
            'outputSchema' => $output,
            'risk' => 'read_only',
            'idempotency' => 'idempotent',
            'reversible' => false,
            'requiresApproval' => false,
            'allowedModes' => $read_modes,
            'rollback' => ['supported' => false, 'policy' => 'none'],
            'linkedSkillIds' => ['wordpress-gutenberg-authoring'],
        ];

        return [
            [
                ...$common,
                'id' => 'pixflow/wp-admin/gutenberg/status',
                'label' => 'Inspect Block Editor Status',
                'description' => 'Checks whether one exact post is editable through the WordPress Block Editor and reports its current fingerprint.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postId' => $post_id], 'required' => ['postId'], 'additionalProperties' => false],
                'permission' => $read_permission,
                'handler' => 'gutenberg_status',
            ],
            [
                ...$common,
                'id' => 'pixflow/wp-admin/gutenberg/list-block-types',
                'label' => 'List Block Editor Types',
                'description' => 'Lists server-registered block types for the exact target while clearly requiring browser discovery for complete editor evidence.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postId' => $post_id, 'search' => ['type' => 'string', 'maxLength' => 160], 'perPage' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 500]], 'required' => ['postId'], 'additionalProperties' => false],
                'permission' => $read_permission,
                'handler' => 'gutenberg_list_block_types',
            ],
            [
                ...$common,
                'id' => 'pixflow/wp-admin/gutenberg/get-block-type',
                'label' => 'Read Block Editor Type',
                'description' => 'Reads attributes, supports, nesting constraints, and Pixflow support status for one server-registered block.',
                'inputSchema' => ['type' => 'object', 'properties' => ['postId' => $post_id, 'name' => ['type' => 'string', 'maxLength' => 160]], 'required' => ['postId', 'name'], 'additionalProperties' => false],
                'permission' => $read_permission,
                'handler' => 'gutenberg_get_block_type',
            ],
            [
                ...$common,
                'id' => 'pixflow/wp-admin/gutenberg/read-document',
                'label' => 'Read Block Editor Document',
                'description' => 'Reads the exact canonical post content, parsed block tree, related post fields, and content fingerprint without text sanitisation.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'postId' => $post_id,
                        'snapshotId' => ['type' => 'string', 'maxLength' => 80],
                        'cursor' => ['type' => 'integer', 'minimum' => 0],
                    ],
                    'required' => ['postId'],
                    'additionalProperties' => false,
                ],
                'permission' => $read_permission,
                'handler' => 'gutenberg_read_document',
            ],
            [
                ...$common,
                'id' => 'pixflow/wp-admin/gutenberg/validate-document',
                'label' => 'Validate Block Editor Document',
                'description' => 'Validates a typed block tree, nesting constraints, support evidence, and Media Library bindings without changing the post.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'postId' => $post_id,
                        'expectedFingerprint' => $fingerprint,
                        'blocks' => ['type' => 'array', 'format' => 'pixflow-gutenberg-block-tree'],
                    ],
                    'required' => ['postId', 'expectedFingerprint', 'blocks'],
                    'additionalProperties' => false,
                ],
                'permission' => $edit_permission,
                'handler' => 'gutenberg_validate_document',
            ],
            [
                'id' => 'pixflow/wp-admin/gutenberg/apply-document',
                'label' => 'Apply Block Editor Document',
                'description' => 'Applies one browser-serialized, reviewed full Gutenberg document and related post fields as an exact rollback-capable transaction.',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => [
                        'postId' => $post_id,
                        'expectedFingerprint' => $fingerprint,
                        'preparedReceiptId' => ['type' => 'string', 'maxLength' => 64],
                        'preparedSessionId' => ['type' => 'string', 'maxLength' => 160],
                        'contentIntent' => ['type' => 'string', 'enum' => ['replace']],
                        'post' => [
                            'type' => 'object',
                            'properties' => [
                                'title' => ['type' => 'string', 'maxLength' => 400],
                                'excerpt' => ['type' => 'string', 'maxLength' => 4000],
                                'status' => ['type' => 'string', 'enum' => ['draft', 'pending', 'private', 'publish']],
                            ],
                            'additionalProperties' => false,
                        ],
                        'terms' => ['type' => 'object', 'additionalProperties' => true],
                        'featuredMediaId' => ['type' => 'integer', 'minimum' => 0],
                        'review' => ['type' => 'object', 'additionalProperties' => true],
                    ],
                    'required' => ['postId', 'expectedFingerprint', 'preparedReceiptId', 'preparedSessionId', 'contentIntent'],
                    'additionalProperties' => false,
                ],
                'outputSchema' => $output,
                'risk' => 'reversible_write',
                'idempotency' => 'idempotent',
                'reversible' => true,
                'requiresApproval' => true,
                'allowedModes' => ['design'],
                'permission' => $edit_permission,
                'rollback' => ['supported' => true, 'policy' => 'recorded_exact_document'],
                'handler' => 'gutenberg_apply_document',
                'linkedSkillIds' => ['wordpress-gutenberg-authoring'],
            ],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function public_capability(array $capability, array $family, array $gate): array
    {
        return [
            'id' => (string) ($capability['id'] ?? ''),
            'familyId' => (string) ($family['slug'] ?? ''),
            'label' => (string) ($capability['label'] ?? ''),
            'description' => (string) ($capability['description'] ?? ''),
            'inputSchema' => (array) ($capability['inputSchema'] ?? ['type' => 'object']),
            'outputSchema' => (array) ($capability['outputSchema'] ?? ['type' => 'object']),
            'annotations' => [
                'risk' => (string) ($capability['risk'] ?? 'unknown'),
                'idempotency' => (string) ($capability['idempotency'] ?? 'unknown'),
                'reversible' => (bool) ($capability['reversible'] ?? false),
                'requiresApproval' => (bool) ($capability['requiresApproval'] ?? true),
            ],
            'integrationId' => (string) ($family['slug'] ?? ''),
            'linkedSkillIds' => array_values(array_map('strval', (array) ($capability['linkedSkillIds'] ?? $family['linkedSkillIds'] ?? []))),
            'availability' => ($gate['available'] ?? false) === true ? 'available' : 'unavailable',
            'allowedModes' => array_values(array_map('strval', (array) ($capability['allowedModes'] ?? []))),
            'permission' => (array) ($capability['permission'] ?? ['required' => [], 'targetType' => 'unknown']),
            'rollback' => (array) ($capability['rollback'] ?? ['supported' => false, 'policy' => 'none']),
        ];
    }

    /** @param array<string, array<string, mixed>> $manifest */
    private function assert_manifest(array $manifest): void
    {
        $ids = [];
        foreach ($manifest as $key => $family) {
            if ((string) ($family['slug'] ?? '') !== $key || !is_callable($family['gate'] ?? null)) {
                throw new \RuntimeException('Invalid Pixflow capability family declaration.');
            }
            foreach ((array) ($family['capabilities'] ?? []) as $capability) {
                $id = (string) ($capability['id'] ?? '');
                if ($id === '' || isset($ids[$id])) throw new \RuntimeException('Duplicate or empty Pixflow capability id.');
                $ids[$id] = true;
                if (!in_array((string) ($capability['risk'] ?? 'unknown'), ['read_only', 'reversible_write', 'destructive', 'privileged', 'code_filesystem'], true)) {
                    throw new \RuntimeException('Pixflow capability risk must fail closed.');
                }
                if (!is_array($capability['inputSchema'] ?? null) || !is_array($capability['outputSchema'] ?? null)) {
                    throw new \RuntimeException('Pixflow capability schema is invalid.');
                }
            }
        }
    }

    public function register_native_read_only_adapters(): void
    {
        if (!function_exists('wp_register_ability')) return;
        foreach ($this->capabilities() as $capability) {
            if (($capability['annotations']['risk'] ?? 'unknown') !== 'read_only') continue;
            $name = 'pixflow/' . sanitize_key(str_replace('/', '-', (string) ($capability['id'] ?? '')));
            if (function_exists('wp_has_ability') && wp_has_ability($name)) continue;
            wp_register_ability($name, [
                'label' => (string) ($capability['label'] ?? ''),
                'description' => (string) ($capability['description'] ?? ''),
                'category' => 'pixflow-design',
                'input_schema' => (array) ($capability['inputSchema'] ?? ['type' => 'object']),
                'output_schema' => (array) ($capability['outputSchema'] ?? ['type' => 'object']),
                'permission_callback' => static fn(): bool => WpAdminSurfacePolicy::can_use(),
                // The Pixflow REST executor remains authoritative. Native
                // registration is a metadata compatibility mirror only.
                'execute_callback' => static fn(): \WP_Error => new \WP_Error(
                    'pixflow_native_dispatch_required',
                    'Use the Pixflow WP Admin capability route for execution.',
                ),
                'meta' => ['pixflow' => ['registry' => true, 'execution' => 'rest']],
            ]);
        }
    }

    public function register_native_category(): void
    {
        if (!function_exists('wp_register_ability_category')) return;
        if (function_exists('wp_has_ability_category') && wp_has_ability_category('pixflow-design')) return;
        wp_register_ability_category('pixflow-design', [
            'label' => 'Pixflow Design',
            'description' => 'Read-only metadata mirrors for Pixflow Design typed WordPress Admin capabilities.',
        ]);
    }
}
