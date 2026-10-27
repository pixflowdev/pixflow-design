<?php
declare(strict_types=1);

namespace PixflowDesign\WordPress\Admin;

if (!defined('ABSPATH')) exit;

/** One mailbox per live tab. PHP requests never wait for the browser. */
final class DirectCanvasRelay
{
    public function __construct(private readonly string $builder = 'bricks')
    {
        if ($builder !== 'gutenberg' && !\PixflowDesign\WordPress\Modules\BuilderIntegrations::active($builder)) throw new \InvalidArgumentException('Unknown builder.');
    }

    private function prefix(): string { return $this->builder === 'bricks' ? 'pixflow_canvas_' : 'pixflow_' . $this->builder . '_canvas_'; }
    /** Reserve a mailbox slot without WordPress add_option's upsert race. */
    private function reserve(string $key, mixed $value): bool
    {
        global $wpdb;
        $inserted = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')", $key, maybe_serialize($value)));
        if ($inserted === false) throw new \RuntimeException('The live builder mailbox could not be reserved.');
        if ($inserted === 1) $this->forgetCachedSlot($key);
        return $inserted === 1;
    }

    private function forgetCachedSlot(string $key): void
    {
        wp_cache_delete($key, 'options');
        wp_cache_delete('notoptions', 'options');
    }

