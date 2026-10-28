import type { Dict } from '../i18n/types';

/** Labels only: operation availability and execution remain Pro-owned. */
export const designCommandDescriptions: Readonly<Record<string, keyof Dict>> = {
  audit: 'designCommand.audit',
  critique: 'designCommand.critique',
  polish: 'designCommand.polish',
  typeset: 'designCommand.typeset',
  layout: 'designCommand.layout',
  colorize: 'designCommand.colorize',
  clarify: 'designCommand.clarify',
  harden: 'designCommand.harden',
  adapt: 'designCommand.adapt',
  optimize: 'designCommand.optimize',
};
