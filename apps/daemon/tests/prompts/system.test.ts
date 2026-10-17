import { describe, expect, it } from 'vitest';
import { composeSystemPrompt, resolveExclusiveSurface } from '../../src/prompts/system.js';

describe('composeSystemPrompt - Prototype Bricks Stage A profile', () => {
  it('uses the fail-soft Prototype HTML pipeline with only the Bricks-friendly authoring differences', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        intent: 'pixflow_prototype_bricks_stage_a',
        skipDiscoveryBrief: true,
      },
    });

    expect(prompt).toContain('# Pixflow Design charter');
    expect(prompt).toContain('### Once direction locks — plan, build, self-check');
    expect(prompt).toContain('**Plan first.**');
    expect(prompt).toContain('**Read once, in batches.**');
    expect(prompt).toContain('**Show progress, ship complete.**');
    expect(prompt).toContain('**Self-check once, at the end.**');
    expect(prompt).toContain('**Modern CSS welcome** — grid, container queries');
    // The compatibility-only Prototype/Bricks profile keeps the slim
    // charter, but no longer stages the generic direction catalogue. The
    // ordinary Build pipeline owns its own HTML-first contract and this
    // legacy profile must not be treated as a source of Build guidance.
    expect(prompt).not.toContain('## Direction library — bind into');
    expect(prompt).toContain('# Prototype HTML pipeline for Build in Bricks');
    expect(prompt).toContain('v0.16.1 slim Prototype HTML charter above is the creative workflow');
    expect(prompt).toContain('Use semantic BEM classes');
    expect(prompt).toContain('do not create a site header or footer unless the user explicitly requests one');
    expect(prompt).toContain('The converter owns framework-variable mapping');
    expect(prompt).toContain('Quality review is fail-soft');
    expect(prompt).toContain('Do not launch repeated screenshot, critic, repair, token-mapping, or conversion-planning loops');
    expect(prompt).toContain('invented metrics or filler copy');
    expect(prompt).toContain('warm beige/cream default canvases unless the brand requires them');
    expect(prompt).toContain('`data-od-id="kebab-case-id"`');
    expect(prompt).not.toContain('selected framework-route tokens as non-colour implementation vocabulary');
    expect(prompt).not.toContain('Treat that plan as a blocking deliverable');
    expect(prompt).not.toContain('ordered two-artifact fallback');
    expect(prompt).not.toContain('# Prototype HTML v0.16.1 quality core');
    expect(prompt).not.toContain('## Prototype HTML CSS and class contract');
    expect(prompt).not.toContain('Use Flexbox only for layout');
    expect(prompt).not.toContain('## Media generation (if asked)');
    expect(prompt).not.toContain('# Identity and workflow charter (background)');
  });
});

describe('composeSystemPrompt - Prototype HTML v0.16.1 quality parity', () => {
  it('adds the focused quality core to ordinary Prototype HTML runs', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', skipDiscoveryBrief: true },
      skillMode: 'prototype',
      skillName: 'example-web-prototype',
      skillBody: '# Web Prototype\n\nRead the seed and build the page.',
    });

    expect(prompt).toContain('# Prototype HTML v0.16.1 quality core');
    expect(prompt).toContain('Do not search for substitute skills');
    expect(prompt).toContain('opening, middle, proof or trust region, and close');
    expect(prompt).toContain('Build the complete requested scope');
    expect(prompt).toContain('No unintended overlap, clipping, horizontal overflow');
    expect(prompt).toContain('one targeted repair pass');
    expect(prompt).toContain('## Prototype HTML CSS and class contract');
  });

  it('does not add the Prototype HTML quality core to non-prototype media runs', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'image' } as any,
    });

    expect(prompt).not.toContain('# Prototype HTML v0.16.1 quality core');
  });
});

