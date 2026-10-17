export function reportSafetyEvent(
  _eventName: string,
  _properties: Record<string, unknown> = {},
): void {
  // Pixflow Design does not send observability or analytics from user sites.
}
