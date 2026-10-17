<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Database;

if (!defined('ABSPATH')) {
    exit;
}

final class Table
{
    public const PROJECTS = 'pixflow_design_projects';
    public const PROJECT_VERSIONS = 'pixflow_design_project_versions';
    public const PROJECT_CONTEXTS = 'pixflow_design_project_contexts';
    public const PROJECT_ACCESS = 'pixflow_design_project_access';
    public const PROJECT_LOCKS = 'pixflow_design_project_locks';
    public const CHAT_CONVERSATIONS = 'pixflow_design_chat_conversations';
    public const CHAT_MESSAGES = 'pixflow_design_chat_messages';
    public const CHAT_BINDINGS = 'pixflow_design_chat_bindings';

    public static function name(string $table): string
    {
        global $wpdb;

        return $wpdb->prefix . $table;
    }
}
