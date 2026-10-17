<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Media;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Turn a generation brief into human-readable media names.
 *
 * Prompts are written as instructions ("make a ...", "create an ..."), but
 * filenames should describe the resulting asset. Keep the cleanup here so
 * direct WordPress generation and the normal media upload finalizer use the
 * same naming rules.
 */
final class GeneratedMediaNaming
{
    public static function title(string $prompt, string $surface): string
    {
        $subject = self::subject($prompt);
        if ($subject !== '') {
            $title = sanitize_text_field(wp_trim_words($subject, 12, ''));
            if ($title !== '') {
                return $title;
            }
        }

        return 'Pixflow generated ' . ($surface !== '' ? $surface : 'media');
    }

    public static function filename_stem(string $title, string $prompt, string $surface): string
    {
        $source = trim($prompt) !== '' ? $prompt : $title;
        $subject = self::subject($source);
        if ($subject === '') {
            $subject = trim($title);
        }
        $subject = wp_trim_words($subject, 12, '');
        $slug = sanitize_title($subject);
        if ($slug !== '') {
            return $slug;
        }

        return 'pixflow-generated-' . ($surface !== '' ? sanitize_key($surface) : 'media');
    }

    private static function subject(string $value): string
    {
        $compact = trim((string) preg_replace('/\s+/', ' ', $value));
        if ($compact === '') {
            return '';
        }

        $parts = preg_split('/[.!?](?:\s|$)/', $compact, 2);
        $subject = trim((string) ($parts[0] ?? $compact));

        // Remove conversational wrappers and the imperative that describes
        // the request. The words after it are the asset description.
        $subject = (string) preg_replace(
            '/^(?:(?:please|could you|can you|would you|i want|i need|help me)\s+)+/i',
            '',
            $subject,
        );
        $subject = (string) preg_replace(
            '/^(?:create|make|generate|design|produce|render|draw|paint|illustrate|show|depict|imagine|compose|build)\s+(?:me\s+)?/i',
            '',
            $subject,
        );
        $subject = (string) preg_replace('/^(?:an?|the|some)\s+/i', '', $subject);

        // "an image of a ..." and "a photo of a ..." are prompt grammar,
        // not useful filename words. Keep the meaningful subject and its
        // descriptors while retaining phrases such as "in a warm palette".
        $subject = (string) preg_replace(
            '/^(?:an?|the|some\s+)?(?:image|photo|picture|illustration|rendering|graphic|visual)\s+of\s+/i',
            '',
            $subject,
        );
        $subject = (string) preg_replace('/\bof\s+(?:an?|the)\s+/i', '', $subject);

        // Negative constraints are useful to the model but make noisy names.
        $subject = (string) preg_replace(
            '/(?:,|\s+)(?:with\s+)?(?:no|without|avoid|excluding|exclude|do not include|don\'t include)\s+(?:any\s+)?(?:text|words|lettering|logo(?:s)?|watermarks?|branding|labels?)\b.*$/i',
            '',
            $subject,
        );

        return trim((string) preg_replace('/[,:;|]+/', ' ', $subject));
    }
}
