// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NextStepActions } from '../../src/components/NextStepActions';
import { I18nProvider } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import type { Locale } from '../../src/i18n/types';
import type { SkillSummary } from '../../src/types';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

const AUTO_MATCH_TITLE = en['chat.designToolbox.action.auto-match.title'];
const VISUAL_POLISH_TITLE = en['chat.designToolbox.action.visual-polish.title'];
const HANDOFF_TO_BRICKS_TITLE = 'Handoff to Bricks';
// The five non-featured actions surfaced inside the More → Design toolbox submenu.
const MOTION_TITLE = en['chat.designToolbox.action.motion.title'];
const MOTION_POLISH_TITLE = en['chat.designToolbox.action.motion-polish.title'];
const ANTI_AI_TITLE = en['chat.designToolbox.action.anti-ai-polish.title'];
const IMAGE_GEN_TITLE = en['chat.designToolbox.action.image-gen.title'];
const VIDEO_GEN_TITLE = en['chat.designToolbox.action.video-gen.title'];

function skill(id: string, name: string, category = 'creative-direction'): SkillSummary {
  return {
    id,
    name,
    description: `${name} skill`,
    triggers: [],
    mode: 'prototype',
    surface: 'web',
    category,
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: '',
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
  } as SkillSummary;
}

function renderActions(
  overrides: Partial<Parameters<typeof NextStepActions>[0]> = {},
  locale?: Locale,
) {
  const handlers = {
    onShare: vi.fn(),
    onDownload: vi.fn(),
    onToolboxAction: vi.fn(),
    onPickSkill: vi.fn(),
  };
  const ui = (
    <NextStepActions
      fileName="landing.html"
      onShare={handlers.onShare}
      onDownload={handlers.onDownload}
      onToolboxAction={handlers.onToolboxAction}
      onPickSkill={handlers.onPickSkill}
      skills={[
        skill('creative-director', 'Creative Director'),
        skill('emilkowalski-motion', 'Emil Kowalski Motion', 'animation-motion'),
        skill('imagegen-frontend-web', 'Imagegen Frontend Web', 'image-generation'),
      ]}
      toolboxSkillNames={{ 'auto-match': 'creative-director', 'visual-polish': 'impeccable-design-polish' }}
      {...overrides}
    />
  );
  const workspaceBody = document.createElement('div');
  workspaceBody.className = 'workspace-shell__body';
  document.body.appendChild(workspaceBody);
  render(locale ? <I18nProvider initial={locale}>{ui}</I18nProvider> : ui, {
    container: workspaceBody,
    baseElement: document.body,
  });
  return handlers;
}

function expectInWorkspaceOverlay(element: HTMLElement) {
  const workspaceBody = document.querySelector('.workspace-shell__body');
  expect(workspaceBody).toBeTruthy();
  expect(workspaceBody?.contains(element)).toBe(true);
  expect(element.parentElement).not.toBe(document.body);
}

