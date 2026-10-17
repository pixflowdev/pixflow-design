/**
 * Mark post-conversion quality findings as delivery diagnostics. Structural
 * safety is enforced separately by the Bricks payload/schema validators.
 */
export function makeStageBQualityFindingsNonBlocking(qa, qualityGate) {
  const failures = Array.isArray(qualityGate?.failures)
    ? qualityGate.failures.map((failure) => String(failure || '').trim()).filter(Boolean)
    : [];
  const readyWithWarnings = qualityGate?.passed !== true;
  return {
    ...qa,
    status: readyWithWarnings ? 'warning' : qa?.status,
    blocking: false,
    qualityGate: {
      ...qualityGate,
      blocking: false,
    },
    delivery: {
      ready: true,
      status: readyWithWarnings ? 'ready_with_warnings' : 'ready',
      warnings: failures,
    },
  };
}

export function stageBQaReportExists(qa) {
  return Boolean(qa && typeof qa === 'object' && !Array.isArray(qa) && Object.keys(qa).length > 0);
}
