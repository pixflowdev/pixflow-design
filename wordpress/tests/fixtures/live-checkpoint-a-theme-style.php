<?php

declare(strict_types=1);

/**
 * Deterministic Phase 13 Theme Style fixture using Bricks 2.4 native
 * responsive control-key storage. Requiring this file has no side effects;
 * the live preflight explicitly writes the returned record through WP-CLI.
 *
 * @param array<int,int> $post_ids
 * @return array<string,mixed>
 */
function pixflow_live_checkpoint_a_theme_style_fixture(array $post_ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $post_ids), static fn(int $id): bool => $id > 0)));
    return [
        'id' => 'pixflow-live-checkpoint-a-3845',
        'label' => 'Pixflow Live Checkpoint A 3845',
        'settings' => [
            '_custom' => true,
            'conditions' => [
                'conditions' => [[
                    'id' => 'checkpointA3845',
                    'main' => 'ids',
                    'ids' => $ids,
                    'idsIncludeChildren' => false,
                ]],
            ],
            'typography' => [
                'typographyBody' => [
                    'font-family' => 'Inter',
                    'font-size' => '18px',
                    'line-height' => '1.65',
                    'color' => ['raw' => 'var(--text)'],
                ],
                'typographyHeadings' => [
                    'font-family' => 'Inter',
                    'font-weight' => '750',
                    'letter-spacing' => '-0.025em',
                    'color' => ['raw' => 'var(--heading)'],
                ],
                'typographyHeadingH1' => [
                    'font-size' => '4.5rem',
                    'line-height' => '1.02',
                ],
                'typographyHeadingH1:tablet_portrait' => [
                    'font-size' => '3.25rem',
                ],
                'typographyHeadingH1:mobile_portrait' => [
                    'font-size' => '2.25rem',
                ],
                'typographyHeadingH2:mobile_portrait' => [
                    'font-size' => '1.55rem',
                    'line-height' => '1.15',
                ],
            ],
            'section' => [
                'padding' => ['top' => '6rem', 'bottom' => '6rem'],
                'padding:mobile_portrait' => ['top' => '3.5rem', 'bottom' => '3.5rem'],
            ],
            'container' => [
                'widthMax' => '76rem',
                'padding' => ['left' => '3rem', 'right' => '3rem'],
                'padding:mobile_portrait' => ['left' => '1rem', 'right' => '1rem'],
            ],
            'general' => [
                'siteBackground' => ['color' => ['raw' => '#f4f0e6']],
            ],
            'button' => [
                'sizeDefaultPadding' => ['top' => '1rem', 'right' => '2rem', 'bottom' => '1rem', 'left' => '2rem'],
                'sizeDefaultPadding:mobile_portrait' => ['top' => '0.8rem', 'right' => '1.25rem', 'bottom' => '0.8rem', 'left' => '1.25rem'],
                'typography' => ['font-size' => '1rem', 'font-weight' => '700', 'letter-spacing' => '0.02em'],
                'border' => [
                    'radius' => ['top' => '28px', 'right' => '28px', 'bottom' => '28px', 'left' => '28px'],
                    'width' => ['top' => '1px', 'right' => '1px', 'bottom' => '1px', 'left' => '1px'],
                    'style' => 'solid',
                ],
            ],
        ],
        'conditions' => [
            'conditions' => [[
                'id' => 'checkpointA3845',
                'main' => 'ids',
                'ids' => $ids,
                'idsIncludeChildren' => false,
            ]],
        ],
    ];
}

/**
 * Minimal native Bricks tree used to prove the controlled Theme Style on the
 * real frontend before spending a provider generation. No Pixflow-generated
 * classes or authored styles are present, so every measured value comes from
 * Bricks and the stored Theme Style itself.
 *
 * @return array<int,array<string,mixed>>
 */
function pixflow_live_checkpoint_a_preflight_elements(): array
{
    return [
        ['id' => 'pfpre1', 'name' => 'section', 'settings' => [], 'children' => ['pfpre2'], 'parent' => 0],
        ['id' => 'pfpre2', 'name' => 'container', 'settings' => [], 'children' => ['pfpre3', 'pfpre4'], 'parent' => 'pfpre1'],
        [
            'id' => 'pfpre3',
            'name' => 'heading',
            'settings' => ['tag' => 'h1', 'text' => 'Native responsive Theme Style preflight'],
            'children' => [],
            'parent' => 'pfpre2',
        ],
        [
            'id' => 'pfpre4',
            'name' => 'button',
            'settings' => ['text' => 'Theme Style button', 'link' => ['type' => 'external', 'url' => '#']],
            'children' => [],
            'parent' => 'pfpre2',
        ],
    ];
}
