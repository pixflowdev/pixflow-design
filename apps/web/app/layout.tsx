import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ACCENT_PRESETS, solidAccentColor, chatBubbleAccentColor } from '../src/state/appearance';
import { I18nProvider } from '../src/i18n';
import '../src/index.css';
import '../src/styles/home/index.css';

export const metadata: Metadata = {
  title: 'Pixflow Design',
  icons: {
    icon: '/app-icon.svg',
    apple: '/app-icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#F4EFE6',
};

/**
 * Inline script that runs before React hydrates to apply the saved theme
 * preference without a flash of unstyled content. It reads the same
 * localStorage key used by `state/config.ts` and sets `data-theme` on
 * `<html>` immediately — before any CSS or React paint.
 * Keep the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; the preset table is serialized so both paths use the same colour variants.
 */
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme==='light'||c.theme==='dark'||c.theme==='system'?c.theme:'dark';if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#146ef5';if(a==='#c96442'||a==='#d97a56'||a==='#f97316')a='#146ef5';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var p=${JSON.stringify(ACCENT_PRESETS)}.find(function(p){return p.value===a});if(p)a=d?p.dark:p.light;var l=[1,3,5].map(function(i){var n=parseInt(a.slice(i,i+2),16)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});var s=document.documentElement.style;s.setProperty('--accent-contrast',l[0]*.2126+l[1]*.7152+l[2]*.0722>.179?'#000000':'#ffffff');s.setProperty('--accent',a);var solid=(${solidAccentColor.toString()})(p?p.light:a);s.setProperty('--accent-solid',solid);s.setProperty('--chat-bubble-bg',(${chatBubbleAccentColor.toString()})(solid));s.setProperty('--accent-solid-hover','color-mix(in srgb, '+solid+' 88%, #000)');s.setProperty('--selected',solid);s.setProperty('--selected-soft','color-mix(in srgb, '+a+' 16%, transparent)');s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 86%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 22%, var(--bg-panel))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 12%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 90%, var(--text-strong))');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional theme-init inline script to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
