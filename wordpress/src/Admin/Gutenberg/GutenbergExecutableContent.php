<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Admin\Gutenberg;
use PixflowDesign\WordPress\Modules\FeatureContributions;
if (!defined('ABSPATH')) exit;

/** Reject newly authored executable fragments without rewriting existing documents. */
final class GutenbergExecutableContent
{
    public static function assert_live(string $tool, array $args): void
    {
        if (self::live_error($tool, $args)) throw new \RuntimeException(self::message());
    }

    public static function live_error(string $tool, array $args): ?\WP_Error
    {
        if (self::advanced_authority()) return null;
        $tokens = match ($tool) {
            'gutenberg.insert' => self::tree_tokens((array) ($args['blocks'] ?? [])),
            'gutenberg.update' => self::attribute_tokens($args['attributes'] ?? []),
            default => [],
        };
        return $tokens === [] ? null : self::error();
    }

    /** Product availability is a normal tool result; missing authority remains an error. */
    public static function blocked_result(\WP_Error $error): array|\WP_Error
    {
        return \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::available()
            ? new \WP_Error('gutenberg_executable_content_forbidden', 'This WordPress account or installation does not permit executable-code authoring.', ['status'=>403])
            : \PixflowDesign\WordPress\Modules\AdvancedSiteAccess::not_allowed();
    }

    /** Complete proposed trees may retain unchanged executable fragments already in the target. */
    public static function tree_error(array $blocks, string $existingContent): ?\WP_Error
    {
        return self::advanced_authority() || !self::introduces(self::tree_tokens($blocks), self::markup_tokens($existingContent))
            ? null : self::error();
    }

    /** Recheck prepared content at the write boundary, including after Pro access expires. */
    public static function content_error(string $content, string $existingContent): ?\WP_Error
    {
        return self::advanced_authority() || !self::introduces(self::markup_tokens($content), self::markup_tokens($existingContent))
            ? null : self::error();
    }

    private static function advanced_authority(): bool
    {
        $allow = FeatureContributions::all()['advanced-site-tools']['allowsExecutableContent'] ?? null;
        return is_callable($allow) && $allow() === true;
    }

    private static function tree_tokens(array $blocks): array
    {
        $tokens = [];
        foreach ($blocks as $block) {
            if (is_object($block)) $block = get_object_vars($block);
            if (!is_array($block)) continue;
            $tokens = [...$tokens, ...self::attribute_tokens($block['attributes'] ?? $block['attrs'] ?? []), ...self::tree_tokens((array) ($block['innerBlocks'] ?? []))];
        }
        return $tokens;
    }

    private static function attribute_tokens(mixed $value, string $key = '', int $depth = 0): array
    {
        if ($depth > 40) throw new \RuntimeException('Block attributes exceed the supported nesting depth.');
        if (is_object($value)) $value = get_object_vars($value);
        if (is_array($value)) {
            $tokens = [];
            foreach ($value as $name => $child) $tokens = [...$tokens, ...self::attribute_tokens($child, (string) $name, $depth + 1)];
            return $tokens;
        }
        if (!is_string($value)) return [];
        $tokens = self::markup_tokens($value);
        if (preg_match('/(?:^|_)(?:url|href|src|action|poster)$|(?:Url|Href|Src)$/', $key) && self::executable_url($value)) $tokens[] = 'url:' . $value;
        if (preg_match('/^on[a-z]+$/i', $key) && $value !== '') $tokens[] = 'event:' . strtolower($key) . ':' . $value;
        return $tokens;
    }

