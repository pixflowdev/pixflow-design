<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pixflow-owned catalogue and detector for WP Admin integrations.
 *
 * The catalogue is deliberately metadata-only. It never invokes a plugin
 * ability, evaluates plugin code, exposes a filesystem path, or treats a
 * display name as authority. Native write adapters are declared separately in
 * the capability registry and remain opt-in.
 */
final class WpAdminIntegrationCatalogue
{
    /** @var array<string, array<string, mixed>>|null */
    private static ?array $definitions = null;

    /** @var array<string, mixed>|null */
    private static ?array $inventory = null;

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function definitions(): array
    {
        if (self::$definitions !== null) {
            return self::$definitions;
        }

        $read_only = 'status-read';
        self::$definitions = [
            'wordpress-core' => self::definition('wordpress-core', 'WordPress Core', 'core', 'Bounded WordPress Admin context, content, taxonomy, media, and settings.', [], [], ['free'], $read_only, ['wordpress-admin-context', 'wordpress-admin-content', 'wordpress-admin-settings']),
            'ase' => self::definition('ase', 'Admin and Site Enhancements', 'field', 'Detects the active Admin and Site Enhancements family before any Pixflow adapter is selected.', ['admin-site-enhancements/admin-site-enhancements.php'], ['ASE_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-ase'], [], ['ase_init']),
            'pods' => self::definition('pods', 'Pods', 'field', 'Detects Pods content-model APIs for a future resource-scoped adapter.', ['pods/init.php', 'pods/pods.php'], ['PODS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-pods'], [], ['pods']),
            'jetengine' => self::definition('jetengine', 'JetEngine', 'field', 'Uses the dedicated Pixflow adapter for post types, taxonomies, meta boxes, and options pages.', ['jet-engine/jet-engine.php'], [], ['free', 'pro'], 'native-write', ['wp-admin-jetengine', 'wp-admin-integration-jetengine'], [], ['jet_engine'], ['Jet_Engine']),
            'acf' => self::definition('acf', 'Advanced Custom Fields', 'field', 'Uses the dedicated Pixflow ACF schema and value adapters when ACF is active.', ['advanced-custom-fields/acf.php', 'advanced-custom-fields-pro/acf.php'], ['ACF_VERSION'], ['free', 'pro'], 'native-write', ['acf-integration', 'acf-content-model', 'wp-admin-integration-acf'], ['ACF_PRO'], ['acf_get_field_groups', 'get_field']),
            'metabox' => self::definition('metabox', 'Meta Box', 'field', 'Detects Meta Box field, post-type, taxonomy, and relationship APIs.', ['meta-box/meta-box.php'], ['RWMB_VER', 'META_BOX_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-metabox'], [], ['rwmb_meta']),
            'acpt' => self::definition('acpt', 'Advanced Custom Post Types', 'field', 'Detects ACPT content-model APIs for a future typed adapter.', ['advanced-custom-post-types/advanced-custom-post-types.php', 'acpt/acpt.php'], ['ACPT_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-acpt'], [], ['acpt']),
            'yoast' => self::definition('yoast', 'Yoast SEO', 'seo', 'Detects Yoast SEO post and term metadata surfaces with credentials excluded.', ['wordpress-seo/wp-seo.php'], ['WPSEO_VERSION', 'WPSEO_PREMIUM_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-yoast'], ['WPSEO_PREMIUM_VERSION'], ['wpseo_init']),
            'rank-math' => self::definition('rank-math', 'Rank Math SEO', 'seo', 'Detects Rank Math SEO settings, schema, and metadata APIs.', ['seo-by-rank-math/rank-math.php'], ['RANK_MATH_VERSION'], ['free'], $read_only, ['wp-admin-integration-rank-math'], [], ['rank_math']),
            'aioseo' => self::definition('aioseo', 'All in One SEO', 'seo', 'Detects All in One SEO metadata and redirect surfaces.', ['all-in-one-seo-pack/all_in_one_seo_pack.php'], ['AIOSEO_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-aioseo'], [], ['aioseo']),
            'seopress' => self::definition('seopress', 'SEOPress', 'seo', 'Detects SEOPress metadata, schema, and redirect surfaces.', ['wp-seopress/seopress.php'], ['SEOPRESS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-seopress'], [], ['seopress_init']),
            'bricks' => self::definition('bricks', 'Bricks Builder', 'builder', 'Uses the dedicated Pixflow Bricks Admin status and template/settings adapters.', [], ['BRICKS_VERSION'], ['free', 'pro'], 'native-write', ['bricks-admin', 'wp-admin-integration-bricks'], [], ['bricks_is_builder']),
            'bricksforge' => self::definition('bricksforge', 'Bricksforge', 'builder', 'Detects Bricksforge tools and custom elements without generic builder writes.', ['bricksforge/bricksforge.php'], ['BRICKSFORGE_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-bricksforge'], [], ['bricksforge']),
            'elementor' => self::definition('elementor', 'Elementor', 'builder', 'Live Elementor document editing, installed element schemas, native saving and history. Pro and add-on elements are available only when installed.', ['elementor/elementor.php'], ['ELEMENTOR_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-elementor'], [], ['elementor']),
            'divi' => self::definition('divi', 'Divi', 'builder', 'Detects Divi theme and builder APIs without editing builder storage.', [], ['ET_BUILDER_VERSION', 'ET_CORE_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-divi'], [], ['et_builder_init']),
            'avada' => self::definition('avada', 'Avada', 'builder', 'Detects Avada theme and Fusion Builder surfaces.', ['fusion-builder/fusion-builder.php'], ['AVADA_VERSION', 'FUSION_BUILDER_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-avada'], [], ['fusion_builder_init']),
            'wpbakery' => self::definition('wpbakery', 'WPBakery', 'builder', 'Detects WPBakery content and element schemas without direct post-meta mutation.', ['js_composer/js_composer.php'], ['WPB_VC_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-wpbakery'], [], ['vc_set_as_theme']),
            'breakdance' => self::definition('breakdance', 'Breakdance', 'builder', 'Detects Breakdance editor and template APIs for a future native adapter.', ['breakdance/plugin.php'], ['BREAKDANCE_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-breakdance'], [], ['breakdance']),
            'oxygen' => self::definition('oxygen', 'Oxygen', 'builder', 'Detects Oxygen builder/theme APIs without supporting the legacy unsafe route.', [], ['CT_VERSION', 'OXYGEN_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-oxygen'], [], ['oxygen_vsb_register_shortcode']),
            'mosaic' => self::definition('mosaic', 'Mosaic', 'builder', 'Detects Mosaic design-system and template surfaces.', ['mosaic/mosaic.php'], ['MOSAIC_VERSION'], ['pro'], $read_only, ['wp-admin-integration-mosaic'], [], ['mosaic']),
            'etch' => self::definition('etch', 'Etch', 'builder', 'Detects Etch templates, nodes, queries, and custom-field surfaces.', ['etch/etch.php'], ['ETCH_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-etch'], [], ['etch']),
            'beaver-builder' => self::definition('beaver-builder', 'Beaver Builder', 'builder', 'Detects Beaver Builder layouts and module schemas.', ['bb-plugin/fl-builder.php'], ['FL_BUILDER_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-beaver-builder'], [], [], ['FLBuilder']),
            'generatepress' => self::definition('generatepress', 'GeneratePress', 'theme-block', 'Detects GeneratePress theme, Elements, Site Library, and customizer surfaces.', ['gp-premium/gp-premium.php'], ['GP_PREMIUM_VERSION', 'GENERATEPRESS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-generatepress'], [], ['generatepress']),
            'generateblocks' => self::definition('generateblocks', 'GenerateBlocks', 'theme-block', 'GenerateBlocks native Gutenberg schemas and editing, generated styles and installed Free/Pro capabilities.', ['generateblocks/plugin.php'], ['GENERATEBLOCKS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-generateblocks'], ['GENERATEBLOCKS_PRO_VERSION'], ['generateblocks']),
            'kadence' => self::definition('kadence', 'Kadence', 'theme-block', 'Detects Kadence theme settings and design-system metadata.', ['kadence/kadence.php'], ['KADENCE_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-kadence'], [], ['kadence']),
            'astra' => self::definition('astra', 'Astra', 'theme-block', 'Detects Astra theme and Pro module settings without leaking credentials.', ['astra-addon/astra-addon.php'], ['ASTRA_THEME_VERSION', 'ASTRA_PRO_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-astra'], ['ASTRA_PRO_VERSION'], ['astra_get_option']),
            'voxel' => self::definition('voxel', 'Voxel', 'theme-block', 'Detects Voxel post-type, fields, templates, and commerce surfaces.', [], ['VOXEL_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-voxel'], [], ['voxel']),
            'kadenceblocks' => self::definition('kadenceblocks', 'Kadence Blocks', 'theme-block', 'Detects Kadence Blocks schemas and block activation state.', ['kadence-blocks/kadence-blocks.php'], ['KADENCE_BLOCKS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-kadenceblocks'], [], ['kadence_blocks']),
            'spectra-one' => self::definition('spectra-one', 'Spectra One', 'theme-block', 'Detects Spectra One theme templates, patterns, and style variations.', [], ['SPECTRA_ONE_VERSION'], ['free'], $read_only, ['wp-admin-integration-spectra-one'], [], ['spectra_one']),
            'spectra' => self::definition('spectra', 'Spectra', 'theme-block', 'Detects Spectra blocks, popups, forms, and settings schemas.', ['ultimate-addons-for-gutenberg/ultimate-addons-for-gutenberg.php'], ['SPECTRA_VERSION', 'UAGB_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-spectra'], [], ['uag_get_block_categories']),
            'oceanwp' => self::definition('oceanwp', 'OceanWP', 'theme-block', 'Detects OceanWP theme, Ocean Extra, customizer, and WooCommerce surfaces.', ['ocean-extra/ocean-extra.php'], ['OCEANWP_THEME_VERSION', 'OCEAN_EXTRA_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-oceanwp'], [], ['oceanwp_theme_setup']),
            'woocommerce' => self::definition('woocommerce', 'WooCommerce', 'commerce-code', 'Detects WooCommerce catalog and store settings surfaces; no checkout or payment side effects are exposed.', ['woocommerce/woocommerce.php'], ['WC_VERSION'], ['free'], $read_only, ['wp-admin-integration-woocommerce'], [], ['WC']),
            'code-snippets' => self::definition('code-snippets', 'Code Snippets', 'commerce-code', 'Detects Code Snippets only for status; code creation, editing, activation, and evaluation are prohibited.', ['code-snippets/code-snippets.php'], ['CODE_SNIPPETS_VERSION'], ['free', 'pro'], 'status-only', ['wp-admin-integration-code-snippets'], [], [], ['Code_Snippets']),
            'wpcode' => self::definition('wpcode', 'WPCode', 'commerce-code', 'Detects WPCode only for status; snippet creation, editing, activation, and evaluation are prohibited.', ['wpcode/wpcode.php', 'wpcode-premium/wpcode.php', 'insert-headers-and-footers/ihaf.php'], ['WPCODE_VERSION', 'WPCode_VERSION'], ['free', 'pro'], 'status-only', ['wp-admin-integration-wpcode'], [], [], ['WPCode']),
            'wpcodebox2' => self::definition('wpcodebox2', 'WPCodeBox 2', 'commerce-code', 'Uses the dedicated Pixflow native adapter for typed snippet records and ordinary conditions; eval-backed run routes remain unavailable.', ['wpcodebox2/wpcodebox2.php'], ['WPCODEBOX2_VERSION'], ['pro'], 'native-write', ['wp-admin-wpcodebox2', 'wp-admin-integration-wpcodebox2'], [], [], ['Wpcb2\\Repository\\SnippetRepository']),
            'dynamic-shortcodes' => self::definition('dynamic-shortcodes', 'Dynamic Shortcodes', 'commerce-code', 'Detects Dynamic Shortcodes only for status; evaluation and code execution remain unavailable.', ['dynamic-shortcodes/dynamic-shortcodes.php'], ['DYNAMIC_SHORTCODES_VERSION'], ['free', 'pro'], 'status-only', ['wp-admin-integration-dynamic-shortcodes'], [], [], ['DynamicShortcodes']),
            'cf7' => self::definition('cf7', 'Contact Form 7', 'form', 'Detects Contact Form 7 forms and schema surfaces without sending submissions.', ['contact-form-7/wp-contact-form-7.php'], ['WPCF7_VERSION'], ['free'], $read_only, ['wp-admin-integration-cf7'], [], ['wpcf7']),
            'wpforms' => self::definition('wpforms', 'WPForms', 'form', 'Detects WPForms form and field schemas without exposing entries or sending notifications.', ['wpforms-lite/wpforms.php', 'wpforms/wpforms.php'], ['WPFORMS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-wpforms'], [], ['wpforms']),
            'gravityforms' => self::definition('gravityforms', 'Gravity Forms', 'form', 'Detects Gravity Forms schemas while keeping entries and external sends out of scope.', ['gravityforms/gravityforms.php'], ['GF_VERSION', 'GRAVITYFORMS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-gravityforms'], [], [], ['GFAPI', 'GFCommon']),
            'fluentforms' => self::definition('fluentforms', 'Fluent Forms', 'form', 'Detects Fluent Forms schemas without submissions, payments, or notification side effects.', ['fluentform/fluentform.php'], ['FLUENTFORM_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-fluentforms'], [], ['fluentForm']),
            'formidable' => self::definition('formidable', 'Formidable Forms', 'form', 'Detects Formidable form and field definitions without entries or payments.', ['formidable/formidable.php'], ['FRM_VERSION', 'FORMIDABLE_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-formidable'], [], [], ['FrmForm']),
            'ninja-forms' => self::definition('ninja-forms', 'Ninja Forms', 'form', 'Detects Ninja Forms schemas without submissions, emails, or integrations.', ['ninja-forms/ninja-forms.php'], ['NINJA_FORMS_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-ninja-forms'], [], [], ['Ninja_Forms']),
            'weglot' => self::definition('weglot', 'Weglot', 'translation', 'Detects Weglot language, exclusion, and translated-URL configuration surfaces without changing API keys.', ['weglot/weglot.php'], ['WEGLOT_VERSION'], ['free', 'pro'], $read_only, ['wp-admin-integration-weglot'], [], ['Weglot']),
        ];

        // Version floors are copied into Pixflow metadata from the audited
        // integration catalogue. A floor gates future adapters; it never
        // authorises a write by itself.
        $minimums = [
            'ase' => '8.7.0', 'pods' => '3.2.1.1', 'jetengine' => '3.8.6.2',
            'acf' => '6.5.0', 'metabox' => '5.11.2', 'acpt' => '2.0.52',
            'yoast' => '21.0', 'rank-math' => '1.0.200', 'aioseo' => '4.0', 'seopress' => '8.0',
            'bricksforge' => '3.1.8', 'elementor' => '3.6.0', 'divi' => '5.0', 'avada' => '7.15.0',
            'wpbakery' => '6.5.0', 'breakdance' => '2.7.0', 'oxygen' => '6.0.0', 'mosaic' => '1.0.3',
            'etch' => '1.4.19', 'beaver-builder' => '2.9.0', 'generatepress' => '3.0.0',
            'generateblocks' => '1.0.0', 'kadence' => '1.2.0', 'astra' => '4.13.5', 'voxel' => '1.7.8.3',
            'kadenceblocks' => '1.0.0', 'spectra-one' => '1.2.2', 'spectra' => '2.19.0',
            'oceanwp' => '4.1.0', 'woocommerce' => '9.0', 'code-snippets' => '3.6.0', 'wpcode' => '2.0.0', 'wpcodebox2' => '1.3.1',
            'dynamic-shortcodes' => '1.9.0', 'cf7' => '5.8.0', 'wpforms' => '1.8.0',
            'gravityforms' => '2.7', 'fluentforms' => '6.0.0', 'formidable' => '6.0.0',
            'ninja-forms' => '3.13.0', 'weglot' => '5.0',
        ];
        foreach ($minimums as $slug => $version) {
            if (isset(self::$definitions[$slug])) {
                self::$definitions[$slug]['versionFloors'] = [['version' => $version, 'kind' => 'catalogue']];
            }
        }

        $theme_slugs = [
            'bricks' => ['bricks'], 'divi' => ['divi'], 'avada' => ['avada'], 'oxygen' => ['oxygen'],
            'generatepress' => ['generatepress'], 'kadence' => ['kadence'], 'astra' => ['astra'],
            'voxel' => ['voxel'], 'spectra-one' => ['spectra-one'], 'oceanwp' => ['oceanwp'],
        ];
        foreach ($theme_slugs as $slug => $slugs) {
            if (isset(self::$definitions[$slug])) {
                self::$definitions[$slug]['themeSlugs'] = $slugs;
            }
        }
        // WPCode Pro keeps the same WPCODE_VERSION constant as Lite. Track
        // its authoritative plugin basename separately so status reports the
        // edition without inspecting license keys or snippet contents.
        self::$definitions['wpcode']['proPluginBasenames'] = ['wpcode-premium/wpcode.php'];

        return self::$definitions;
    }