    private function claimedKey(string $id, string $commandId): string
    {
        return $this->key($id) . '_command_claimed_' . $commandId;
    }
    private function key(string $id): string
    {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) throw new \RuntimeException('Invalid canvas id.');
        return $this->prefix() . $id;
    }

    /** A tab may reconnect to a new document even when its previous document is no longer editable. */
    private function ownedCanvas(string $id): array
    {
        $canvas = get_option($this->key($id));
        if (!is_array($canvas) || $canvas['userId'] !== get_current_user_id() || $canvas['blogId'] !== get_current_blog_id()) {
            throw new \RuntimeException('This live canvas is not connected to your site/user.');
        }
        return $canvas;
    }

    private function canvas(string $id): array
    {
        $canvas = $this->ownedCanvas($id);
        if ($this->builder === 'gutenberg' && isset($canvas['entity'])) Gutenberg\GutenbergEntity::validate($canvas['entity']);
        elseif (!current_user_can('edit_post', $canvas['postId'])) throw new \RuntimeException('This page is no longer editable.');
        return $canvas;
    }

    public function register(int $postId, string $resumeId = '', bool $hasCompletion = false, ?array $entity = null): array
    {
        if ($this->builder !== 'gutenberg') $entity = null;
        if ($this->builder === 'gutenberg' && $entity) $entity = Gutenberg\GutenbergEntity::validate($entity);
        elseif ($postId <= 0 || !current_user_can('edit_post', $postId)) throw new \RuntimeException('An editable builder document is required.');
        if ($resumeId !== '' && is_array(get_option($this->key($resumeId)))) {
            $canvas = $this->ownedCanvas($resumeId);
            $canvas['postId'] = $postId;
            if ($entity) $canvas['entity'] = $entity;
            $canvas['seenAt'] = time();
            delete_option($this->key($resumeId) . '_departed');
            update_option($this->key($resumeId), $canvas, false);
            delete_option($this->key($resumeId) . '_context');
            $command = get_option($this->key($resumeId) . '_command');
            if (!$hasCompletion && is_array($command) && (get_option($this->claimedKey($resumeId, $command['id'])) || get_option($this->key($resumeId) . '_command_claimed') === $command['id'])) {
                $this->complete($resumeId, $command['id'], ['ok' => false, 'error' => 'The builder reloaded before delivering the result. Inspect the current state before retrying; the operation may have happened.']);
            }
            return ['canvasId' => $resumeId, 'postId' => $postId];
        }
        $this->listing(); // Retire abandoned tabs from earlier browser sessions.
        $id = $resumeId !== '' ? $resumeId : bin2hex(random_bytes(16));
        add_option($this->key($id), ['userId' => get_current_user_id(), 'blogId' => get_current_blog_id(), 'postId' => $postId, 'entity' => $entity, 'seenAt' => time()], '', false);
        return ['canvasId' => $id, 'postId' => $postId];
    }

    public function target(string $id, int $postId, ?array $entity = null): array
    {
        $canvas = $this->canvas($id);
        if ($canvas['postId'] !== $postId || ($this->builder === 'gutenberg' && ($canvas['entity'] ?? null) != $entity)) throw new \RuntimeException('The originating editor changed documents. Submit your request again from the intended page.');
        return ['builder' => $this->builder, 'canvasId' => $id, 'postId' => $postId] + ($entity ? ['entity' => $entity] : []);
    }

    public function assert_target(string $id, ?array $target): void
    {
        if (!$target) return;
        if ($target['builder'] !== $this->builder || $target['canvasId'] !== $id) throw new \RuntimeException('This run belongs to its originating editor tab. Another tab cannot take over. Reconnect the original tab or start a new request there.');
        $this->canvas($id);
    }

    public function listing(?array $target = null): array
    {
        if ($target) {
            if ($target['builder'] !== $this->builder) return ['canvases' => []];
            $canvas = $this->canvas($target['canvasId']);
            return ['canvases' => [['canvasId' => $target['canvasId'], 'postId' => $canvas['postId'], 'entity' => $canvas['entity'] ?? null,
                'connected' => !get_option($this->key($target['canvasId']) . '_departed') && $canvas['seenAt'] >= time() - 30]],
                'originPinned' => true];
        }
        global $wpdb;
        $names = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like($this->prefix()) . '%'));
        $result = [];
        foreach ($names as $name) {
            if (!str_starts_with($name, $this->prefix())) continue;
            $id = substr($name, strlen($this->prefix()));
            if (!preg_match('/^[a-f0-9]{32}$/D', $id)) continue;
            try { $canvas = $this->canvas($id); } catch (\Throwable $error) { continue; }
            if ($canvas['seenAt'] < time() - 30) {
                if ($canvas['seenAt'] < time() - 3600) $this->close($id);
                continue;
            }
            $result[] = ['canvasId' => $id, 'postId' => $canvas['postId'], 'entity' => $canvas['entity'] ?? null];
        }
        return ['canvases' => $result];
    }

    public function submit(string $id, string $tool, array $args, array $session, string $sessionKey): array|\WP_Error
    {
        $target = $session['editorTarget'] ?? null;
        $this->assert_target($id, $target);
        $canvas = $this->canvas($id);
        if (get_option($this->key($id) . '_departed')) return $this->navigationResult(false, false);
        if ($this->builder === 'gutenberg' && !empty($canvas['entity'])) {
            if ((array) ($args['expectedEntity'] ?? []) != $canvas['entity']) throw new \RuntimeException('The editor changed documents. Read its current entity before editing.');
        } elseif (!\PixflowDesign\WordPress\Modules\BuilderIntegrations::get($this->builder, 'legacyOptionalPostId', false) && empty($args['expectedPostId'])) throw new \RuntimeException('Builder commands require expectedPostId from the intended editor tab.');
        if (isset($args['expectedPostId']) && (int) $args['expectedPostId'] !== $canvas['postId']) {
            throw new \RuntimeException('This request targets a different page from the current builder. Reconnect to the intended page or explicitly select the new target.');
        }
        if ($canvas['seenAt'] < time() - 30) return ['ok' => false, 'code' => 'canvas_disconnected', 'accepted' => false,
            'error' => 'The originating editor tab is disconnected. Reconnecting in place; no command has been applied.'];
        $allowed = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get($this->builder, 'commands', []);
        if ($this->builder === 'gutenberg') $allowed = array_merge(Gutenberg\GutenbergExtensions::contributions('gutenbergCommands'), ['gutenberg.read', 'gutenberg.schema', 'gutenberg.insert', 'gutenberg.update', 'gutenberg.remove', 'gutenberg.move', 'gutenberg.save', 'gutenberg.undo', 'gutenberg.redo']);
        if ($this->builder === 'gutenberg') Gutenberg\GutenbergExtensions::assert_command($tool, $args, (int) $canvas['postId'], $canvas['entity'] ?? null);
        if (!in_array($tool, $allowed, true)) {
            throw new \RuntimeException('Unknown live builder tool.');
        }
        $styleRead = $tool === 'gutenberg.styles' && in_array($args['action'] ?? '', ['list', 'read'], true);
        $readOnly = ($this->builder === 'gutenberg' && in_array($tool, Gutenberg\GutenbergExtensions::contributions('gutenbergReadCommands'), true)) || $styleRead || in_array($tool, array_merge([$this->builder . '.read', 'gutenberg.schema', 'gutenberg.entities'], \PixflowDesign\WordPress\Modules\BuilderIntegrations::get($this->builder, 'readCommands', [])), true);
        // Workspace can inspect a destination, but native edits belong to the
        // destination agent after its tab has claimed the durable handoff.
        if (!empty($session['workspaceSource']) && !$readOnly) throw new \RuntimeException('This is a Workspace planning session. Use builder.destinations and builder.handoff for this page; the selected live editor will start its own agent. No edit was queued.');
        if (!$session['writable'] && !$readOnly) throw new \RuntimeException('This existing canvas connection is read-only.');
        if ($this->builder === 'gutenberg' && ($error = Gutenberg\GutenbergExecutableContent::live_error($tool, $args))) return Gutenberg\GutenbergExecutableContent::blocked_result($error);
        $command = ['id' => bin2hex(random_bytes(16)), 'tool' => $tool, 'arguments' => $args, 'postId' => $canvas['postId'], 'entity' => $canvas['entity'] ?? null, 'readOnly' => $readOnly, 'writable' => $session['writable'], 'expiresAt' => min($session['expiresAt'], time() + 120), 'sessionKey' => $sessionKey];
        if (!$this->reserve($this->key($id) . '_command', $command)) {
            // Explicit non-acceptance lets the transport wait for the occupied
            // mailbox without retrying an acknowledged or uncertain mutation.
            return ['ok' => false, 'code' => 'canvas_busy', 'accepted' => false, 'retryAfterMs' => 250,
                'error' => 'The builder is finishing another command. This command has not been accepted.'];
        }
        if (get_option($this->key($id) . '_departed')) $this->depart($id, (int) $canvas['postId']);
        return ['pending' => true, 'canvasId' => $id, 'commandId' => $command['id']];
    }

    public function poll(string $id, int $postId = 0, ?array $context = null, ?array $entity = null): array
    {
        $canvas = $this->canvas($id);
        if (get_option($this->key($id) . '_departed')) return ['command' => null];
        if ($this->builder !== 'gutenberg') $entity = null;
        if ($this->builder === 'gutenberg' && $entity) $entity = Gutenberg\GutenbergEntity::validate($entity);
        if (($postId > 0 && $postId !== $canvas['postId']) || ($entity && $entity != ($canvas['entity'] ?? null))) {
            if (!$entity && !current_user_can('edit_post', $postId)) throw new \RuntimeException('This page is no longer editable.');
            $canvas['postId'] = $postId;
            if ($entity) $canvas['entity'] = $entity;
            delete_option($this->key($id) . '_context');
        }
        if ($context && ($context['schemaVersion'] ?? 0) === 1
            && (int) ($context['postId'] ?? 0) === $canvas['postId']
            && is_string($context['documentId'] ?? null) && is_int($context['revision'] ?? null)
            && is_string($context['markdown'] ?? null) && is_array($context['sections'] ?? null)) {
            update_option($this->key($id) . '_context', $context, false);
        }
        $canvas['seenAt'] = time();
        // Keep credentials server-side; the browser receives only feedback owners.
        $canvas['presentationSessions'] = array_filter($canvas['presentationSessions'] ?? [],
            static fn(string $sessionKey): bool => (bool) get_transient($sessionKey));
        update_option($this->key($id), $canvas, false);
        $metadata = ['frameworkRouteId' => ($route = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get($this->builder, 'frameworkRoute')) ? $route() : null,
            'presentationScopes' => array_keys($canvas['presentationSessions'])];
        $key = $this->key($id) . '_command';
        $command = get_option($key);
        if (!is_array($command)) return ['command' => null] + $metadata;
        if (!get_transient($command['sessionKey']) || $command['expiresAt'] < time()) {
            $this->complete($id, $command['id'], ['ok' => false, 'error' => 'The live command expired or its session ended; inspect the canvas before retrying.']);
            return ['command' => null] + $metadata;
        }
        // Already dispatched work retains its real outcome if access expires mid-flight.
        if (get_option($key . '_claimed') === $command['id'] || get_option($this->claimedKey($id, $command['id']))) return ['command' => null] + $metadata;
        if ($this->builder === 'gutenberg') {
            try { Gutenberg\GutenbergExtensions::assert_command($command['tool'], $command['arguments'], (int) $canvas['postId'], $canvas['entity'] ?? null); }
            catch (\RuntimeException $error) {
                $this->complete($id, $command['id'], ['ok'=>false, 'error'=>$error->getMessage()]);
                return ['command'=>null] + $metadata;
            }
            if ($error = Gutenberg\GutenbergExecutableContent::live_error($command['tool'], $command['arguments'])) {
                $blocked = Gutenberg\GutenbergExecutableContent::blocked_result($error);
                $this->complete($id, $command['id'], $blocked instanceof \WP_Error ? ['ok'=>false, 'error'=>$blocked->get_error_message()] : $blocked);
                return ['command'=>null] + $metadata;
            }
        }
        // A lost poll response never replays a mutation. The caller will see a
        // timeout with an explicit uncertain outcome instead of a duplicate edit.
        if (get_option($key . '_claimed') === $command['id'] || !$this->reserve($this->claimedKey($id, $command['id']), $command['id'])) return ['command' => null] + $metadata;
        $enrich = \PixflowDesign\WordPress\Modules\BuilderIntegrations::get($this->builder, 'prepareCommand');
        if ($enrich) $command = $enrich($command);
        $scope = hash('sha256', $command['sessionKey']);
        $canvas['presentationSessions'][$scope] = $command['sessionKey'];
        update_option($this->key($id), $canvas, false);
        $command['presentationScope'] = $scope;
        $metadata['presentationScopes'] = array_keys($canvas['presentationSessions']);
        unset($command['sessionKey']);
        return ['command' => $command] + $metadata;
    }

    /** Cached builder-owned data; never causes a browser compilation or command. */
    public function context(string $id, string $knownRevision = ''): array
    {
        $canvas = $this->canvas($id);
        $context = get_option($this->key($id) . '_context');
        $connected = !get_option($this->key($id) . '_departed') && $canvas['seenAt'] >= time() - 30;
        if (!is_array($context)) return ['context' => null, 'connected' => $connected, 'postId' => $canvas['postId']];
        $revision = $context['documentId'] . ':' . $context['revision'];
        return ['context' => $revision === $knownRevision ? null : $context,
            'revision' => $revision, 'connected' => $connected, 'postId' => $canvas['postId']];
    }

    public function complete(string $id, string $commandId, array $result): array
    {
        $this->canvas($id);
        $key = $this->key($id) . '_command';
        $command = get_option($key);
        if (!is_array($command) || !hash_equals($command['id'], $commandId)) return ['accepted' => false];
        // A delayed duplicate completion must never remove a newer command.
        global $wpdb;
        $removed = $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $key, maybe_serialize($command)));
        if ($removed !== 1) return ['accepted' => false];
        $this->forgetCachedSlot($key);
        set_transient('pixflow_canvas_result_' . $commandId, ['sessionKey' => $command['sessionKey'],
            'userId' => get_current_user_id(), 'blogId' => get_current_blog_id(), 'value' => $result], 3600);
        // Retain the per-command claim until this canvas closes. A poll that
        // read the old mailbox immediately before completion must not reclaim
        // and execute that already completed command after the slot is freed.
        if (get_option($key . '_claimed') === $commandId) delete_option($key . '_claimed');
        return ['accepted' => true];
    }

    public function result(string $commandId, string $sessionKey): array
    {
        if (!preg_match('/^[a-f0-9]{32}$/D', $commandId)) throw new \RuntimeException('Invalid command id.');
        $result = get_transient('pixflow_canvas_result_' . $commandId);
        if (!is_array($result)) $result = get_transient('pixflow_canvas_navigation_' . $commandId);
        if (!is_array($result)) return ['pending' => true];
        $sameOwner = isset($result['userId'], $result['blogId'])
            && (int) $result['userId'] === get_current_user_id() && (int) $result['blogId'] === get_current_blog_id();
        $authorized = isset($result['userId'], $result['blogId']) ? $sameOwner : hash_equals($result['sessionKey'], $sessionKey);
        if (!$authorized) throw new \RuntimeException('This command belongs to another session.');
        return $result['value'];
    }

    private function navigationResult(bool $claimed, bool $readOnly): array
    {
        $uncertain = $claimed && !$readOnly;
        return ['ok' => !$uncertain, 'code' => 'editor_navigation', 'requestedActionCompleted' => false,
            'executed' => $claimed ? null : false, 'accepted' => $claimed,
            'outcome' => $uncertain ? 'unknown' : ($claimed ? 'read_unavailable' : 'not_executed'),
            'message' => 'The same browser tab moved to the WordPress editor. This is a context transition, not a completed builder action. Do not retry this canvas command or claim it succeeded. You may continue permitted WordPress/ACF work on the same page using WordPress tools. Native builder work requires returning to the original builder tab.',
            ...($uncertain ? ['error' => 'The builder closed after this command was dispatched. Its effect is unknown. Query this command result and inspect current state before retrying any mutation.'] : [])];
    }

    /** Settle abandoned work without replaying it or granting a different editor authority. */
    public function depart(string $id, int $postId, ?array $destination = null): array
    {
        $canvas = $this->canvas($id);
        if ($postId !== (int) $canvas['postId']) throw new \RuntimeException('The destination must be the same page.');
        if ($destination) {
            if ($this->builder !== 'bricks' || ($destination['builder'] ?? '') !== 'gutenberg' || (int) ($destination['postId'] ?? 0) !== $postId) throw new \RuntimeException('Only the same page can continue in its WordPress editor.');
            $destination = (new self('gutenberg'))->target((string) ($destination['canvasId'] ?? ''), $postId, $destination['entity'] ?? null);
            $existing = get_transient($this->key($id) . '_navigation_target');
            if (get_option($this->key($id) . '_departed') && is_array($existing) && $existing !== $destination) throw new \RuntimeException('This handoff already belongs to another destination tab. Continue in that tab or start a new request.');
        }
        update_option($this->key($id) . '_departed', true, false);
        delete_option($this->key($id) . '_context');
        $command = get_option($this->key($id) . '_command');
        if (is_array($command)) {
            // Compete for exactly the same claim as poll. A concurrent poll can
            // either own execution or lose to departure; it cannot replay work.
            $claimed = get_option($this->key($id) . '_command_claimed') === $command['id']
                || !$this->reserve($this->claimedKey($id, $command['id']), 'navigation');
            $readOnly = !empty($command['readOnly']);
            $result = $this->navigationResult($claimed, $readOnly);
            if (!$claimed || $readOnly) $this->complete($id, $command['id'], $result);
            else set_transient('pixflow_canvas_navigation_' . $command['id'], ['sessionKey' => $command['sessionKey'],
                'userId' => get_current_user_id(), 'blogId' => get_current_blog_id(), 'value' => $result], 3600);
        }
        if ($destination) set_transient($this->key($id) . '_navigation_target', $destination, 3600);
        return ['departed' => true, 'postId' => $postId];
    }

    /** Owner-authenticated browser navigation may continue on the same native document.
     * The tool credential cannot create this link; each use revalidates both owners
     * and document identities. Reopening the source revokes the departed state.
     */
    public function navigation_target(array $source): array
    {
        $id = (string) ($source['canvasId'] ?? '');
        if ($this->builder !== 'bricks' || ($source['builder'] ?? '') !== 'bricks' || !get_option($this->key($id) . '_departed')) return $source;
        $destination = get_transient($this->key($id) . '_navigation_target');
        if (!is_array($destination)) return $source;
        $origin = $this->canvas($id);
        if ((int) $origin['postId'] !== (int) $source['postId'] || (int) $destination['postId'] !== (int) $source['postId']) throw new \RuntimeException('The editor handoff no longer targets the same page.');
        if (is_array(get_option($this->key($id) . '_command'))) throw new \RuntimeException('A previous builder command has no confirmed result. Resolve it before continuing in another editor.');
        return (new self('gutenberg'))->target($destination['canvasId'], (int) $destination['postId'], $destination['entity'] ?? null);
    }

    public function close(string $id): array
    {
        $this->canvas($id);
        $command = get_option($this->key($id) . '_command');
        if (is_array($command)) $this->complete($id, $command['id'], ['ok' => false, 'error' => 'The builder disconnected. Inspect the canvas before retrying.']);
        delete_option($this->key($id));
        delete_option($this->key($id) . '_context');
        delete_option($this->key($id) . '_departed');
        global $wpdb;
        $prefix = $this->key($id) . '_command_claimed_';
        foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like($prefix) . '%')) as $name) {
            if (str_starts_with($name, $prefix)) delete_option($name);
        }
        return ['closed' => true];
    }
}
