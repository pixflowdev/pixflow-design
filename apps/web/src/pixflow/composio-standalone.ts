import type { ComposioContribution } from './composio-contract';

let contribution: ComposioContribution | undefined;
/** The optional standalone Pro entry registers its implementation explicitly. */
export function registerStandaloneComposio(value: ComposioContribution): void { contribution = value; }
export function standaloneComposio() { return contribution; }