    /** @return array<string, mixed>|null */
    public function get_definition(string $slug): ?array
    {
        return self::definitions()[sanitize_key($slug)] ?? null;
    }

    /** @return array<string, mixed> */
    public function gate(string $slug): array
    {
        if (in_array($slug, ['etch', 'elementor', 'generateblocks'], true) && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($slug)) return ['available' => false, 'status' => 'inactive', 'reason' => 'pro_integration_unavailable'];
        $definition = $this->get_definition($slug);
        if ($definition === null) {
            return ['available' => false, 'status' => 'missing', 'reason' => 'integration_not_catalogued'];
        }

        $slug = (string) $definition['slug'];
        if ($slug === 'wordpress-core') {
            return [
                'available' => true,
                'status' => 'active',
                'installed' => true,
                'active' => true,
                'version' => (string) get_bloginfo('version'),
                'edition' => 'free',
                'reason' => null,
                'detectedBy' => ['wordpress-core'],
                'nativeSignals' => ['context' => true],
            ];
        }

        $inventory = $this->inventory();
        $detected_by = [];
        $active = false;
        $installed = false;
        $version = null;
        $edition = null;

        foreach ((array) ($definition['constants'] ?? []) as $constant) {
            if (!defined((string) $constant)) {
                continue;
            }
            $value = constant((string) $constant);
            if (!is_scalar($value) || (string) $value === '') {
                continue;
            }
            $active = true;
            $installed = true;
            $version ??= sanitize_text_field((string) $value);
            $detected_by[] = 'constant:' . sanitize_key((string) $constant);
            if (in_array((string) $constant, (array) ($definition['proSignals'] ?? []), true)) {
                $edition = 'pro';
            }
        }
        foreach ((array) ($definition['functions'] ?? []) as $function) {
            if (!function_exists((string) $function)) {
                continue;
            }
            $active = true;
            $installed = true;
            $detected_by[] = 'function:' . sanitize_key((string) $function);
        }
        foreach ((array) ($definition['classes'] ?? []) as $class) {
            if (!class_exists((string) $class)) {
                continue;
            }
            $active = true;
            $installed = true;
            $detected_by[] = 'class:' . sanitize_key((string) $class);
        }

        foreach ((array) ($definition['pluginBasenames'] ?? []) as $basename) {
            $basename = ltrim(str_replace('\\', '/', (string) $basename), '/');
            if ($basename === '') {
                continue;
            }
            if (!empty($inventory['activePlugins'][$basename])) {
                $active = true;
                $installed = true;
                $detected_by[] = 'active-plugin:' . sanitize_key(dirname($basename));
                if (in_array($basename, (array) ($definition['proPluginBasenames'] ?? []), true)) {
                    $edition = 'pro';
                }
            }
            if (!empty($inventory['installedPlugins'][$basename])) {
                $installed = true;
                $version ??= sanitize_text_field((string) ($inventory['pluginVersions'][$basename] ?? '')) ?: null;
            }
        }

        foreach ((array) ($definition['themeSlugs'] ?? []) as $theme_slug) {
            $theme_slug = sanitize_key((string) $theme_slug);
            if ($theme_slug === '') {
                continue;
            }
            if (in_array($theme_slug, (array) ($inventory['activeThemes'] ?? []), true)) {
                $active = true;
                $installed = true;
                $detected_by[] = 'active-theme:' . $theme_slug;
                $version ??= sanitize_text_field((string) ($inventory['themeVersions'][$theme_slug] ?? '')) ?: null;
            }
            if (!empty($inventory['installedThemes'][$theme_slug])) {
                $installed = true;
                $version ??= sanitize_text_field((string) ($inventory['themeVersions'][$theme_slug] ?? '')) ?: null;
            }
        }

        $detected_by = array_values(array_unique($detected_by));
        $minimum = isset($definition['versionFloors'][0]['version']) ? (string) $definition['versionFloors'][0]['version'] : '';
        $compatible = true;
        $reason = null;
        if (!$installed) {
            $reason = 'not_installed';
        } elseif (!$active) {
            $reason = 'not_active';
        } elseif ($minimum !== '' && $version !== null && version_compare($version, $minimum, '<')) {
            $compatible = false;
            $reason = 'version_below_required';
        } elseif ($active && $version === null && !empty($definition['constants'])) {
            // A plugin signal without a version is not enough for a write
            // adapter. It remains a useful active status diagnostic.
            $reason = 'version_unknown';
        }

        $available = $active && $compatible;
        if ($slug !== 'wordpress-core' && !\PixflowDesign\WordPress\Modules\FeatureContributions::available('plugin-integrations')
            && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($slug)) {
            $available = false;
            $reason = 'pro_integration_unavailable';
        }
        if ($edition === null) {
            $edition = count((array) ($definition['editions'] ?? [])) === 1
                ? (string) ($definition['editions'][0] ?? 'free')
                : 'free';
        }

        return [
            'available' => $available,
            'status' => !$installed ? 'missing' : (!$active ? 'inactive' : (!$compatible ? 'incompatible' : 'active')),
            'installed' => $installed,
            'active' => $active,
            'version' => $version,
            'edition' => $edition,
            'reason' => $reason,
            'detectedBy' => $detected_by,
            'nativeSignals' => $this->native_signals($definition),
        ];
    }

