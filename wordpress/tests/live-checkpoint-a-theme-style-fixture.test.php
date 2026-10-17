<?php

declare(strict_types=1);

require_once __DIR__ . '/fixtures/live-checkpoint-a-theme-style.php';

function assert_checkpoint_theme_style(bool $condition, string $message): void
{
    if ($condition) {
        return;
    }
    fwrite(STDERR, $message . "\n");
    exit(1);
}

$fixture = pixflow_live_checkpoint_a_theme_style_fixture([3845, 3852, 3852]);
$typography = $fixture['settings']['typography'] ?? [];
$preflight_elements = pixflow_live_checkpoint_a_preflight_elements();

assert_checkpoint_theme_style(($typography['typographyHeadingH1']['font-size'] ?? '') === '4.5rem', 'Base H1 control is incorrect.');
assert_checkpoint_theme_style(($typography['typographyHeadingH1:tablet_portrait']['font-size'] ?? '') === '3.25rem', 'Tablet H1 control is not stored on the native Bricks control key.');
assert_checkpoint_theme_style(($typography['typographyHeadingH1:mobile_portrait']['font-size'] ?? '') === '2.25rem', 'Mobile H1 control is not stored on the native Bricks control key.');
assert_checkpoint_theme_style(($typography['typographyHeadingH2:mobile_portrait']['font-size'] ?? '') === '1.55rem', 'Responsive-only H2 control is not stored on the native Bricks control key.');
assert_checkpoint_theme_style(!array_key_exists('font-size:tablet_portrait', $typography['typographyHeadingH1'] ?? []), 'Fixture restored malformed declaration-level breakpoint storage.');
assert_checkpoint_theme_style(($fixture['settings']['button']['sizeDefaultPadding:mobile_portrait']['left'] ?? '') === '1.25rem', 'Button responsive padding control changed.');
assert_checkpoint_theme_style(($fixture['settings']['section']['padding:mobile_portrait']['top'] ?? '') === '3.5rem', 'Section responsive padding control changed.');
assert_checkpoint_theme_style(($fixture['settings']['container']['padding:mobile_portrait']['left'] ?? '') === '1rem', 'Container responsive padding control changed.');
assert_checkpoint_theme_style(($fixture['settings']['conditions']['conditions'][0]['ids'] ?? []) === [3845, 3852], 'Fixture post conditions are not deterministic.');
assert_checkpoint_theme_style(count($preflight_elements) === 4, 'Preflight tree is not the bounded four-element native fixture.');
assert_checkpoint_theme_style(array_column($preflight_elements, 'name') === ['section', 'container', 'heading', 'button'], 'Preflight tree does not use the intended native Bricks elements.');
assert_checkpoint_theme_style(($preflight_elements[2]['settings']['tag'] ?? '') === 'h1', 'Preflight heading is not an H1 Theme Style probe.');
assert_checkpoint_theme_style(!str_contains(serialize($preflight_elements), 'pixflow-measured-'), 'Preflight tree contains Pixflow-generated style ownership.');

echo "Live Checkpoint A Theme Style fixture tests passed.\n";