    /** Parse actual HTML attributes; escaped code samples never become markup. */
    private static function markup_tokens(string $html, int $depth = 0): array
    {
        if ($depth > 32) return ['nested-document-limit'];
        $tokens = [];
        if (preg_match_all('~<\?(?!xml\b)[\s\S]*?(?:\?>|$)~i', $html, $php)) foreach ($php[0] as $fragment) $tokens[] = 'php:' . $fragment;
        if (!str_contains($html, '<')) return $tokens;
        if (class_exists('WP_HTML_Tag_Processor')) {
            $processor = new \WP_HTML_Tag_Processor($html);
            while ($processor->next_tag()) {
                if ($processor->get_tag() === 'SCRIPT' && !in_array(strtolower(trim((string) $processor->get_attribute('type'))), ['application/json','application/ld+json'], true)) $tokens[] = 'script:' . self::script_fragment($processor);
                foreach ($processor->get_attribute_names_with_prefix('') ?? [] as $name) {
                    $value = $processor->get_attribute($name);
                    if (!is_string($value)) continue;
                    if (preg_match('/^on[a-z]+$/i', $name) && $value !== '') $tokens[] = 'event:' . strtolower($name) . ':' . $value;
                    if (preg_match('/(?:^|:)(?:href|src|action|formaction|data|poster)$/i', $name) && self::executable_url($value)) $tokens[] = 'url:' . $value;
                    if (strtolower($name) === 'srcdoc') $tokens = [...$tokens, ...self::markup_tokens($value, $depth + 1)];
                }
            }
            return $tokens;
        }
        // Only isolated PHP harnesses lack the core 6.2 HTML parser. Keep the
        // same checks conservative there; production uses the native tokenizer.
        if (preg_match_all('~<script\b[^>]*>[\s\S]*?(?:</script\s*>|$)~i', $html, $scripts)) foreach ($scripts[0] as $fragment) $tokens[] = 'script:' . $fragment;
        if (preg_match_all('~<[^>]+>~', $html, $tags)) foreach ($tags[0] as $tag) {
            if (preg_match_all('~\b(on[a-z]+|(?:xlink:)?href|src|action|formaction|data|poster)\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+))~i', $tag, $attributes, PREG_SET_ORDER)) foreach ($attributes as $attribute) {
                $name = strtolower($attribute[1]); $value = $attribute[2] !== '' ? $attribute[2] : (($attribute[3] ?? '') !== '' ? $attribute[3] : ($attribute[4] ?? ''));
                if (str_starts_with($name, 'on') && $value !== '') $tokens[] = 'event:' . $name . ':' . $value;
                elseif (self::executable_url($value)) $tokens[] = 'url:' . $value;
            }
        }
        return $tokens;
    }

    /** Locate the actual parser-matched script, excluding script examples in HTML comments. */
    private static function script_fragment(\WP_HTML_Tag_Processor $processor): string
    {
        // This marker touches only the parser's temporary analysis string. It
        // never changes the caller's tree, saved HTML or live editor document.
        $marker = 'data-pixflow-analysis-' . bin2hex(random_bytes(8));
        $processor->set_attribute($marker, true);
        $marked = $processor->get_updated_html();
        $position = strpos($marked, $marker);
        $start = $position === false ? false : strrpos(substr($marked, 0, $position), '<');
        $fragment = $start !== false && preg_match('~^<script\b[^>]*>[\s\S]*?(?:</script\s*>|$)~i', substr($marked, $start), $match)
            ? str_replace(' ' . $marker, '', $match[0]) : $marked;
        $processor->remove_attribute($marker);
        return $fragment;
    }

    private static function executable_url(string $value): bool
    {
        $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $compact = preg_replace('/[\x00-\x20\x7f]+/', '', $decoded) ?? $decoded;
        return (bool) preg_match('~^(?:javascript|vbscript):|^data:(?:text/html|application/xhtml\+xml|image/svg\+xml)(?:[;,]|$)~i', $compact);
    }

    private static function introduces(array $proposed, array $existing): bool
    {
        $remaining = array_count_values($existing);
        foreach ($proposed as $fragment) {
            if (($remaining[$fragment] ?? 0) < 1) return true;
            $remaining[$fragment]--;
        }
        return false;
    }

    private static function message(): string { return 'This content operation cannot introduce executable PHP or JavaScript. Use native content blocks. Existing content was preserved.'; }
    private static function error(): \WP_Error { return new \WP_Error('gutenberg_executable_content_not_allowed', self::message(), ['status'=>422]); }
}