    /** @return array<string, mixed> */
    public function status(string $slug): array
    {
        if (in_array($slug, ['etch', 'elementor'], true) && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($slug)) return ['available' => false, 'status' => 'inactive', 'reason' => 'pro_integration_unavailable'];
        $definition = $this->get_definition($slug);
        if ($definition === null) {
            return [
                'available' => false,
                'status' => 'missing',
                'reason' => 'integration_not_catalogued',
            ];
        }
        $gate = $this->gate((string) $definition['slug']);
        $floor = isset($definition['versionFloors'][0]['version']) ? (string) $definition['versionFloors'][0]['version'] : null;
        return [
            'schema' => 'pixflow.wp-admin.integration-status.v1',
            'version' => 1,
            'id' => (string) $definition['slug'],
            'label' => (string) $definition['label'],
            'category' => (string) $definition['category'],
            'description' => (string) $definition['description'],
            'status' => (string) ($gate['status'] ?? 'missing'),
            'available' => ($gate['available'] ?? false) === true,
            'installed' => ($gate['installed'] ?? false) === true,
            'active' => ($gate['active'] ?? false) === true,
            'version' => isset($gate['version']) ? (string) $gate['version'] : null,
            'requiredVersion' => $floor,
            'edition' => isset($gate['edition']) ? (string) $gate['edition'] : null,
            'supportedEditions' => array_values(array_map('strval', (array) ($definition['editions'] ?? []))),
            'supportTier' => (string) ($definition['supportTier'] ?? 'status-read'),
            'adapter' => (string) ($definition['supportTier'] ?? 'status-read') === 'native-write' ? 'pixflow-native' : 'status-only',
            'nativeSignals' => is_array($gate['nativeSignals'] ?? null) ? $gate['nativeSignals'] : [],
            'detectedBy' => array_values(array_map('sanitize_text_field', (array) ($gate['detectedBy'] ?? []))),
            'diagnostic' => sanitize_key((string) ($gate['reason'] ?? '')) ?: null,
            'readSurface' => !empty($gate['available']) ? array_values(array_map('sanitize_text_field', (array) ($definition['readSurface'] ?? []))) : ['read-status'],
            'writeSurface' => !empty($gate['available']) && (string) ($definition['supportTier'] ?? '') === 'native-write'
                ? ['declared_in_dedicated_adapter']
                : [],
            'linkedSkillIds' => !empty($gate['available']) ? array_values(array_map('sanitize_key', (array) ($definition['linkedSkillIds'] ?? []))) : [],
        ];
    }

