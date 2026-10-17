import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBuildInBricksContextFiles,
  buildBuildInBricksDesignContext,
  buildBuildInBricksSourcePrompt,
  validateBuildInBricksBoundedRetainedEdit,
  validateBuildInBricksRetainedAestheticRepairScope,
  normalizeBuildInBricksOptionalJavaScript,
} from '../../src/pixflow/build-in-bricks-source';

const repoRoot = resolve(import.meta.dirname, '../../../..');

const routeContext = {
  schemaVersion: 1, postId: 42, activeRouteId: 'core-framework', fallbackUsed: false,
  route: { id: 'core-framework', label: 'Core Framework' },
  breakpoints: [{ key: 'tablet', label: 'Tablet', width: 991, base: false }],
  designContext: { tokens: { all: [{ cssVar: '--primary', value: '#123456', provenance: { origin: 'framework', designContextEligible: true } }] }, activeColorPalettes: [], globalClasses: [], pageSpecificGeneratedTokens: [] },
  sources: { framework: { routeFamily: 'core-framework', utilityClasses: [] }, bricks: { available: true, themeStyleActiveIds: [], themeStyles: [], themeStyleDiagnostics: {} } },
} as never;

describe('Build in Bricks architecture baseline', () => {
  it('stages provenance-filtered Build context under canonical ownership', () => {
    const context = buildBuildInBricksDesignContext(routeContext, null, 'full_page');
    const files = buildBuildInBricksContextFiles({ targetTitle: 'Baseline page', context, attachments: [], commentAttachments: [], workspaceItems: [] });
    expect(files.find((file) => file.path.endsWith('framework-route.json'))?.content).toContain('"operation": "build-source"');
    expect(files.find((file) => file.path.endsWith('framework-route.json'))?.content).toContain('"--primary"');
    expect(files.find((file) => file.path.endsWith('design-system.md'))?.content).toContain('ACTIVE DESIGN SYSTEM (trusted, provenance-filtered)');
  });

  it('provides dynamic site context to the Build-only web-native prompt', () => {
    const context = buildBuildInBricksDesignContext(routeContext, null, 'full_page');
    const prompt = buildBuildInBricksSourcePrompt({ prompt: 'Build a services page.', targetTitle: 'Services', generationScope: 'full_page', context });
    expect(prompt).toContain('semantic HTML');
    expect(prompt).toContain('Do not author Bricks JSON');
    expect(prompt).toContain('Framework route: Core Framework');
    expect(prompt).toContain('--primary');
  });

  it('marks retained source as canonical HTML-native edit input', () => {
    const context = buildBuildInBricksDesignContext(routeContext, null, 'full_page');
    const existingSource = { html: '<main><h1>Existing</h1></main>', css: 'main { display: grid; }', hash: 'sha256:existing' };
    const files = buildBuildInBricksContextFiles({ targetTitle: 'Existing page', context, attachments: [], commentAttachments: [], workspaceItems: [], existingSource });
    expect(files.find((file) => file.path.endsWith('existing-source.md'))?.content).toContain('Verified retained Build source');
    const prompt = buildBuildInBricksSourcePrompt({ prompt: 'Make the hero editorial.', targetTitle: 'Existing page', generationScope: 'full_page', context, existingSource });
    expect(prompt).toContain('retained-source edit');
    expect(prompt).toContain('Preserve unaffected source');
    expect(prompt).toContain('Verified retained Build source (authoritative edit baseline)');
    expect(prompt).toContain('<main><h1>Existing</h1></main>');
    expect(prompt).toContain('main { display: grid; }');
    expect(prompt.indexOf('Verified retained Build source')).toBeLessThan(prompt.indexOf('User request:'));
    expect(prompt.indexOf('EFFECTIVE BRICKS THEME STYLE')).toBeLessThan(prompt.indexOf('User request:'));
  });

  it('makes the accepted-source anchor authoritative for retained placement', () => {
    const context = buildBuildInBricksDesignContext(routeContext, null, 'full_page');
    const prompt = buildBuildInBricksSourcePrompt({
      prompt: 'put a short call to action between these',
      targetTitle: 'Existing page',
      generationScope: 'full_page',
      context,
      existingSource: {
        html: '<main><section id="top"><h1>Heading</h1><p class="hero__lead">Selected copy</p></section><section><p>Similar copy</p></section></main>',
        css: '.hero__lead { color: inherit; }',
        hash: 'sha256:existing',
      },
      pageInventory: {
        builderContext: {
          retainedBuild: {
            selectedSourceAnchor: {
              sourceElement: 'p',
              sourceId: null,
              sourceClasses: ['hero__lead'],
              sourcePath: 'section#top > p.hero__lead',
              currentVisibleText: 'Selected copy',
              parent: { sourceElement: 'section', sourceId: 'top', sourceClasses: [], label: 'Heading Selected copy' },
              previousSibling: { sourceElement: 'h1', sourceId: null, sourceClasses: [], label: 'Heading' },
              nextSibling: null,
            },
          },
        },
      },
    });

    expect(prompt).toContain('Factual selected retained-source anchor');
    expect(prompt).toContain('"sourcePath":"section#top > p.hero__lead"');
    expect(prompt).toContain('Do not substitute a similar source node elsewhere');
    expect(prompt.indexOf('Factual selected retained-source anchor')).toBeLessThan(prompt.indexOf('User request:'));
  });

  it('accepts only the bounded visible-text edit decided by the selected agent', () => {
    const retainedSource = {
      html: '<main><section><h1>A considered studio</h1></section><section><h2>Services</h2><p>Identity systems.</p></section><section><h2>Contact</h2></section></main>',
      css: '.page { display: grid; }',
      js: '',
    };
    expect(validateBuildInBricksBoundedRetainedEdit({
      decision: {
        kind: 'replace_visible_text',
        targetElementId: 'hero-heading',
        currentText: 'A considered studio',
        replacementText: 'Architecture, clearly expressed',
        preserveUnrelated: true,
      },
      retainedSource,
      nextSource: {
        ...retainedSource,
        html: retainedSource.html.replace('A considered studio', 'Architecture, clearly expressed'),
      },
    })).toEqual([]);
  });

  it('accepts a bounded visible-text edit when source formatting splits the selected copy across whitespace', () => {
    const retainedSource = {
      html: `<main>
  <section>
    <p class="hero__lead">
      Built for self-employed teams of one, this app keeps open invoices visible,
      shows what is overdue at a glance, and gives you a calmer rhythm for chasing payment.
    </p>
  </section>
</main>`,
      css: '.hero__lead { max-width: 42rem; }',
      js: '',
    };
    expect(validateBuildInBricksBoundedRetainedEdit({
      decision: {
        kind: 'replace_visible_text',
        targetElementId: 'hero-lead',
        currentText: 'Built for self-employed teams of one, this app keeps open invoices visible, shows what is overdue at a glance, and gives you a calmer rhythm for chasing payment.',
        replacementText: 'Built for solo freelancers, this app keeps invoices visible, shows what is overdue, and makes follow-up calmer.',
        preserveUnrelated: true,
      },
      retainedSource,
      nextSource: {
        ...retainedSource,
        html: `<main>
  <section>
    <p class="hero__lead">
      Built for solo freelancers, this app keeps invoices visible, shows what is overdue, and makes follow-up calmer.
    </p>
  </section>
</main>`,
      },
    })).toEqual([]);
  });

  it('keeps normalized visible-text replacement ambiguous matches fail-closed', () => {
    const retainedSource = {
      html: '<main><p>Same selected copy</p><p>Same\n selected copy</p></main>',
      css: '.page { display: block; }',
      js: '',
    };
    expect(validateBuildInBricksBoundedRetainedEdit({
      decision: {
        kind: 'replace_visible_text',
        targetElementId: 'selected-copy',
        currentText: 'Same selected copy',
        replacementText: 'Updated selected copy',
        preserveUnrelated: true,
      },
      retainedSource,
      nextSource: {
        ...retainedSource,
        html: '<main><p>Updated selected copy</p><p>Same\n selected copy</p></main>',
      },
    })).toEqual([expect.objectContaining({
      code: 'retained_source_scope_violation',
      message: expect.stringContaining('occurs 2 times'),
    })]);
  });

  it('blocks a hosted retained edit that rewrites unrelated HTML or sidecars', () => {
    const retainedSource = {
      html: '<main><section><h1>A considered studio</h1></section><section><h2>Services</h2><p>Identity systems.</p></section><section><h2>Contact</h2></section></main>',
      css: '.page { display: grid; }',
      js: '',
    };
    expect(validateBuildInBricksBoundedRetainedEdit({
      decision: {
        kind: 'replace_visible_text',
        targetElementId: 'hero-heading',
        currentText: 'A considered studio',
        replacementText: 'Architecture, clearly expressed',
        preserveUnrelated: true,
      },
      retainedSource,
      nextSource: {
        html: '<main><section><h1>Architecture, clearly expressed</h1></section><section><h2>A new unrelated page</h2></section></main>',
        css: '/* retained styles remain unchanged */',
        js: '',
      },
    })).toEqual([expect.objectContaining({
      code: 'retained_source_scope_violation',
      severity: 'blocking',
      retainedEditKind: 'literal_text_replacement',
      retainedFrom: 'A considered studio',
      retainedTo: 'Architecture, clearly expressed',
    })]);
  });

  it('blocks an aesthetic repair that introduces styling for an untouched retained element', () => {
    const retainedSource = {
      html: '<main><section class="hero"><a class="hero-link">Join</a></section><section class="workflow">Steps</section></main>',
      css: '.hero-link { color: navy; }\n.workflow { display: grid; }',
      js: '',
    };
    const generatedSource = {
      html: '<main><section class="hero"><a class="hero-link">Join</a></section><section class="workflow">Steps</section><section class="bridge-cta"><a class="bridge-cta__link">Start</a></section></main>',
      css: `${retainedSource.css}\n.bridge-cta { display: flex; }`,
      js: '',
    };

    expect(validateBuildInBricksRetainedAestheticRepairScope({
      retainedSource,
      generatedSource,
      repairedSource: {
        ...generatedSource,
        css: `${generatedSource.css}\n.hero-link { color: purple; border-radius: 999px; }`,
      },
    })).toEqual([expect.objectContaining({
      code: 'retained_source_scope_violation',
      severity: 'blocking',
      selector: '.hero-link',
    })]);
  });

  it('allows an aesthetic repair to refine styling owned by the current retained-source change', () => {
    const retainedSource = {
      html: '<main><section class="hero">Hero</section><section class="workflow">Steps</section></main>',
      css: '.hero { display: grid; }\n.workflow { display: grid; }',
      js: '',
    };
    const generatedSource = {
      html: '<main><section class="hero">Hero</section><section class="workflow">Steps</section><section class="bridge-cta"><a class="bridge-cta__link">Start</a></section></main>',
      css: `${retainedSource.css}\n.bridge-cta { display: flex; }`,
      js: '',
    };

    expect(validateBuildInBricksRetainedAestheticRepairScope({
      retainedSource,
      generatedSource,
      repairedSource: {
        ...generatedSource,
        css: `${retainedSource.css}\n.bridge-cta { display: flex; gap: 1rem; }\n.bridge-cta__link { border-radius: 999px; }`,
      },
    })).toEqual([]);
  });

  it('does not derive an edit operation from natural-language prompt tokens', () => {
    const source = readFileSync(
      resolve(repoRoot, 'apps/web/src/pixflow/build-in-bricks-source-contract.ts'),
      'utf8',
    );
    expect(source).not.toContain('resolveBuildInBricksBoundedRetainedEditContract');
    expect(source).not.toContain('request.matchAll');
    expect(source).not.toContain('preservesEverythingElse');
  });

  it('canonicalizes comment-only optional JavaScript to no authored behavior', () => {
    expect(normalizeBuildInBricksOptionalJavaScript('// No changes required in script.js for this update')).toBe('');
    expect(normalizeBuildInBricksOptionalJavaScript('/* optional behavior is not needed */\n')).toBe('');
    expect(normalizeBuildInBricksOptionalJavaScript('const button = document.querySelector("button");\n// bind only when present\nbutton?.focus();'))
      .toContain('button?.focus()');
  });
});
