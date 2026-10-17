export type ComposioCredentialState =
  | 'empty'
  | 'pending-new'
  | 'saved'
  | 'saved-pending';

export function deriveComposioCredentialState(
  composio: { apiKey?: string; apiKeyConfigured?: boolean } | null | undefined,
): ComposioCredentialState {
  const hasPendingEdit = Boolean(composio?.apiKey?.trim());
  const hasSavedKey = Boolean(composio?.apiKeyConfigured);
  if (hasSavedKey && hasPendingEdit) return 'saved-pending';
  if (hasSavedKey) return 'saved';
  if (hasPendingEdit) return 'pending-new';
  return 'empty';
}

