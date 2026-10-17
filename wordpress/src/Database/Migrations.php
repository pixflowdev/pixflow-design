<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Database;

if (!defined('ABSPATH')) {
    exit;
}

final class Migrations
{
    private const OPTION_SCHEMA_VERSION = 'pixflow_design_schema_version';

    public static function register(): void
    {
        add_action('init', [self::class, 'maybe_install'], 5);
    }

    public static function activate(): void
    {
        self::install();
    }

    public static function maybe_install(): void
    {
        if ((string) get_option(self::OPTION_SCHEMA_VERSION, '') === Schema::VERSION) {
            return;
        }

        self::install();
    }

    public static function install(): void
    {
        global $wpdb;

        if (!function_exists('dbDelta')) require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        foreach (Schema::statements() as $statement) {
            dbDelta($statement);
        }

        // A host may deny CREATE/ALTER even though WordPress itself is healthy.
        // Keep the old version marker so a subsequent request can safely retry.
        if (!self::chat_schema_ready()) return;

        update_option(self::OPTION_SCHEMA_VERSION, Schema::VERSION, false);
        update_option('pixflow_design_schema_installed_at', gmdate('Y-m-d H:i:s'), false);

        // Pixflow-owned: keep a compact table map for diagnostics and future
        // bridge sync checks without recomputing names in JavaScript.
        update_option('pixflow_design_project_tables', [
            'projects' => Table::name(Table::PROJECTS),
            'versions' => Table::name(Table::PROJECT_VERSIONS),
            'contexts' => Table::name(Table::PROJECT_CONTEXTS),
            'access' => Table::name(Table::PROJECT_ACCESS),
            'locks' => Table::name(Table::PROJECT_LOCKS),
            'chat_conversations' => Table::name(Table::CHAT_CONVERSATIONS),
            'chat_messages' => Table::name(Table::CHAT_MESSAGES),
            'chat_bindings' => Table::name(Table::CHAT_BINDINGS),
            'db_prefix' => $wpdb->prefix,
        ], false);
    }

    public static function chat_schema_ready(): bool
    {
        global $wpdb;
        $required = [
            Table::CHAT_CONVERSATIONS => ['conversation_key', 'project_uuid', 'conversation_id', 'title', 'created_at', 'updated_at', 'migrated', 'deleted'],
            Table::CHAT_MESSAGES => ['sequence_id', 'conversation_key', 'message_key', 'message_id', 'payload', 'revision', 'deleted'],
            Table::CHAT_BINDINGS => ['binding_key', 'owner_user_id', 'project_uuid', 'conversation_id', 'session_key'],
        ];
        foreach ($required as $table => $columns) {
            $actual = $wpdb->get_col('DESCRIBE `' . Table::name($table) . '`', 0);
            if (!is_array($actual) || array_diff($columns, $actual) !== []) return false;
        }
        return true;
    }
}
