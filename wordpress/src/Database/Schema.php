<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Database;

if (!defined('ABSPATH')) {
    exit;
}

final class Schema
{
    public const VERSION = '2026.10.16.1';

    /**
     * @return list<string>
     */
    public static function statements(): array
    {
        global $wpdb;

        $charset_collate = $wpdb->get_charset_collate();
        $projects = Table::name(Table::PROJECTS);
        $versions = Table::name(Table::PROJECT_VERSIONS);
        $contexts = Table::name(Table::PROJECT_CONTEXTS);
        $access = Table::name(Table::PROJECT_ACCESS);
        $locks = Table::name(Table::PROJECT_LOCKS);
        $chat_conversations = Table::name(Table::CHAT_CONVERSATIONS);
        $chat_messages = Table::name(Table::CHAT_MESSAGES);
        $chat_bindings = Table::name(Table::CHAT_BINDINGS);

        // Pixflow-owned: shared project storage lives in custom tables so lists,
        // permissions, and version lookups stay fast without bloating postmeta.
        return [
            "CREATE TABLE {$chat_conversations} (
                conversation_key char(64) NOT NULL,
                project_uuid char(36) NOT NULL,
                conversation_id varchar(191) NOT NULL,
                title varchar(191) NOT NULL,
                created_at bigint(20) unsigned NOT NULL,
                updated_at bigint(20) unsigned NOT NULL,
                migrated tinyint(1) NOT NULL DEFAULT 0,
                deleted tinyint(1) NOT NULL DEFAULT 0,
                PRIMARY KEY  (conversation_key),
                KEY project_uuid (project_uuid)
            ) {$charset_collate};",
            "CREATE TABLE {$chat_messages} (
                sequence_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                conversation_key char(64) NOT NULL,
                message_key char(64) NOT NULL,
                message_id varchar(191) NOT NULL,
                payload longtext NOT NULL,
                revision bigint(20) unsigned NOT NULL DEFAULT 1,
                deleted tinyint(1) NOT NULL DEFAULT 0,
                PRIMARY KEY  (sequence_id),
                UNIQUE KEY conversation_message (conversation_key, message_key),
                KEY conversation_sequence (conversation_key, deleted, sequence_id)
            ) {$charset_collate};",
            "CREATE TABLE {$chat_bindings} (
                binding_key char(64) NOT NULL,
                owner_user_id bigint(20) unsigned NOT NULL,
                project_uuid char(36) NOT NULL,
                conversation_id varchar(191) NOT NULL,
                session_key text NOT NULL,
                PRIMARY KEY  (binding_key),
                KEY owner_user_id (owner_user_id),
                KEY project_uuid (project_uuid)
            ) {$charset_collate};",
            "CREATE TABLE {$projects} (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                uuid char(36) NOT NULL,
                kind varchar(32) NOT NULL DEFAULT 'project',
                title varchar(191) NOT NULL,
                slug varchar(191) NOT NULL,
                owner_user_id bigint(20) unsigned DEFAULT NULL,
                site_url_hash char(64) NOT NULL,
                source_bridge_id varchar(191) DEFAULT NULL,
                parent_project_id bigint(20) unsigned DEFAULT NULL,
                current_version_id bigint(20) unsigned DEFAULT NULL,
                status varchar(32) NOT NULL DEFAULT 'draft',
                visibility varchar(32) NOT NULL DEFAULT 'site',
                metadata longtext NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                last_opened_at datetime DEFAULT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY uuid (uuid),
                KEY kind_status (kind, status),
                KEY owner_user_id (owner_user_id),
                KEY site_url_hash (site_url_hash),
                KEY parent_project_id (parent_project_id),
                KEY current_version_id (current_version_id),
                KEY updated_at (updated_at)
            ) {$charset_collate};",

            "CREATE TABLE {$versions} (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                project_id bigint(20) unsigned NOT NULL,
                version_number int(10) unsigned NOT NULL,
                created_by bigint(20) unsigned DEFAULT NULL,
                archive_path text NOT NULL,
                manifest_path text NULL,
                preview_path text NULL,
                file_hash char(64) DEFAULT NULL,
                size_bytes bigint(20) unsigned NOT NULL DEFAULT 0,
                summary text NULL,
                metadata longtext NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY project_version (project_id, version_number),
                KEY project_id (project_id),
                KEY created_by (created_by),
                KEY file_hash (file_hash),
                KEY created_at (created_at)
            ) {$charset_collate};",

            "CREATE TABLE {$contexts} (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                project_id bigint(20) unsigned NOT NULL,
                post_id bigint(20) unsigned DEFAULT NULL,
                post_type varchar(64) DEFAULT NULL,
                bricks_template_id bigint(20) unsigned DEFAULT NULL,
                framework_route varchar(96) DEFAULT NULL,
                design_system_id varchar(191) DEFAULT NULL,
                mapping_route varchar(96) DEFAULT NULL,
                metadata longtext NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY project_id (project_id),
                KEY post_lookup (post_id, post_type),
                KEY bricks_template_id (bricks_template_id),
                KEY framework_route (framework_route),
                KEY design_system_id (design_system_id)
            ) {$charset_collate};",

            "CREATE TABLE {$access} (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                project_id bigint(20) unsigned NOT NULL,
                user_id bigint(20) unsigned NOT NULL,
                role varchar(32) NOT NULL DEFAULT 'editor',
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY project_user (project_id, user_id),
                KEY project_id (project_id),
                KEY user_id (user_id),
                KEY role (role)
            ) {$charset_collate};",

            "CREATE TABLE {$locks} (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                project_id bigint(20) unsigned NOT NULL,
                user_id bigint(20) unsigned NOT NULL,
                session_id varchar(191) NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'active',
                metadata longtext NULL,
                locked_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                expires_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY project_lock (project_id),
                KEY user_id (user_id),
                KEY session_id (session_id),
                KEY status_expires (status, expires_at)
            ) {$charset_collate};",
        ];
    }
}
