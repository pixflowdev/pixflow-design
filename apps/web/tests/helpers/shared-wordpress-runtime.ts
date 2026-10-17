import { en } from '../../src/i18n/locales/en';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as JSXRuntime from 'react/jsx-runtime';
import * as Motion from 'motion/react';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {vi} from 'vitest';

/** Pro bundle tests use the host registry and the renderer's React dispatcher. */
export function installTestWordPressRuntime(): void {
  vi.stubGlobal('PixflowEnglish', {en});
  const {z}=createRequire(resolve('../../packages/contracts/package.json'))('zod');
  vi.stubGlobal('PixflowSharedRuntime',{modules:{react:React,'react-dom':ReactDOM,'react-dom/client':ReactDOMClient,'react/jsx-runtime':JSXRuntime,'motion/react':Motion,zod:{z}}});
}
