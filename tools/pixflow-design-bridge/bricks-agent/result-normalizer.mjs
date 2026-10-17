function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

export function normalizeBricksAgentEscalationResult(result, requestTargetLabel, runnerResult) {
  const reason = firstString(
    result?.reason,
    result?.message,
    'The request could not be represented as a safe scoped Bricks mutation.',
  );
  return {
    type: 'pixflow_bridge_quick_text_edit_result',
    version: 1,
    status: 'escalate',
    action: 'escalate',
    answer: '',
    targetLabel: firstString(requestTargetLabel, 'selected Bricks element'),
    replacementText: '',
    replacements: [],
    patches: [],
    confidence: firstString(result?.confidence, 'low'),
    reason,
    message: reason,
    runner: runnerResult?.kind || '',
    eventSummary: runnerResult?.eventSummary || null,
  };
}

export function normalizeBricksAgentRouteResult(result, request, runnerResult) {
  const requestedRoute = firstString(result?.route, result?.workflow)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const route = requestedRoute === 'prototype_bricks' || requestedRoute === 'prototype'
    ? 'prototype_bricks'
    : '';
  const requestedScope = firstString(
    result?.generationScope,
    result?.generation_scope,
    result?.scope,
  ).toLowerCase();
  const generationScope = requestedScope === 'section' || requestedScope === 'component'
    ? requestedScope
    : 'full_page';
  const reason = firstString(
    result?.reason,
    result?.message,
    route
      ? 'The model selected the Prototype Bricks workflow.'
      : 'The model selected an unsupported Bricks workflow.',
  );

  if (!route) {
    return {
      type: 'pixflow_bridge_quick_text_edit_result',
      version: 1,
      status: 'failed',
      action: 'route',
      route: '',
      generationScope,
      prompt: firstString(request?.prompt, request?.userPrompt, request?.user_prompt),
      answer: '',
      patches: [],
      confidence: firstString(result?.confidence, 'low'),
      reason,
      message: reason,
      runner: runnerResult?.kind || '',
      eventSummary: runnerResult?.eventSummary || null,
    };
  }

  return {
    type: 'pixflow_bridge_quick_text_edit_result',
    version: 1,
    status: 'routed',
    action: 'route',
    route,
    generationScope,
    prompt: firstString(request?.prompt, request?.userPrompt, request?.user_prompt),
    answer: '',
    patches: [],
    confidence: firstString(result?.confidence, 'medium'),
    reason,
    message: 'Prototype Bricks workflow selected by the agent.',
    runner: runnerResult?.kind || '',
    eventSummary: runnerResult?.eventSummary || null,
  };
}

/**
 * Detect a strong, natural-language request for a new Prototype Bricks
 * deliverable. Existing-page edits may mention a section as context (for
 * example, "add a query to the blog section"), so this deliberately requires
 * the noun after an additive verb to be a new section/component/page rather
 * than treating every occurrence of "section" as a generation request.
 */
