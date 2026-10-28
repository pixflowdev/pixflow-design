/** A run receipt owns one reply, not the transcript or its saved revisions.
 * Hydrate durable history first; use the receipt only if that reply is absent.
 */
export function recoverDirectRunMessages<T extends { id?: string }>(current: T[], snapshot: T[], messageId: string): T[] {
  if (current.some(message => message.id === messageId)) return current;
  const reply = snapshot.find(message => message.id === messageId);
  return reply ? [...current, reply] : current;
}
