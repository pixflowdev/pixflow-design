/** Compact presentation only; discovery retains the full diagnostic version banner. */
export function cliVersionLabel(version: string | null | undefined): string {
  return version?.match(/(?:^|[^\w.])v?(\d+\.\d+\.\d+)(?=$|[^\d.])/)?.[1] ?? '';
}