describe('composeSystemPrompt — activeStageBlocks splice (spec §23.4)', () => {
  it('inserts every active stage block after the plugin block when supplied', () => {
    const stage1 = '\n\n## Active stage: discovery\n\n### discovery-question-form\n\nAsk audience.';
    const stage2 = '\n\n## Active stage: plan\n\n### todo-write\n\nCommit a plan.';
    const prompt = composeSystemPrompt({
      pluginBlock: '\n\n## Active plugin\n\nThe user applied test-plugin.',
      activeStageBlocks: [stage1, stage2],
    });
    expect(prompt).toContain('## Active plugin');
    expect(prompt.indexOf('## Active stage: discovery')).toBeGreaterThan(prompt.indexOf('## Active plugin'));
    expect(prompt.indexOf('## Active stage: plan')).toBeGreaterThan(prompt.indexOf('## Active stage: discovery'));
  });

  it('skips empty / whitespace-only blocks', () => {
    const prompt = composeSystemPrompt({
      activeStageBlocks: ['', '   ', '\n\n## Active stage: critique\n\n### critique-theater\n\nScore.'],
    });
    expect(prompt).toContain('## Active stage: critique');
    // Only one stage block means just one heading.
    expect((prompt.match(/## Active stage:/g) ?? []).length).toBe(1);
  });

  it('is a no-op when activeStageBlocks is undefined or empty', () => {
    const baseline = composeSystemPrompt({});
    const withUndefined = composeSystemPrompt({ activeStageBlocks: undefined });
    const withEmpty = composeSystemPrompt({ activeStageBlocks: [] });
    expect(withUndefined).toBe(baseline);
    expect(withEmpty).toBe(baseline);
  });
});

describe('composeSystemPrompt', () => {
  it('injects Chinese quick brief guidance when the UI locale is zh-CN', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-CN` (Simplified Chinese)');
    expect(prompt).toContain('快速简报 — 30 秒');
    expect(prompt).toContain('目标用户');
    expect(prompt).toContain('视觉调性');
    expect(prompt).toContain('Keep machine-readable ids and object option `value` fields exact and unlocalized');
  });

  it('injects the converged verification policy (no mid-build screenshot looping)', () => {
    const prompt = composeSystemPrompt({});

    // Verification must read as an end-of-turn, single-pass step.
    expect(prompt).toContain('## Verification — converge at the end, in one pass');
    // The hard cap on rendered visual checks — the lever against codex's
    // self-initiated 6-12x screenshot retry chains that balloon input tokens.
    expect(prompt).toContain('One render check is the budget');
    expect(prompt).toContain('Do not loop');
    // Safety valve: visual verification is converged, NOT removed.
    expect(prompt).toContain('these justify ONE rendered look');
    // Route to the official wrapper, not a self-launched browser.
    expect(prompt).toContain('Do NOT launch your own browser to do this');
  });

  it('preserves default task-type values under locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain(
      'translate option labels and preserve the machine-readable values',
    );
    for (const option of [
      'wordpress-content',
      'wordpress-admin',
      'other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('preserves default task-type values for zh-TW locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-TW' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-TW` (Traditional Chinese)');
    expect(prompt).toContain(
      'translate option labels and preserve the machine-readable values',
    );
    for (const option of [
      'wordpress-content',
      'wordpress-admin',
      'other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('快速简报 — 30 秒');
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('treats an active design system as the visual direction', () => {
    const prompt = composeSystemPrompt({
      designSystemTitle: 'ComfyUI',
      designSystemBody: '# ComfyUI\n\n--accent: #ffd500',
      metadata: { kind: 'prototype' } as any,
      activeStageBlocks: [
        '\n\n## Active stage: plan\n\n### direction-picker\n\nAsk for 3-5 directions.',
      ],
    });

    expect(prompt).toContain('## Active design system — ComfyUI');
    expect(prompt).toContain('Active design system exception');
    expect(prompt).toContain(
      'the active design system is the visual direction for this project',
    );
    expect(prompt).toContain('Do not ask the user to pick a separate theme color');
    expect(prompt).toContain('Do not emit a direction question-form');
    expect(prompt).not.toContain('<question-form id="direction"');
    expect(prompt).not.toContain('Pick a visual direction');
    expect(prompt.indexOf('## Active design system visual direction')).toBeGreaterThan(
      prompt.indexOf('### direction-picker'),
    );
  });

  it('uses stable brand option values for discovery-form branching', () => {
    const prompt = composeSystemPrompt({});
    expect(prompt).toContain('{ "label": "Pick a direction for me", "value": "pick_direction" }');
    expect(prompt).toContain('{ "label": "I have a brand spec — I\'ll share it", "value": "brand_spec" }');
    expect(prompt).toContain('{ "label": "Match a reference site / screenshot — I\'ll attach it", "value": "reference_match" }');
    expect(prompt).toContain('When the answer line includes `[value: ...]`, use that stable value instead of the visible label.');
    expect(prompt).toContain('If you keep the `brand` question, its `id` must stay `"brand"`.');
    expect(prompt).toContain('you may drop the `brand` question as already answered, but you must still treat that provided source as Branch A below');
    expect(prompt).toContain('When skipping the form, do not skip brand-source handling');
    expect(prompt).toContain('If the current message, attachments, prior brief, or URL already contains an actual brand spec / brand guide / reference site / screenshot source, use Branch A.');
    expect(prompt).toContain('### Branch A — user provided a brand/reference source, or `brand` value is `"brand_spec"` / `"reference_match"`');
    expect(prompt).toContain('ask them to paste/upload the brand spec or reference and stop');
    expect(prompt).toContain('Do not guess a brand domain or invent tokens');
    expect(prompt).toContain('An active design system does not suppress Branch A when the user provides a brand/reference source');
    expect(prompt).toContain('### Branch B — no user-provided brand/reference source and no Branch A brand value');
    expect(prompt).toContain('active-design-system cases where the user did not provide a new brand/reference source');
    expect(prompt).toContain('Provided brand/reference source → run brand-spec extraction');
    expect(prompt).toContain('`brand_spec` / `reference_match` without a provided source → ask for the source and stop; do not guess brand tokens.');
  });

  it('injects a personally supplied skill body', () => {
    const prompt = composeSystemPrompt({ skillName: 'personal-workflow', skillMode: 'prototype', skillBody: 'Use the saved customer workflow.', metadata: { kind: 'prototype' } });
    expect(prompt).toContain('## Active skill — personal-workflow');
    expect(prompt).toContain('Use the saved customer workflow.');
  });

  it('keeps side-file preflight and render handoff for an imported HyperFrames skill', () => {
    const prompt = composeSystemPrompt({
      skillName: 'hyperframes',
      skillMode: 'video',
      skillBody: 'Read `references/html-in-canvas.md` before authoring.',
      metadata: { kind: 'video', videoModel: 'hyperframes-html' },
    });
    expect(prompt).toContain('**Pre-flight (do this before any other tool):**');
    expect(prompt).toContain('`references/html-in-canvas.md`');
    expect(prompt).toContain('media generate --surface video --model hyperframes-html --composition-dir <rel>');
    expect(prompt).toContain('Do not run `npx hyperframes render` yourself');
  });

  it('does not add the responsive web contract to deck metadata without platform fields', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'deck',
        speakerNotes: true,
        slideCount: '10-15 pages',
      } as any,
    });

    expect(prompt).toContain('- **kind**: deck');
    expect(prompt).toContain('- **slideCount**: 10-15 pages');
    expect(prompt).not.toContain('**responsive web contract**');
    expect(prompt).not.toContain('**platformTargets**');
  });

  it('tells artifact generation to summarize instead of dumping raw HTML source into chat', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('Do not dump the full raw HTML source back into chat');
    expect(prompt).toContain('the assistant message should only summarize the result');
  });

  it('uses the primary skill surface when composed skill modes conflict', () => {
    const prompt = composeSystemPrompt({
      skillMode: 'image',
      skillModes: ['deck', 'image'],
    });

    expect(prompt).toContain('## Media generation contract');
    expect(prompt).not.toContain('# Slide deck — fixed framework');
  });

  it('treats a narrow image media policy as authoritative when project metadata is missing', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype' } as any,
      mediaExecution: { mode: 'enabled', allowedSurfaces: ['image'] },
    });

    expect(prompt).toContain('## Media generation contract');
    expect(prompt).toContain('## Image-only deliverable boundary');
    expect(prompt).toMatch(/Produce exactly one\s+generated image file/);
    expect(prompt).not.toContain('## Prototype HTML pipeline for Build in Bricks');
  });

  it('pins the image-only boundary after shared skill/plugin guidance', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'image' } as any,
      pluginBlock: 'shared plugin guidance: emit `<artifact>` HTML preview',
      activeStageBlocks: ['stage guidance: create index.html'],
    });

    expect(prompt.indexOf('Image-only deliverable boundary')).toBeGreaterThan(
      prompt.indexOf('stage guidance: create index.html'),
    );
    expect(prompt).toMatch(/Do not create\s+or modify `index\.html`/);
  });

  it('lets metadata.kind win over conflicting composed skill modes', () => {
    const prompt = composeSystemPrompt({
      skillMode: 'image',
      skillModes: ['deck', 'image'],
      metadata: { kind: 'deck' } as any,
    });

    expect(prompt).toContain('# Slide deck — fixed framework');
    expect(prompt).not.toContain('## Media generation contract');
  });

  it('resolves a non-media primary surface ahead of composed media mentions', () => {
    expect(resolveExclusiveSurface({
      skillMode: 'deck',
      skillModes: ['deck', 'image'],
    })).toBe('deck');
  });

  describe('artifact handoff no-emit clauses (#1143)', () => {
    it('drops the absolute "non-negotiable" framing in favor of conditional language', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('non-negotiable output rule');
    });

    it('includes the "When NOT to emit <artifact>" sub-section', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('When NOT to emit `<artifact>`');
    });

    it('forbids wrapping in-place-edit-only turns in an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/in-place|Edit-only|already-existing/i);
      expect(prompt).toMatch(/do not (emit|wrap|send) (a |an )?`?<artifact/i);
    });

    it('forbids putting prose / summaries / paths inside an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/complete `?<!doctype html>`?/i);
      expect(prompt).toMatch(/summar(y|ies)|prose|file path/i);
    });

    it('does not carry unconditional "Emit single <artifact>" / "emit a single <artifact>" lines anywhere in the composed prompt', () => {
      const prompt = composeSystemPrompt({});
      // Discovery layer used to carry hard-rule unconditional emit instructions
      // (plan template step 9, default arc Turn 3+ recap, deck workflow step 7).
      // Those must be conditional now — otherwise the no-emit exception in the
      // base prompt is overridden by the higher-priority discovery layer.
      expect(prompt).not.toMatch(/^- 9\.\s+Emit single <artifact>\s*$/m);
      expect(prompt).not.toMatch(/emit a single `?<artifact>`?\.\s*$/m);
      expect(prompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
    });

    it('declares artifact-emission conditionality at the dominant discovery layer', () => {
      const prompt = composeSystemPrompt({});
      // The base prompt's "When NOT to emit" section is at lower precedence than
      // DISCOVERY_AND_PHILOSOPHY, so the exception itself must be stated once at
      // the dominant layer (near RULE 3) — not only back-pointed.
      expect(prompt).toMatch(/only when this turn wrote a new canonical HTML/i);
      expect(prompt).toMatch(/only edited an existing HTML file/i);
    });

    it('also keeps deck-mode prompts free of the unconditional emit line (DECK_FRAMEWORK_DIRECTIVE only stacks for deck projects)', () => {
      // The plain composeSystemPrompt({}) call does NOT include
      // DECK_FRAMEWORK_DIRECTIVE; that directive only stacks when
      // `skillMode === 'deck'` or `metadata.kind === 'deck'`. So if
      // deck-framework.ts:327 ever regresses back to "Emit single <artifact>",
      // a no-args negative assertion is a false negative — exercise the deck
      // path explicitly here.
      const deckPrompt = composeSystemPrompt({ skillMode: 'deck' });
      expect(deckPrompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
      expect(deckPrompt).toMatch(/Emit single <artifact> if a new canonical deck HTML/i);
    });
  });

  describe('connectedExternalMcp directive', () => {
    it('omits the directive when no servers are passed', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('External MCP servers — already authenticated');
      expect(prompt).not.toContain('mcp__<server>__authenticate');
    });

    it('omits the directive when an empty array is passed', () => {
      const prompt = composeSystemPrompt({ connectedExternalMcp: [] });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('lists each connected server and forbids the synthetic auth tools', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: 'higgsfield-openclaw', label: 'Higgsfield (OpenClaw)' },
          { id: 'github' },
        ],
      });

      expect(prompt).toContain('## External MCP servers — already authenticated');
      expect(prompt).toContain('`higgsfield-openclaw`');
      expect(prompt).toContain('Higgsfield (OpenClaw)');
      expect(prompt).toContain('`github`');
      expect(prompt).toContain(
        '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication`',
      );
      expect(prompt).toContain('localhost:<random>/callback');
      expect(prompt).toContain('Settings → External MCP');
    });

    it('skips entries with blank ids and emits no directive when nothing usable remains', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: '   ', label: 'blank' },
          { id: '', label: 'empty' },
        ] as any,
      });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('does not duplicate the label when it equals the id', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [{ id: 'github', label: 'github' }],
      });
      expect(prompt).toContain('- `github`\n');
      expect(prompt).not.toContain('- `github` (github)');
    });

    it('keeps external MCP tools visible when OD-owned media execution is disabled', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [{ id: 'external-media', label: 'External media' }],
        metadata: { kind: 'image' },
        mediaExecution: { mode: 'disabled' },
      });

      expect(prompt).toContain('## External MCP servers — already authenticated');
      expect(prompt).toContain('`external-media`');
      expect(prompt).toContain('Pixflow Design-owned media execution is **disabled for this run**');
      expect(prompt).not.toContain('## Media generation contract');
    });
  });

  // The daemon experiment for compiling a brand's design system from prose
  // (DESIGN.md) into a machine-readable contract (tokens.css) plus a worked
  // fixture (components.html) lives in PR-C. The composer exposes two new
  // optional inputs (`designSystemTokensCss`, `designSystemFixtureHtml`)
  // that the daemon populates by default for every brand that ships
  // those files (PR-D flipped the env gate to default-on, with
  // `OD_DESIGN_TOKEN_CHANNEL=0` as the kill switch). These tests pin
  // the injection shape so the prompt structure cannot drift silently.
  describe('design-system token + fixture injection (#PR-C)', () => {
    const sampleTokensCss = ':root {\n  --bg: #ffffff;\n  --fg: #111111;\n  --accent: #0050d8;\n}';
    const sampleFixtureHtml = '<!doctype html>\n<html lang="en">\n  <body><button class="btn btn-primary">Subscribe</button></body>\n</html>';
    const sampleComponentsManifest =
      'components.manifest schema v1 for default\nAvailable component groups:\n- Buttons and calls to action: selectors .btn, .btn-primary; tokens --accent';

    it('appends BOTH a tokens block and a fixture block when both inputs are present', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\n> Category: Utility\n\nProse description.',
        designSystemTokensCss: sampleTokensCss,
        designSystemFixtureHtml: sampleFixtureHtml,
      });

      expect(prompt).toContain('## Active design system tokens — default');
      expect(prompt).toContain('Paste the unscoped `:root { ... }` block verbatim');
      expect(prompt).toContain('--accent: #0050d8;');

      expect(prompt).toContain('## Reference fixture — default');
      expect(prompt).toContain('Match its component shapes');
      expect(prompt).toContain('class="btn btn-primary"');
    });

    it('places USAGE.md before DESIGN.md so it acts as the package router', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: 'PROSE_BODY_MARKER',
        designSystemUsageMd: 'Read Order: inspect the manifest cache before source evidence.',
      });

      const usageAt = prompt.indexOf('## How to use this design system — default');
      const proseAt = prompt.indexOf('## Active design system — default');
      expect(usageAt).toBeGreaterThan(0);
      expect(proseAt).toBeGreaterThan(usageAt);
      expect(prompt).toContain('Read Order: inspect the manifest cache before source evidence.');
    });

    it('injects a small default usage router for legacy brands with no USAGE.md', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'legacy',
        designSystemBody: '# Legacy\n\nProse description.',
      });

      expect(prompt).toContain('## How to use this design system — legacy');
      expect(prompt).toContain('Read DESIGN.md for visual principles');
      expect(prompt).toContain('do not assume those files have already been loaded');
    });

    it('prefers the component manifest over the full fixture when both are present', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\n> Category: Utility\n\nProse description.',
        designSystemTokensCss: sampleTokensCss,
        designSystemComponentsManifest: sampleComponentsManifest,
        designSystemFixtureHtml: sampleFixtureHtml,
      });

      expect(prompt).toContain('## Reference component manifest — default');
      expect(prompt).toContain('components.manifest schema v1 for default');
      expect(prompt).toContain('Buttons and calls to action');
      expect(prompt).not.toContain('## Reference fixture — default');
      expect(prompt).not.toContain('class="btn btn-primary"');
    });

    it('keeps the prompt byte-equivalent to the legacy path when both inputs are omitted', () => {
      const baseline = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\nProse only.',
      });
      const withFlagOffEquivalent = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\nProse only.',
        designSystemTokensCss: undefined,
        designSystemComponentsManifest: undefined,
        designSystemFixtureHtml: undefined,
      });

      expect(withFlagOffEquivalent).toBe(baseline);
      expect(withFlagOffEquivalent).not.toContain('## Active design system tokens');
      expect(withFlagOffEquivalent).not.toContain('## Reference component manifest');
      expect(withFlagOffEquivalent).not.toContain('## Reference fixture');
    });

    it('gates the tokens and fixture blocks independently — either may be absent', () => {
      const tokensOnly = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemTokensCss: sampleTokensCss,
      });
      expect(tokensOnly).toContain('## Active design system tokens — default');
      expect(tokensOnly).not.toContain('## Reference fixture');

      const fixtureOnly = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemFixtureHtml: sampleFixtureHtml,
      });
      expect(fixtureOnly).not.toContain('## Active design system tokens');
      expect(fixtureOnly).toContain('## Reference fixture — default');

      const manifestOnly = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemComponentsManifest: sampleComponentsManifest,
      });
      expect(manifestOnly).not.toContain('## Active design system tokens');
      expect(manifestOnly).toContain('## Reference component manifest — default');
    });

    it('adds the pull-layer index without loading pull-layer file contents', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemPullIndex:
          'Additional design-system files declared by manifest.json:\n- preview/colors.html: Colors; colors\n- source/evidence.md: import evidence notes',
      });

      expect(prompt).toContain('## Pull-layer files available on demand — default');
      expect(prompt).toContain('preview/colors.html: Colors; colors');
      expect(prompt).toContain('source/evidence.md: import evidence notes');
      expect(prompt).toContain('Keep the push prompt light');
    });

    it('adds importMode guidance when the manifest declares consumption semantics', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'source-heavy',
        designSystemBody: '# x\n\nbody',
        designSystemImportMode: 'verbatim',
      });

      expect(prompt).toContain('## Design system import mode — source-heavy');
      expect(prompt).toContain('Preserve source semantics and source naming');
      expect(prompt).toContain('pull-layer source evidence or snippets');
    });

    it('places the tokens + component manifest blocks AFTER the DESIGN.md prose block (prose sets voice, structured form binds names)', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: 'PROSE_BODY_MARKER',
        designSystemTokensCss: sampleTokensCss,
        designSystemComponentsManifest: sampleComponentsManifest,
        designSystemFixtureHtml: sampleFixtureHtml,
      });
      const proseAt = prompt.indexOf('PROSE_BODY_MARKER');
      const tokensAt = prompt.indexOf('## Active design system tokens');
      const fixtureAt = prompt.indexOf('## Reference component manifest');
      expect(proseAt).toBeGreaterThan(0);
      expect(tokensAt).toBeGreaterThan(proseAt);
      expect(fixtureAt).toBeGreaterThan(tokensAt);
    });

    it('treats whitespace-only inputs as absent (defensive, matches DESIGN.md block behavior)', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemTokensCss: '   \n  \t  ',
        designSystemComponentsManifest: '\n\t',
        designSystemFixtureHtml: '\n\n',
      });
      expect(prompt).not.toContain('## Active design system tokens');
      expect(prompt).not.toContain('## Reference component manifest');
      expect(prompt).not.toContain('## Reference fixture');
    });
  });
});
