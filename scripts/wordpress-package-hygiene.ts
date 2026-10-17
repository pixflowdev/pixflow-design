/** Runtime archives never need development output. Keep guidance/readmes and
 * licence credits: those can be part of the installed agent's runtime input. */
export function isWordPressRuntimePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some(part => [
    '.git', '.github', '.next', '.turbo', '.vite', '.tmp', '.cache',
    'node_modules', 'tests', '__tests__', '__snapshots__',
    'test-results', 'playwright-report',
  ].includes(part))) return false;
  if (parts.some(part => part === '.DS_Store' || part === 'Thumbs.db')) return false;
  if (/\.(?:test|spec)\.[A-Za-z0-9]+$/.test(normalized)) return false;
  if (/\.(?:map|ts|tsx|jsx)$/.test(normalized)) return false;
  if (parts.includes('languages') && /\.(?:mo|po)$/.test(normalized)) return false;
  return true;
}