    /** @return array<string, mixed> */
    private static function definition(string $slug, string $label, string $category, string $description, array $plugin_basenames, array $constants, array $editions, string $support_tier, array $linked_skill_ids, array $pro_signals = [], array $functions = [], array $classes = [], array $theme_slugs = [], string $minimum = ''): array
    {
        return [
            'slug' => $slug,
            'label' => $label,
            'category' => $category,
            'description' => $description,
            'pluginBasenames' => $plugin_basenames,
            'constants' => $constants,
            'proSignals' => $pro_signals,
            'functions' => $functions,
            'classes' => $classes,
            'themeSlugs' => $theme_slugs,
            'versionFloors' => $minimum !== '' ? [['version' => $minimum, 'kind' => 'catalogue']] : [],
            'editions' => $editions,
            'supportTier' => $support_tier,
            'linkedSkillIds' => $linked_skill_ids,
            'readSurface' => self::read_surface($category),
        ];
    }

    /** @return list<string> */
    private static function read_surface(string $category): array
    {
        return match ($category) {
            'field' => ['setup', 'list-content-models', 'read-schemas', 'read-values'],
            'seo' => ['setup', 'read-post-seo', 'read-term-seo', 'read-settings'],
            'builder' => ['setup', 'read-editor-status', 'read-templates', 'read-schemas'],
            'theme-block' => ['setup', 'read-theme-status', 'read-settings-schema', 'read-design-system'],
            'commerce-code' => ['setup', 'read-catalogue-schema', 'read-settings-schema'],
            'form' => ['setup', 'list-forms', 'read-form-schema'],
            'translation' => ['setup', 'read-languages', 'read-exclusions', 'read-translated-url-status'],
            default => ['setup', 'read-status'],
        };
    }

