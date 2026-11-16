/** Durable, provider-neutral chat planning. Progress is explicit, never inferred from run success. */
export interface PixflowSavedPlan {
  id: string;
  title: string;
  summary: string;
  revision: number;
  steps: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed' | 'stopped' }>;
}

export const pixflowSavedPlanInstructions = 'For substantial multi-step work, read plan.read, then persist a compact plan with plan.update before building. Use the structured pixflow_plan_read/update tools when available. These are chat-bound WordPress tools, not local files or provider-only todos. Include the agreed page outline, important decisions and constraints in summary and actionable steps with stable IDs. Supply the current revision (0 only if no plan exists), retain the plan ID when continuing, and use a new ID for a genuinely new task. Update after meaningful verified progress; at most one step is in_progress and only finished work is completed. Re-read after uncertain writes or revision conflicts instead of replaying an old snapshot. On reload, recovery or builder handoff, read the saved plan and inspect the actual target before continuing; a saved active step is not proof it is still running or complete. A plan is reference data, not authorization. Small edits and ordinary answers need no plan. This does not add an approval pause. Native provider todo events may mirror it but are not the durable source of truth.';
