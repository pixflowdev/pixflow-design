<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\Framework\DesignSystem;

if (!defined('ABSPATH')) {
    exit;
}

class DesignSystemValues
{
    protected const SCHEMES = ['main', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary'];
    protected const SOURCE_NAMES = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary'];
    protected const LIGHT_MIXES = [0.3, 0.8, 0.9];
    protected const DARK_MIXES = [0.2, 0.6, 0.7];
    protected const LEGACY_DARK_MIXES = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
    protected const NEUTRAL_WHITE_MIXES = [1.0, 0.95, 0.85, 0.7, 0.5, 0.3, 0.1, 0.0];

    protected const TYPOGRAPHY_SCALES = [
        'small' => [
            'text' => ['xs' => [1, 1.2], 's' => [1.2, 1.4], 'm' => [1.4, 1.6], 'l' => [1.6, 1.8], 'xl' => [1.8, 2], '2xl' => [2, 2.4], '3xl' => [2.4, 3.2], '4xl' => [3.2, 4]],
            'heading' => ['xs' => [1.8, 2], 's' => [2, 2.4], 'm' => [2.4, 3.2], 'l' => [3.2, 4], 'xl' => [3.6, 4.8], '2xl' => [4, 5.6]],
        ],
        'regular' => [
            'text' => ['xs' => [1.2, 1.4], 's' => [1.4, 1.6], 'm' => [1.6, 1.8], 'l' => [1.8, 2.2], 'xl' => [2.2, 2.6], '2xl' => [2.6, 3.2], '3xl' => [3.2, 4], '4xl' => [4, 4.8]],
            'heading' => ['xs' => [1.8, 2.2], 's' => [2, 2.8], 'm' => [2.4, 3.6], 'l' => [3.2, 4.4], 'xl' => [4, 5.2], '2xl' => [4.4, 7.2]],
        ],
        'large' => [
            'text' => ['xs' => [1.2, 1.4], 's' => [1.4, 1.6], 'm' => [1.8, 2], 'l' => [2, 2.6], 'xl' => [2.6, 3.2], '2xl' => [3.2, 4], '3xl' => [4, 4.8], '4xl' => [4.8, 5.6]],
            'heading' => ['xs' => [1.8, 2.6], 's' => [2, 3.2], 'm' => [2.4, 4], 'l' => [3.2, 4.8], 'xl' => [4.4, 6], '2xl' => [4.8, 8.4]],
        ],
    ];

    protected function global_variables(array $profile): array
    {
        $variables = [];

        $size = (string) ($profile['typographySize'] ?? 'regular');
        $scale = self::TYPOGRAPHY_SCALES[$size] ?? self::TYPOGRAPHY_SCALES['regular'];
        foreach ($scale as $kind => $steps) {
            foreach ($steps as $step => $values) {
                $name = $kind . '--' . $step;
                $variables[] = ['id' => $name, 'name' => $name, 'value' => $this->clamp_value((float) $values[0], (float) $values[1])];
            }
        }

        $variables[] = ['id' => 'radius--btn', 'name' => 'radius--btn', 'value' => $this->button_radius((string) ($profile['buttonRadius'] ?? 'medium'))];
        $variables[] = ['id' => 'radius--surface', 'name' => 'radius--surface', 'value' => $this->surface_radius((string) ($profile['surfaceRadius'] ?? 'medium'))];
        $border = match ((string) ($profile['designStyle'] ?? 'default')) {
            'flat' => '0px',
            'edgy' => '2px',
            default => '1px',
        };
        $variables[] = ['id' => 'border--btn', 'name' => 'border--btn', 'value' => $border];
        $variables[] = ['id' => 'border--surface', 'name' => 'border--surface', 'value' => $border];

        return $variables;
    }

    protected function button_preset_css(array $profile): string
    {
        $preset = (string) ($profile['buttonStylePreset'] ?? 'default');
        if ($preset === 'default') {
            return '';
        }
        $gradient_end = (string) ($profile['buttonGradientEnd'] ?? '#bd1276');
        $definitions = $this->button_variant_definitions($profile, $preset, $gradient_end);
        $transition = 'background-color 160ms ease, background-image 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms ease';
        $lines = ['/* Pixflow Framework button preset: ' . $preset . ' */'];
        foreach ($definitions as $variant => $definition) {
            $gradient = $preset === 'gradient' && in_array($variant, ['primary', 'secondary'], true);
            $normal_shadow_source = $gradient || $preset === 'elevate' ? $definition['background'] : $definition['border'];
            $normal = [
                'transition:' . $transition . '!important',
                'color:' . $definition['text'] . '!important',
                'background:' . $definition['background'] . '!important',
                'background-image:' . ($gradient ? 'linear-gradient(135deg,' . $definition['background'] . ',' . $gradient_end . ')' : 'none') . '!important',
                'border-color:' . $definition['border'] . '!important',
                'border-style:' . ($gradient ? 'none' : 'solid') . '!important',
                'box-shadow:' . $this->button_shadow($preset, $normal_shadow_source) . '!important',
            ];
            $outline = [
                'transition:' . $transition . '!important',
                'color:' . $definition['outlineText'] . '!important',
                'background:transparent!important',
                'background-image:none!important',
                'border-color:' . $definition['outlineBorder'] . '!important',
                'border-style:solid!important',
                'box-shadow:' . $this->button_shadow($preset, $definition['outlineBorder'], false, true) . '!important',
            ];
            if ($preset === 'brick') {
                $normal[] = 'border-width:max(var(--border--btn,1px),2px)!important';
                $outline[] = 'border-width:max(var(--border--btn,1px),2px)!important';
            } elseif ($preset === 'sleek') {
                $normal[] = 'padding:0.55rem 1.15rem!important';
                $outline[] = 'padding:0.55rem 1.15rem!important';
            }

            $lines[] = $this->button_selector($variant) . '{' . implode(';', $normal) . '}';
            $lines[] = $this->button_selector($variant, true) . '{' . implode(';', $outline) . '}';
            if (in_array($preset, ['bubble', 'brick', 'elevate'], true) || $gradient) {
                $translate = $preset === 'brick' ? '-0.06rem' : '-0.08rem';
                $lines[] = $this->button_selector($variant, false, ':hover') . '{transform:translateY(' . $translate . ')!important;box-shadow:' . $this->button_shadow($preset, $normal_shadow_source, true) . '!important}';
                $lines[] = $this->button_selector($variant, true, ':hover') . '{transform:translateY(' . $translate . ')!important;box-shadow:' . $this->button_shadow($preset, $definition['outlineBorder'], true, true) . '!important}';
            }
        }
        return implode("\n", $lines);
    }

    protected function button_variant_definitions(array $profile, string $preset, string $gradient_end): array
    {
        $source = is_array($profile['sourcePalette'] ?? null) ? $profile['sourcePalette'] : [];
        $primary = (string) ($source[0] ?? $profile['colors']['main']['accent'] ?? '#6c32c3');
        $secondary = (string) ($source[1] ?? $profile['colors']['secondary']['accent'] ?? $primary);
        $definitions = [
            'primary' => ['background' => 'var(--accent)', 'text' => 'var(--btn-text)', 'border' => 'var(--accent)', 'outlineText' => 'var(--accent)', 'outlineBorder' => 'var(--accent)'],
            'secondary' => ['background' => 'color-mix(in srgb,var(--heading),transparent 92%)', 'text' => 'var(--heading)', 'border' => 'var(--border)', 'outlineText' => 'var(--heading)', 'outlineBorder' => 'var(--border)'],
            'light' => ['background' => 'var(--light)', 'text' => 'var(--dark)', 'border' => 'var(--light)', 'outlineText' => 'var(--light)', 'outlineBorder' => 'var(--light)'],
            'dark' => ['background' => 'var(--dark)', 'text' => 'var(--light)', 'border' => 'var(--dark)', 'outlineText' => 'var(--dark)', 'outlineBorder' => 'var(--dark)'],
            'muted' => ['background' => 'var(--input)', 'text' => 'var(--heading)', 'border' => 'var(--border)', 'outlineText' => 'var(--heading)', 'outlineBorder' => 'var(--border)'],
            'info' => ['background' => '#2563eb', 'text' => $this->readable_text('#2563eb'), 'border' => '#2563eb', 'outlineText' => '#2563eb', 'outlineBorder' => '#2563eb'],
            'success' => ['background' => '#16a34a', 'text' => $this->readable_text('#16a34a'), 'border' => '#16a34a', 'outlineText' => '#16a34a', 'outlineBorder' => '#16a34a'],
            'warning' => ['background' => '#f59e0b', 'text' => $this->readable_text('#f59e0b'), 'border' => '#f59e0b', 'outlineText' => '#a16207', 'outlineBorder' => '#f59e0b'],
            'danger' => ['background' => '#dc2626', 'text' => $this->readable_text('#dc2626'), 'border' => '#dc2626', 'outlineText' => '#dc2626', 'outlineBorder' => '#dc2626'],
        ];
        foreach ($definitions as $variant => &$definition) {
            if ($preset === 'gradient') {
                if ($variant === 'primary') {
                    $definition['text'] = $this->readable_gradient($primary, $gradient_end);
                    $definition['border'] = 'var(--transparent)';
                } elseif ($variant === 'secondary') {
                    $definition['background'] = 'var(--secondary,var(--accent))';
                    $definition['text'] = $this->readable_gradient($secondary, $gradient_end);
                    $definition['border'] = 'var(--transparent)';
                }
            } elseif ($preset === 'brick') {
                $definition['border'] = $this->button_color_mix($definition['background'], 64);
            } elseif ($preset === 'bubble') {
                $definition['border'] = $this->button_color_mix($definition['background'], 76);
            } elseif ($preset === 'elevate') {
                $definition['border'] = $this->button_color_mix($definition['background'], 70, 'transparent');
            }
        }
        unset($definition);
        return $definitions;
    }

    protected function button_color_mix(string $color, int $percent, string $mix = '#000'): string
    {
        return 'color-mix(in srgb,' . $color . ' ' . $percent . '%,' . $mix . ' ' . (100 - $percent) . '%)';
    }

    protected function button_shadow(string $preset, string $color, bool $hover = false, bool $outline = false): string
    {
        if ($preset === 'brick') {
            return 'inset 0 -4px 0 0 color-mix(in srgb,var(--neutral-d-2,var(--dark,#000)) 16%,transparent),inset 0 -5px 0 0 color-mix(in srgb,var(--neutral-d-3,var(--dark,#000)) 15%,transparent),0 2px 2px 0 color-mix(in srgb,var(--neutral-d-3,var(--dark,#000)) 15%,transparent)';
        }
        if ($preset === 'bubble') {
            return '0 ' . ($hover ? '0.42rem' : '0.34rem') . ' 0 ' . $this->button_color_mix($color, $outline ? ($hover ? 58 : 64) : ($hover ? 62 : 68));
        }
        if ($preset === 'elevate') {
            return $hover
                ? '0 0.55rem 1.25rem ' . $this->button_color_mix($color, 30, 'transparent') . ',0 0.1rem 0.18rem rgba(0,0,0,0.16)'
                : '0 0.35rem 0.9rem ' . $this->button_color_mix($color, 24, 'transparent') . ',0 0.08rem 0.16rem rgba(0,0,0,0.16)';
        }
        if ($preset === 'gradient' && $hover) {
            return '0 0.55rem 1.1rem ' . $this->button_color_mix($color, 28, 'transparent');
        }
        return 'none';
    }

    protected function readable_gradient(string $start, string $end): string
    {
        $backgrounds = [$this->normalize_hex($start), $this->mix($start, $end, 0.5), $this->normalize_hex($end)];
        $white = min(array_map(fn(string $background): float => abs($this->apca_contrast('#ffffff', $background)), $backgrounds));
        $black = min(array_map(fn(string $background): float => abs($this->apca_contrast('#111111', $background)), $backgrounds));
        return $white >= $black ? '#ffffff' : '#111111';
    }

    protected function derived_group(array $group, string $design_style): array
    {
        $background = $this->normalize_hex((string) ($group['background'] ?? '#f1f0ee'));
        $foreground = $design_style === 'outlined'
            ? $background
            : $this->normalize_hex((string) ($group['foreground'] ?? '#e4e3e2'));
        $text = $this->normalize_hex((string) ($group['text'] ?? '#39363d'));
        return [
            'background' => $background,
            'foreground' => $foreground,
            'heading' => $this->normalize_hex((string) ($group['heading'] ?? '#322f35')),
            'text' => $text,
            'accent' => $this->normalize_hex((string) ($group['accent'] ?? '#6c32c3')),
            'border' => $design_style === 'edgy' ? $this->normalize_hex((string) ($group['heading'] ?? '#322f35')) : $this->mix($background, $text, $text === '#ffffff' ? 0.2 : 0.15),
            'input' => $this->mix($background, $text, $text === '#ffffff' ? 0.1 : 0.08),
            'buttonText' => $this->readable_text((string) ($group['accent'] ?? '#6c32c3')),
        ];
    }

    protected function color_ramp(string $base, string $route_id): array
    {
        $base = $this->normalize_hex($base);
        $format = fn(string $hex): string => in_array($route_id, ['pixflow-core', 'pixflow-at'], true) ? $this->hsla($hex) : $hex;
        $light = array_map(fn(float $amount): string => $format($this->mix($base, '#ffffff', $amount, true)), self::LIGHT_MIXES);
        $dark = array_map(fn(float $amount): string => $format($this->mix($base, '#000000', $amount, true)), self::DARK_MIXES);
        return [
            'light' => $light,
            'dark' => $dark,
            'legacyDark' => array_map(fn(float $amount): string => $format($this->mix($base, '#000000', $amount, true)), self::LEGACY_DARK_MIXES),
        ];
    }

    protected function neutral_ramp($tint, string $route_id): array
    {
        $seed = is_string($tint) && $tint !== '' ? $this->mix('#000000', $this->normalize_hex($tint), 0.05) : '#000000';
        return array_map(function (float $amount) use ($seed, $route_id): string {
            $hex = $this->mix($seed, '#ffffff', $amount, true);
            return in_array($route_id, ['pixflow-core', 'pixflow-at'], true) ? $this->hsla($hex) : $hex;
        }, self::NEUTRAL_WHITE_MIXES);
    }

    protected function readable_text(string $background): string
    {
        return abs($this->apca_contrast('#ffffff', $this->normalize_hex($background))) >= 54 ? '#ffffff' : '#111111';
    }

    protected function apca_contrast(string $text, string $background): float
    {
        $text_l = $this->apca_luminance($text);
        $background_l = $this->apca_luminance($background);
        if (abs($background_l - $text_l) < 0.0005) {
            return 0.0;
        }
        return $background_l > $text_l
            ? (pow($background_l, 0.56) - pow($text_l, 0.57)) * 1.14 * 100
            : (pow($background_l, 0.65) - pow($text_l, 0.62)) * 1.14 * 100;
    }

    protected function apca_luminance(string $hex): float
    {
        [$r, $g, $b] = $this->rgb($hex);
        return 0.2126729 * pow($r / 255, 2.4) + 0.7151522 * pow($g / 255, 2.4) + 0.072175 * pow($b / 255, 2.4);
    }

    protected function mix(string $source, string $target, float $amount, bool $floor = false): string
    {
        $source_rgb = $this->rgb($source);
        $target_rgb = $this->rgb($target);
        $channels = [];
        foreach ([0, 1, 2] as $index) {
            $value = $source_rgb[$index] + ($target_rgb[$index] - $source_rgb[$index]) * $amount;
            $channels[] = max(0, min(255, $floor ? (int) floor($value) : (int) round($value)));
        }
        return sprintf('#%02x%02x%02x', ...$channels);
    }

    protected function rgb(string $hex): array
    {
        $hex = ltrim($this->normalize_hex($hex), '#');
        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }

    protected function normalize_hex(string $value): string
    {
        $value = strtolower(trim($value));
        if (preg_match('/^#[0-9a-f]{3}$/', $value)) {
            return '#' . $value[1] . $value[1] . $value[2] . $value[2] . $value[3] . $value[3];
        }
        return preg_match('/^#[0-9a-f]{6}$/', $value) ? $value : '#6c32c3';
    }

    protected function hsla(string $hex): string
    {
        [$r, $g, $b] = array_map(static fn(int $channel): float => $channel / 255, $this->rgb($hex));
        $max = max($r, $g, $b);
        $min = min($r, $g, $b);
        $lightness = ($max + $min) / 2;
        $delta = $max - $min;
        $hue = 0.0;
        $saturation = 0.0;
        if ($delta > 0) {
            $saturation = $lightness > 0.5 ? $delta / (2 - $max - $min) : $delta / ($max + $min);
            if ($max === $r) {
                $hue = (($g - $b) / $delta) + ($g < $b ? 6 : 0);
            } elseif ($max === $g) {
                $hue = (($b - $r) / $delta) + 2;
            } else {
                $hue = (($r - $g) / $delta) + 4;
            }
            $hue *= 60;
        }
        return sprintf('hsla(%d, %d%%, %d%%, 1)', (int) round($hue), (int) round($saturation * 100), (int) round($lightness * 100));
    }

    protected function token_from_raw(string $raw): string
    {
        return preg_match('/^var\(--([^)]+)\)$/', $raw, $match) ? (string) $match[1] : '';
    }

    protected function clamp_value(float $minimum, float $maximum): string
    {
        $slope = ($maximum - $minimum) / 108;
        return sprintf(
            'clamp(%srem, calc(%s * (100vw - 36rem) + %srem), %srem)',
            $this->number($minimum),
            $this->number($slope, 15),
            $this->number($minimum),
            $this->number($maximum)
        );
    }

    protected function number(float $value, int $precision = 3): string
    {
        return rtrim(rtrim(number_format($value, $precision, '.', ''), '0'), '.');
    }

    protected function button_radius(string $preset): string
    {
        return match ($preset) {
            'none' => '0px',
            'small' => 'clamp(0.4rem, calc(0vw + 0.4rem), 0.4rem)',
            'large' => '999rem',
            default => 'clamp(0.6875rem, calc(-0.28vw + 0.931rem), 0.875rem)',
        };
    }

    protected function surface_radius(string $preset): string
    {
        return match ($preset) {
            'none' => '0px',
            'small' => 'clamp(1rem, calc(-0.16vw + 1.25rem), 1.2rem)',
            'large' => 'clamp(2.6rem, calc(-0.47vw + 3.35rem), 3.2rem)',
            default => 'clamp(1.6rem, calc(-0.31vw + 2.1rem), 2rem)',
        };
    }

protected function palette_colors(array $profile, string $route_id): array
    {
        $colors = [];
        $source = !empty($profile['sourcePalette']) && is_array($profile['sourcePalette'])
            ? array_values($profile['sourcePalette'])
            : [
                $profile['colors']['main']['accent'] ?? '#6c32c3',
                $profile['colors']['secondary']['accent'] ?? '#e2a098',
                $profile['colors']['tertiary']['accent'] ?? '#41b592',
            ];

        foreach (self::SOURCE_NAMES as $index => $name) {
            if (!isset($source[$index])) {
                continue;
            }
            $colors[] = $this->color('var(--' . $name . ')', (string) $source[$index], $route_id);
        }

        $neutral = $this->neutral_ramp($profile['neutralTintHex'] ?? null, $route_id);
        foreach ([
            'neutral-l-3' => 1, 'neutral-l-2' => 2, 'neutral-l-1' => 3,
            'neutral' => 4, 'neutral-d-1' => 5, 'neutral-d-2' => 6, 'neutral-d-3' => 7,
            'light' => 0, 'dark' => 7, 'shadow' => 1,
        ] as $name => $index) {
            $colors[] = $this->color('var(--' . $name . ')', $neutral[$index] ?? '#000000', $route_id);
        }
        $colors[] = $this->color('var(--transparent)', 'hsla(0, 0%, 0%, 0)', $route_id);

        $scheme_count = max(1, min(6, (int) ($profile['colorSchemeCount'] ?? 3)));
        foreach (array_slice(self::SCHEMES, 0, $scheme_count) as $index => $scheme_key) {
            $group = $profile['colors'][$scheme_key] ?? $profile['colors']['main'];
            $prefix = $index === 0 ? '' : 's' . ($index + 1) . '-';
            $derived = $this->derived_group($group, (string) ($profile['designStyle'] ?? 'default'));
            foreach ([
                'background' => $derived['background'],
                'foreground' => $derived['foreground'],
                'heading' => $derived['heading'],
                'text' => $derived['text'],
                'accent' => $derived['accent'],
                'border' => $derived['border'],
                'input' => $derived['input'],
                'btn-text' => $derived['buttonText'],
            ] as $token => $value) {
                $colors[] = $this->color('var(--' . $prefix . $token . ')', $value, $route_id);
            }

            $accent_ramp = $this->color_ramp($derived['accent'], $route_id);
            foreach ($accent_ramp['light'] as $shade_index => $value) {
                $colors[] = $this->color('var(--' . $prefix . 'accent-l-' . ($shade_index + 1) . ')', $value, $route_id);
            }
            foreach ($accent_ramp['dark'] as $shade_index => $value) {
                $colors[] = $this->color('var(--' . $prefix . 'accent-d-' . ($shade_index + 1) . ')', $value, $route_id);
            }

            if (true) {
                foreach (['background' => $derived['background'], 'foreground' => $derived['foreground']] as $token => $base) {
                    foreach ($this->color_ramp($base, $route_id)['legacyDark'] as $shade_index => $value) {
                        $colors[] = $this->color('var(--' . $prefix . $token . '-d-' . ($shade_index + 1) . ')', $value, $route_id);
                    }
                }
            }
        }

        return $colors;
    }
    protected function color(string $raw, string $light, string $route_id): array { return ['raw'=>$raw, 'light'=>$light]; }
    protected function button_selector(string $variant, bool $outline = false, string $pseudo = ''): string { return '.pds-' . $variant . ($outline ? '.outline' : ':not(.outline)') . $pseudo; }
    public function values(array $profile): array {
      $heading = match ((string) ($profile['headingStylePreset'] ?? 'default')) {
        'spacious' => ['line-height'=>'1.3','text-transform'=>'none','letter-spacing'=>'0em'],
        'uppercase' => ['line-height'=>'1.1','text-transform'=>'uppercase','letter-spacing'=>'0.04em'],
        default => ['line-height'=>'1.2','text-transform'=>'none','letter-spacing'=>'0em'],
      };
      $heading['font-weight'] = match ((string) ($profile['headingWeightPreset'] ?? 'medium')) { 'normal'=>'400','bold'=>'700',default=>'600' };
      return ['colors'=>$this->palette_colors($profile,'native'), 'variables'=>$this->global_variables($profile), 'heading'=>$heading, 'buttonCss'=>$this->button_preset_css($profile)];
    }
}