    /** @return array<string, bool> */
    private function native_signals(array $definition): array
    {
        $signals = [];
        foreach ((array) ($definition['functions'] ?? []) as $function) {
            $signals['function:' . sanitize_key((string) $function)] = function_exists((string) $function);
        }
        foreach ((array) ($definition['classes'] ?? []) as $class) {
            $signals['class:' . sanitize_key((string) $class)] = class_exists((string) $class);
        }
        foreach ((array) ($definition['constants'] ?? []) as $constant) {
            $signals['constant:' . sanitize_key((string) $constant)] = defined((string) $constant);
        }
        return $signals;
    }

    /** @return array<string, mixed> */
    private function inventory(): array
    {
        if (self::$inventory !== null) {
            return self::$inventory;
        }

        $active = [];
        $active_options = get_option('active_plugins', []);
        if (is_array($active_options)) {
            foreach ($active_options as $plugin) {
                $plugin = ltrim(str_replace('\\', '/', (string) $plugin), '/');
                if ($plugin !== '') {
                    $active[$plugin] = true;
                }
            }
        }
        $network = get_site_option('active_sitewide_plugins', []);
        if (is_array($network)) {
            foreach (array_keys($network) as $plugin) {
                $plugin = ltrim(str_replace('\\', '/', (string) $plugin), '/');
                if ($plugin !== '') {
                    $active[$plugin] = true;
                }
            }
        }

        $installed = [];
        $versions = [];
        if (function_exists('get_plugins')) {
            foreach ((array) get_plugins() as $basename => $data) {
                $basename = ltrim(str_replace('\\', '/', (string) $basename), '/');
                if ($basename === '') {
                    continue;
                }
                $installed[$basename] = true;
                if (is_array($data) && isset($data['Version'])) {
                    $versions[$basename] = sanitize_text_field((string) $data['Version']);
                }
            }
        }
        if (defined('WP_PLUGIN_DIR') && is_dir(WP_PLUGIN_DIR)) {
            foreach (glob(WP_PLUGIN_DIR . '/*/*.php') ?: [] as $file) {
                $relative = str_replace('\\', '/', ltrim(str_replace(WP_PLUGIN_DIR, '', $file), '/'));
                if ($relative !== '') {
                    $installed[$relative] = true;
                }
            }
        }

        $active_themes = [];
        $installed_themes = [];
        $theme_versions = [];
        if (function_exists('wp_get_themes')) {
            foreach ((array) wp_get_themes() as $stylesheet => $theme) {
                $stylesheet = sanitize_key((string) $stylesheet);
                if ($stylesheet === '') {
                    continue;
                }
                $installed_themes[$stylesheet] = true;
                $theme_versions[$stylesheet] = is_object($theme) ? sanitize_text_field((string) $theme->get('Version')) : '';
            }
        }
        foreach ([get_stylesheet(), get_template()] as $theme_slug) {
            $theme_slug = sanitize_key((string) $theme_slug);
            if ($theme_slug !== '') {
                $active_themes[] = $theme_slug;
            }
        }

        self::$inventory = [
            'activePlugins' => $active,
            'installedPlugins' => $installed,
            'pluginVersions' => $versions,
            'activeThemes' => array_values(array_unique($active_themes)),
            'installedThemes' => $installed_themes,
            'themeVersions' => $theme_versions,
        ];
        return self::$inventory;
    }
}
