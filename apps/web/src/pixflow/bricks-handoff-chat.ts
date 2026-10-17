import {
  isBuildInBricksHtmlFirstPayload,
  type PixflowBricksAgentMessage,
  type PixflowBricksAgentSessionPayload,
} from './bricks-agent-session';

type HandoffChatStage = 'preparing' | 'ready' | 'failed';

type HandoffChatOptions = {
  id: string;
  payload: PixflowBricksAgentSessionPayload;
  stage: HandoffChatStage;
  createdAt?: number;
  message?: string;
  events?: unknown[];
  mode?: 'baseline' | 'stage_b';
};

// Pixflow-owned: Handoff preparation is not a normal generation run, but the
// builder panel must still receive canonical AgentEvent rows so it renders with
// the same stream, TODO, and operation-card mechanics as the main workspace.
export function buildPixflowBricksHandoffChatMessage({
  id,
  payload,
  stage,
  createdAt = Date.now(),
  message,
  events,
  mode = 'stage_b',
}: HandoffChatOptions): PixflowBricksAgentMessage {
  const ok = stage !== 'failed';
  const finished = stage !== 'preparing';
  const sourceLabel = payload.sourceFile?.name || payload.activeFileName || 'latest generated HTML';
  const targetLabel = payload.targetContext?.postTitle
    ? `${payload.targetContext.postTitle} (#${payload.targetContext.postId || 'new'})`
    : payload.targetContext?.postId
      ? `page #${payload.targetContext.postId}`
      : 'selected Bricks page';
  const applied = payload.initialInsert?.ok !== false && payload.initialInsert?.operation !== 'prepare' && stage === 'ready';
  const buildInBricks = isBuildInBricksHtmlFirstPayload(payload);
  // The default remains legacy Stage B for historical callers, but an
  // ordinary HTML-first Build payload can never inherit that compatibility
  // default. New Build callers normally pass baseline explicitly; this guard
  // also protects older UI call sites and persisted replay paths.
  const effectiveMode = buildInBricks ? 'baseline' : mode;
  const plan = effectiveMode === 'stage_b' ? [{
    step: 'Clean up and refine the verified converter build',
    status: stage === 'ready' ? 'completed' : 'in_progress',
  }] : [
    {
      step: `Read ${sourceLabel}`,
      status: finished ? 'completed' : 'completed',
    },
    {
      step: 'Convert HTML into baseline Bricks JSON',
      status: stage === 'preparing' ? 'in_progress' : ok ? 'completed' : 'completed',
    },
    {
      step: `Insert the baseline into ${targetLabel}`,
      status: stage === 'preparing' ? 'pending' : ok ? 'completed' : 'completed',
    },
  ];
  const text = stage === 'preparing'
    ? effectiveMode === 'baseline'
      ? buildInBricks
        ? `I'll convert the HTML and insert the editable result into ${targetLabel}. Post-conversion QA will remain available as diagnostics.`
        : `I'll convert the HTML and insert the editable baseline into ${targetLabel}. You can then choose whether to clean up and refine the build.`
      : `I'll clean up and refine the verified converter result in ${targetLabel} while the panel streams the model work.`
    : stage === 'ready'
      ? (message || (effectiveMode === 'baseline'
        ? buildInBricks
          ? `The converted result is saved and visible in ${targetLabel}. Build execution is complete; post-conversion QA findings remain available as diagnostics.`
          : `The converter result is saved and visible in ${targetLabel}. You can keep it, undo it, or choose Clean up and refine the build below.`
        : applied
          ? `Cleanup and refinement is complete. The refined Bricks JSON has replaced the converter result in ${targetLabel}.`
          : 'Bricks handoff artifacts are ready.'))
      : (message || 'Bricks handoff preparation failed.');
  const planToolUseId = `${id}:handoff-plan`;
  const planEvents = [
    {
      kind: 'tool_use',
      id: planToolUseId,
      name: 'update_plan',
      input: { plan },
    },
    ...(finished
      ? [{
        kind: 'tool_result',
        toolUseId: planToolUseId,
        content: stage === 'ready'
          ? (applied ? 'Handoff checks completed and the selected Bricks page was updated.' : 'Handoff checks completed.')
          : (message || 'Bricks handoff preparation failed.'),
        isError: stage === 'failed',
      }]
      : []),
  ];
  const runnerEvents = Array.isArray(events) && events.length > 0 ? events : [];
  const visibleEvents = runnerEvents.length > 0
    ? [
      ...runnerEvents,
      ...(finished
        ? [
          ...planEvents,
          { kind: 'text', text },
          { kind: 'usage', inputTokens: 0, outputTokens: 0 },
        ]
        : []),
    ]
    : [
      ...planEvents,
      { kind: 'text', text },
      ...(finished
        ? [{
          kind: 'usage',
          inputTokens: 0,
          outputTokens: 0,
        }]
        : []),
    ];

  return {
    id,
    role: 'assistant',
    agentId: payload.session.runnerId || undefined,
    // Pixflow-owned: leave `content` empty for this synthetic handoff status.
    // The main AssistantMessage renderer uses AgentEvent text blocks for the
    // visible prose; keeping content empty avoids the footer copy button
    // exposing transient "Preparing..." status copy.
    content: '',
    createdAt,
    startedAt: createdAt,
    endedAt: finished ? Date.now() : undefined,
    runStatus: stage === 'failed' ? 'failed' : finished ? 'succeeded' : 'running',
    status: stage === 'failed' ? 'error' : finished ? 'complete' : 'streaming',
    events: visibleEvents,
  };
}
