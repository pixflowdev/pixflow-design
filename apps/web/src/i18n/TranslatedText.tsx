import { Fragment, type ReactNode } from 'react';
// Use the public import so Pro bundles resolve the host's shared context.
import { useT } from '../i18n';
import type { Dict } from './types';

/** Keep a sentence whole so translators can move links and emphasis with its grammar. */
export function TranslatedText({ id, values }: { id: keyof Dict; values: Record<string, ReactNode> }) {
  const t = useT();
  return <>{t(id).split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{name && Object.hasOwn(values, name) ? values[name] : part}</Fragment>;
  })}</>;
}
