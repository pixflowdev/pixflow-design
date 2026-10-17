import type { Dict, Locale } from './types';

export const LOCALE_LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Dict>> = {
  'id': () => import('./locales/id').then((module) => module.id),
  'de': () => import('./locales/de').then((module) => module.de),
  'zh-CN': () => import('./locales/zh-CN').then((module) => module.zhCN),
  'zh-TW': () => import('./locales/zh-TW').then((module) => module.zhTW),
  'pt-BR': () => import('./locales/pt-BR').then((module) => module.ptBR),
  'es-ES': () => import('./locales/es-ES').then((module) => module.esES),
  'ru': () => import('./locales/ru').then((module) => module.ru),
  'fa': () => import('./locales/fa').then((module) => module.fa),
  'ar': () => import('./locales/ar').then((module) => module.ar),
  'ja': () => import('./locales/ja').then((module) => module.ja),
  'ko': () => import('./locales/ko').then((module) => module.ko),
  'pl': () => import('./locales/pl').then((module) => module.pl),
  'hu': () => import('./locales/hu').then((module) => module.hu),
  'fr': () => import('./locales/fr').then((module) => module.fr),
  'uk': () => import('./locales/uk').then((module) => module.uk),
  'tr': () => import('./locales/tr').then((module) => module.tr),
  'th': () => import('./locales/th').then((module) => module.th),
  'it': () => import('./locales/it').then((module) => module.it),
};
