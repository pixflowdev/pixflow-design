<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Modules;

if (!defined('ABSPATH')) exit;

/**
 * Registration boundary for separately packaged integrations.
 *
 * Register hooks only: a module must not perform writes, license network calls
 * or migrations during boot. Availability and authorization belong at the
 * operation boundary. This registry is not an entitlement mechanism.
 */
final class ModuleRegistry
{
    /** @var array<string, callable(): void> */
    private array $modules = [];
    /** @var array<string, \Throwable> */
    private array $failures = [];
    private bool $booted = false;

    public function add(string $id, callable $register): void
    {
        if ($this->booted) throw new \LogicException('Module registration has closed.');
        if (!preg_match('/\A[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\z/D', $id)) {
            throw new \InvalidArgumentException('Module IDs must use owner/name.');
        }
        if (isset($this->modules[$id])) throw new \LogicException('Module already registered: ' . $id);
        $this->modules[$id] = $register;
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_keys($this->modules);
    }

    public function boot(): void
    {
        if ($this->booted) return;
        // Close registration before callbacks, including reentrant callbacks.
        $this->booted = true;
        foreach ($this->modules as $id => $register) {
            try {
                $register();
            } catch (\Throwable $error) {
                // Keep unrelated modules/core available. Already-added hooks
                // cannot be rolled back: failed modules must not be retried.
                $this->failures[$id] = $error;
            }
        }
    }

    /** @return array<string, \Throwable> Internal diagnostics; do not serialize to clients. */
    public function failures(): array
    {
        return $this->failures;
    }
}
