/** Native builders may resolve their save promise even when the HTTP save failed. */
export async function withEditorSaveResult<T>(operation: () => Promise<T>): Promise<T> {
  let conflict = false;
  const failed = () => { conflict = true; };
  window.addEventListener('pixflow-design:editor-save-conflict', failed);
  const conflictError = () => new Error('Saving was blocked because another editor saved a newer version. Keep unsaved work, reload the originating tab, and reconcile the latest content before retrying.');
  try {
    let result: T;
    try { result = await operation(); }
    catch (error) { throw conflict ? conflictError() : error; }
    if (conflict) throw conflictError();
    return result;
  } finally { window.removeEventListener('pixflow-design:editor-save-conflict', failed); }
}
