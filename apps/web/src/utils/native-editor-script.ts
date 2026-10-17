/** A single expression must settle before the editor acknowledges the command.
 * Compile only to distinguish expressions from statement bodies; never evaluate
 * a probe. This makes an async IIFE's rejection reach the ordinary tool result.
 */
export function nativeEditorScriptBody(source: string): string {
  const expression = source.trim().replace(/;\s*$/, '');
  try { new Function(`return (${expression}\n);`); }
  catch { return source; }
  return `const __pixflowNativeResult = await (${expression}\n);
    if (typeof __pixflowNativeResult === 'function') throw new Error('The editor run expects a JavaScript function body, not an uncalled function. Send statements directly, with no outer function or arrow wrapper.');
    return __pixflowNativeResult;`;
}
