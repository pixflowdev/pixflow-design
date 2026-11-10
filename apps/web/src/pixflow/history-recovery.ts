import { chatHistoryOwnerScope, historyMessageFingerprint, importChatHistory, readChatHistory, resolveChatHistory, type ChatHistoryBinding, type HistoryMessage } from './chat-history-client';

/** An archived outbox snapshot is evidence, never a live or resumable run.
 * Retain its complete original payload while rendering it as a historical copy.
 */
export function historicalRecoveryCopy(copy: HistoryMessage) {
  return {...copy, status:'complete', runStatus:'interrupted', streaming:false, pending:false,
    resumable:false, historyRecoverySnapshot:copy};
}

/** Copy each divergent snapshot into its own private, idempotent recovery chat.
 * Never overwrite the source or treat a recovered assistant response as a new run.
 * Callers must retain their local copies until every returned payload is verified.
 */
export async function preserveHistoryCopies(source: ChatHistoryBinding, copies: HistoryMessage[], title: string): Promise<void> {
  const owner = chatHistoryOwnerScope();
  const checkOwner = () => { if (owner !== chatHistoryOwnerScope()) throw new Error('The signed-in account changed.'); };
  for (const copy of copies) {
    checkOwner();
    if (!copy.id) throw new Error('A recovery copy has no message identity.');
    const row = copy as HistoryMessage & { runStatus?: string; status?: string };
    if (row.runStatus === 'running' || row.status === 'streaming') throw new Error('Wait for active replies to finish before recovering history.');
    const fingerprint = historyMessageFingerprint(copy);
    const bytes = new TextEncoder().encode(JSON.stringify([owner, source, copy.id, fingerprint]));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    checkOwner();
    const target = await resolveChatHistory({ sessionKey: `history-recovery:${digest}`, title });
    checkOwner();
    const result = await importChatHistory(target, [copy]);
    checkOwner();
    if (!result.messages.some(saved => saved.id === copy.id && historyMessageFingerprint(saved) === fingerprint)) {
      throw new Error('The recovery copy could not be verified. The original remains unchanged.');
    }
    // Read back independently: an import acknowledgement alone must not clear an outbox.
    const saved = await readChatHistory(target);
    checkOwner();
    if (!saved.messages.some(message => message.id === copy.id && historyMessageFingerprint(message) === fingerprint)) {
      throw new Error('The saved recovery copy could not be read back.');
    }
  }
}