describe('NextStepActions', () => {
  it('renders the featured rows and More', () => {
    renderActions();
    expect(screen.getByText(AUTO_MATCH_TITLE)).toBeTruthy();
    expect(screen.getByText(VISUAL_POLISH_TITLE)).toBeTruthy();
    expect(screen.queryByText(HANDOFF_TO_BRICKS_TITLE)).toBeNull();
    expect(screen.getByTestId('next-step-toolbox-more')).toBeTruthy();
  });

  it('supports a third custom action and an inline More accordion for narrow embedded panels', () => {
    const runStageB = vi.fn();
    renderActions({
      morePresentation: 'accordion',
      extraFeaturedActions: [{
        id: 'optional-stage-b',
        label: 'Clean up and refine the build',
        icon: 'blocks',
        onClick: runStageB,
      }],
    });

    const actions = within(screen.getByTestId('next-step-toolbox')).getAllByRole('button');
    expect(actions.slice(0, 3).map((button) => button.textContent)).toEqual([
      expect.stringContaining(AUTO_MATCH_TITLE),
      expect.stringContaining(VISUAL_POLISH_TITLE),
      expect.stringContaining('Clean up and refine the build'),
    ]);

    fireEvent.click(screen.getByTestId('next-step-custom-action-optional-stage-b'));
    expect(runStageB).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('next-step-toolbox-more'));
    expect(screen.getByTestId('next-step-more-accordion')).toBeTruthy();
    expect(screen.queryByTestId('next-step-more-menu')).toBeNull();
  });

  it('renders a workflow-specific action without unrelated toolbox or share actions', () => {
    const runCleanup = vi.fn();
    renderActions({
      fileName: null,
      onShare: undefined,
      onDownload: undefined,
      onToolboxAction: undefined,
      onPickSkill: undefined,
      extraFeaturedActions: [{
        id: 'optional-stage-b',
        label: 'Clean up and refine the build',
        icon: 'blocks',
        onClick: runCleanup,
      }],
    });

    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.getByTestId('next-step-custom-action-optional-stage-b')).toBeTruthy();
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
    expect(screen.queryByText(AUTO_MATCH_TITLE)).toBeNull();

    fireEvent.click(screen.getByTestId('next-step-custom-action-optional-stage-b'));
    expect(runCleanup).toHaveBeenCalledTimes(1);
  });

  it('does not expose the retired Bricks handoff for HTML artifacts', () => {
    renderActions({ fileName: 'landing.html' });
    expect(screen.queryByText(HANDOFF_TO_BRICKS_TITLE)).toBeNull();
  });

  it('hides the Pixflow Bricks handoff for media-only artifacts', () => {
    renderActions({ fileName: 'hero-image.png' });
    expect(screen.getByText(AUTO_MATCH_TITLE)).toBeTruthy();
    expect(screen.getByText(VISUAL_POLISH_TITLE)).toBeTruthy();
    expect(screen.queryByText(HANDOFF_TO_BRICKS_TITLE)).toBeNull();
  });

  it('seeds the composer with the action id (no auto-send) when a featured row is clicked', () => {
    const h = renderActions();
    fireEvent.click(screen.getByTestId('next-step-toolbox-action-visual-polish'));
    expect(h.onToolboxAction).toHaveBeenCalledWith('visual-polish');
  });

  it('reveals the matched @skill in the featured-row hover detail', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-action-auto-match'));
    expect(screen.getByText('@creative-director')).toBeTruthy();
  });

  it('opens the More menu with Design toolbox + Share on hover', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    const menu = screen.getByTestId('next-step-more-menu');
    expect(menu).toBeTruthy();
    expectInWorkspaceOverlay(menu);
    expect(screen.getByTestId('next-step-more-toolbox')).toBeTruthy();
    expect(screen.getByTestId('next-step-more-share')).toBeTruthy();
  });

  it('cascades into searchable non-featured toolbox actions and global resources', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');
    expectInWorkspaceOverlay(list);

    for (const title of [
      MOTION_TITLE,
      MOTION_POLISH_TITLE,
      ANTI_AI_TITLE,
      IMAGE_GEN_TITLE,
      VIDEO_GEN_TITLE,
    ]) {
      expect(within(list).getByText(title)).toBeTruthy();
    }

    // The featured actions are not duplicated inside the submenu.
    expect(within(list).queryByText(AUTO_MATCH_TITLE)).toBeNull();
    expect(within(list).queryByText(VISUAL_POLISH_TITLE)).toBeNull();
    expect(within(list).queryByText(HANDOFF_TO_BRICKS_TITLE)).toBeNull();
    expect(within(list).getByRole('textbox')).toBeTruthy();
    expect(within(list).getByText(en['chat.designToolbox.resourcesSection'])).toBeTruthy();
    expect(within(list).getByText('Creative Director')).toBeTruthy();
    expect(within(list).getByTestId('next-step-toolbox-resource-emilkowalski-motion')).toBeTruthy();
  });

  it('filters actions and global resources from the toolbox search box', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'image' } });

    expect(within(list).getByText(IMAGE_GEN_TITLE)).toBeTruthy();
    expect(within(list).getByText('Imagegen Frontend Web')).toBeTruthy();
    expect(within(list).queryByText(MOTION_TITLE)).toBeNull();
  });

  it('keeps an action visible when searching by its preferred skill id (parity with the composer matcher)', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    // `emilkowalski-motion` is the preferred skill of the `motion` action.
    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'emilkowalski-motion' } });

    // The skill resource row matches by id...
    expect(within(list).getByTestId('next-step-toolbox-resource-emilkowalski-motion')).toBeTruthy();
    // ...and the action it is the preferred skill for must stay visible too,
    // instead of the action row disappearing while its resource row shows.
    expect(within(list).getByTestId('next-step-toolbox-sub-action-motion')).toBeTruthy();
  });

  it('matches and renders a global resource by its localized text under a non-English locale', () => {
    const localizedSkill = {
      ...skill('creative-director', 'creative-director'),
      displayName: { 'zh-CN': '创意总监' },
      descriptionI18n: { 'zh-CN': 'AI 创意总监，负责整体审美方向' },
    } as SkillSummary;
    renderActions({ skills: [localizedSkill] }, 'zh-CN');
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: '创意总监' } });

    // The localized query matches (parity with the composer's localized index)...
    expect(within(list).getByTestId('next-step-toolbox-resource-creative-director')).toBeTruthy();
    // ...and the row renders the localized name rather than the raw id.
    expect(within(list).getByText('创意总监')).toBeTruthy();
  });

  it('keeps the paired action visible for a localized preferred-skill query (action/resource parity under a non-English locale)', () => {
    const motionSkill = {
      ...skill('emilkowalski-motion', 'emilkowalski-motion', 'animation-motion'),
      displayName: { 'zh-CN': '动效大师' },
    } as SkillSummary;
    renderActions({ skills: [motionSkill] }, 'zh-CN');
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: '动效大师' } });

    // The resource row matches the localized name...
    expect(within(list).getByTestId('next-step-toolbox-resource-emilkowalski-motion')).toBeTruthy();
    // ...and the action it is the preferred skill for must stay visible, instead
    // of the action matcher ignoring the localized skill text and hiding it.
    expect(within(list).getByTestId('next-step-toolbox-sub-action-motion')).toBeTruthy();
  });

  it('seeds the composer with a non-featured action id when picked from the submenu', () => {
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    fireEvent.click(screen.getByTestId('next-step-toolbox-sub-action-motion'));
    expect(h.onToolboxAction).toHaveBeenCalledWith('motion');
  });

  it('seeds the composer with a global resource skill when picked from the submenu', () => {
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    fireEvent.click(screen.getByTestId('next-step-toolbox-resource-emilkowalski-motion'));
    expect(h.onPickSkill).toHaveBeenCalledWith('emilkowalski-motion');
  });

  it('cascades into Share / Download and omits retired contribution', () => {
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    const shareMenu = screen.getByTestId('next-step-share-menu');
    expect(shareMenu).toBeTruthy();
    expectInWorkspaceOverlay(shareMenu);

    fireEvent.click(screen.getByTestId('next-step-share-share'));
    expect(h.onShare).toHaveBeenCalledWith('landing.html');

    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-download'));
    expect(h.onDownload).toHaveBeenCalledWith('landing.html');

    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    expect(screen.queryByTestId('next-step-share-contribute')).toBeNull();
  });

  it('hides the toolbox rows when no toolbox handler is wired', () => {
    renderActions({ onToolboxAction: undefined });
    expect(screen.queryByTestId('next-step-toolbox-action-auto-match')).toBeNull();
  });
});
