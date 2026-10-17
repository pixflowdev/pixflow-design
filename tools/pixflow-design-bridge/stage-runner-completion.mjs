/**
 * A runner can finish after writing its complete artifact set, either before
 * or after the quiet-file watchdog observes it. A later process/tool failure
 * is not authoritative once those artifacts changed and exist; downstream
 * Stage B validation remains responsible for accepting or rejecting them.
 */
export function hasDurableRunnerArtifactCompletion({
  completedViaFile,
  completionFileExists,
  completionArtifactsUpdated,
}) {
  return completionFileExists === true
    && (completedViaFile === true || completionArtifactsUpdated === true);
}

export function shouldRejectRunnerFailureAfterArtifact(options) {
  return !hasDurableRunnerArtifactCompletion(options);
}
