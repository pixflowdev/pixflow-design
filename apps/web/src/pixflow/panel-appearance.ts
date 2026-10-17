/** WordPress appearance, including System, owns the embedded panel preference. */
export function resolvePanelTheme(shellTheme: unknown, appTheme: unknown, systemDark: boolean): 'light' | 'dark' {
  const preference = shellTheme === 'light' || shellTheme === 'dark' || shellTheme === 'system'
    ? shellTheme : appTheme;
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference === 'light' ? 'light' : 'dark';
}
