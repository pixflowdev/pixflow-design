// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';
const wordpress = vi.hoisted(() => ({ active:false }));
vi.mock('../../src/pixflow/wordpress-context', () => ({hasPixflowWordPressContext:()=>wordpress.active}));

vi.mock('../../src/components/VoiceOrb', () => ({ VoiceOrb: () => <span data-testid="voice-orb" /> }));
afterEach(() => { cleanup(); wordpress.active=false; });

describe('voice message identity', () => {
  it.each([{events:[]},{events:[
    {kind:'assistant_message_boundary' as const,phase:'started' as const,messageId:'native-reply',contentOffset:0},
    {kind:'assistant_message_boundary' as const,phase:'completed' as const,messageId:'native-reply',contentOffset:50},
  ]}])('renders the complete saved reply when transport metadata has no text events',({events})=>{
    const content='First saved paragraph.\n\nSecond saved paragraph.';
    const view=render(<AssistantMessage projectId="saved" message={{id:'restored',role:'assistant',agentId:'codex',content,runStatus:'succeeded',endedAt:1000,events}} streaming={false} />);
    expect(screen.getByText('First saved paragraph.').tagName).toBe('P');
    expect(screen.getByText('Second saved paragraph.').tagName).toBe('P');
    expect(view.container.querySelectorAll('.prose-block')).toHaveLength(1);
  });
  it('keeps existing interleaved text events without appending the full reply again',()=>{
    const view=render(<AssistantMessage projectId="saved" message={{id:'streamed',role:'assistant',content:'Saved reply.',events:[{kind:'text',text:'Saved reply.'}],runStatus:'succeeded',endedAt:1000}} streaming={false} />);
    expect(screen.getAllByText('Saved reply.')).toHaveLength(1);
    expect(view.container.querySelectorAll('.prose-block')).toHaveLength(1);
  });
  it('omits feedback buttons and reasons in Pixflow while retaining copy and fork controls',()=>{
    wordpress.active=true;
    const view=render(<AssistantMessage projectId="p1" message={{id:'complete',role:'assistant',content:'Saved reply.',runStatus:'succeeded',startedAt:1,endedAt:1000}} streaming={false} onFeedback={vi.fn()} onForkFromMessage={vi.fn()} />);
    expect(view.container.querySelector('.assistant-feedback-button')).toBeNull();
    expect(view.container.querySelector('.assistant-feedback-reasons')).toBeNull();
    expect(screen.getByRole('button',{name:'Copy response markdown'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Fork from here'})).toBeTruthy();
  });
  it('keeps a steered run Working through tool/thinking activity without a new Preparing state', () => {
    render(<AssistantMessage projectId="p1" message={{ id: 'run', role: 'assistant', content: '', runStatus: 'running', events: [
      { kind: 'steering_message', id: 'accepted', text: 'Use blue', contentOffset: 12, createdAt: 1 },
      { kind: 'thinking', text: 'Considering the change' },
    ] }} streaming />);
    expect(screen.queryByText(/Preparing/)).toBeNull();
    expect(screen.getByText('Working')).toBeTruthy();
  });
  it('retains the saved Codex identity and separate paragraphs on forked replies', () => {
    const view = render(<AssistantMessage projectId="fork" message={{ id: 'copied', role: 'assistant', agentId: 'codex', agentName: 'Codex', content: 'First saved paragraph.\n\nSecond saved paragraph.', events: [{ kind: 'text', text: 'First saved paragraph.\n\nSecond saved paragraph.' }], historyOrigin: { projectId: 'original', conversationId: 'source', messageId: 'reply' } }} streaming={false} />);
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('First saved paragraph.').tagName).toBe('P');
    expect(screen.getByText('Second saved paragraph.').tagName).toBe('P');
    expect(view.container.querySelector('.role')?.textContent).toContain('Codex');
    expect(view.container.querySelector('.role img')?.getAttribute('src')).toContain('codex.svg');
  });
  it.each([
    { events: [{ kind: 'status', code: 'voice_connection', label: 'connected' }] },
    { agentName: 'Codex Voice' },
  ] as Partial<ChatMessage>[])('uses the orb and voice name for live and restored rows', fields => {
    render(<AssistantMessage projectId="p1" message={{ id: 'voice', role: 'assistant', content: 'Hello', ...fields }} streaming={false} onFeedback={vi.fn()} />);
    expect(screen.getByText('Codex Voice')).toBeTruthy();
    expect(screen.getByTestId('voice-orb')).toBeTruthy();
  });

  it('does not change typed replies', () => {
    render(<AssistantMessage projectId="p1" message={{ id: 'typed', role: 'assistant', content: 'Hello' }} streaming={false} onFeedback={vi.fn()} />);
    expect(screen.queryByText('Codex Voice')).toBeNull();
    expect(screen.queryByTestId('voice-orb')).toBeNull();
  });
});
