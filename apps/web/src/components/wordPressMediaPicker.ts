import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { detectInitialLocale, translateLocale } from '../i18n';

export interface WordPressMediaSelection {
  id?: number;
  url?: string;
  filename?: string;
  title?: string;
  mime?: string;
}

interface WordPressMediaFrame {
  on: (event: string, callback: () => void) => void;
  open: () => void;
  state: () => {
    get: (key: string) => {
      toArray: () => Array<{
        id?: number;
        toJSON?: () => WordPressMediaSelection;
        attributes?: WordPressMediaSelection;
      }>;
    };
  };
}

declare global {
  interface Window {
    wp?: {
      media?: (options: unknown) => WordPressMediaFrame;
    };
  }
}

export function canOpenWordPressMediaLibrary(): boolean {
  return typeof window !== 'undefined' && typeof window.wp?.media === 'function';
}

export function openWordPressMediaLibrary(options?: {
  title?: string;
  buttonText?: string;
  multiple?: boolean;
  libraryTypes?: string[];
}): Promise<WordPressMediaSelection[]> {
  const frameFactory = window.wp?.media;
  const locale = detectInitialLocale();
  if (!frameFactory) {
    return Promise.reject(new Error(translateLocale(locale, 'ui.bricksExtensionsSection.feedbackExtra34')));
  }

  return new Promise((resolve) => {
    const frameOptions: Record<string, unknown> = {
      title: options?.title ?? translateLocale(locale, 'ui.finalMediaPicker.select'),
      button: { text: options?.buttonText ?? translateLocale(locale, 'ui.finalMediaPicker.useSelected') },
      multiple: options?.multiple ?? true,
    };
    if (options?.libraryTypes?.length) {
      frameOptions.library = { type: options.libraryTypes };
    }

    const frame = frameFactory(frameOptions);

    frame.on('select', () => {
      const selection = frame.state().get('selection').toArray();
      resolve(
        selection.map((model) => {
          const json = model.toJSON?.() ?? model.attributes ?? {};
          return {
            ...json,
            id: Number(json.id ?? model.id ?? 0) || undefined,
          };
        }),
      );
    });

    frame.open();
  });
}

export async function pickWordPressMediaFiles(): Promise<File[]> {
  const locale = detectInitialLocale();
  const selections = await openWordPressMediaLibrary({
    title: translateLocale(locale, 'ui.finalMediaPicker.attachFromLibrary'),
    buttonText: translateLocale(locale, 'ui.finalMediaPicker.attachSelected'),
    multiple: true,
  });
  const files: File[] = [];

  for (const item of selections) {
    if (!item.id && !item.url) continue;
    const file = await loadWordPressMediaSelection(item);
    const relativePath = inferWordPressMediaRelativePath(item);
    if (relativePath && relativePath !== file.name) {
      // Project uploads use this browser convention to preserve a saved-page
      // bundle's directory layout. The daemon turns the directory portion
      // into its project subdirectory while keeping the basename as the file
      // name, so links such as ./OpenAI_files/site.css remain resolvable.
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        enumerable: false,
        value: relativePath,
      });
    }
    files.push(file);
  }

  return files;
}

type WordPressAttachmentContentResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  item?: {
    filename?: string;
    mimeType?: string;
    contentBase64?: string;
    sizeBytes?: number;
  };
};

export async function loadWordPressMediaSelection(item: WordPressMediaSelection): Promise<File> {
  if (item.id) {
    let response: Response | null = null;
    try {
      response = await pixflowWordPressRestFetch(
        `/media/attachments/${encodeURIComponent(String(item.id))}/content`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
    } catch (error) {
      if (!item.url) throw error;
    }
    if (response) {
      const payload = await response.json().catch(() => ({})) as WordPressAttachmentContentResponse;
      if (response.ok && payload.ok !== false && payload.item?.contentBase64) {
        const bytes = decodeBase64(payload.item.contentBase64);
        const filename = filenameFromPath(item.filename
          || payload.item.filename
          || (item.url ? filenameFromUrl(item.url) : '')
          || `${item.title || 'media'}-${item.id}`);
        const mime = payload.item.mimeType || item.mime || 'application/octet-stream';
        return new File([bytes], filename, { type: mime });
      }
      // A 404 can mean an older plugin without this endpoint. Preserve the
      // legacy static-URL path for that compatibility case only.
      if (response.status !== 404) {
        throw new Error(payload.message || `Could not load ${item.filename || item.title || `attachment #${item.id}`}.`);
      }
    }
  }

  if (!item.url) {
    throw new Error(`Could not load ${item.filename || item.title || 'the selected WordPress attachment'}.`);
  }
  const response = await fetch(item.url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Could not load ${item.filename || item.title || item.url}.`);
  }
  const blob = await response.blob();
  const filename = filenameFromPath(
    item.filename || filenameFromUrl(item.url) || `${item.title || 'media'}-${item.id ?? Date.now()}`,
  );
  return new File([blob], filename, { type: blob.type || item.mime || 'application/octet-stream' });
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = globalThis.atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url, window.location.href).pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return url.split('/').filter(Boolean).pop() ?? '';
  }
}

function filenameFromPath(value: string): string {
  return value.replace(/\\/g, '/').split('/').filter(Boolean).pop() || value;
}

function inferWordPressMediaRelativePath(item: WordPressMediaSelection): string {
  const fallback = item.filename || (item.url ? filenameFromUrl(item.url) : '') || '';
  if (!item.url) return fallback;
  try {
    const pathname = new URL(item.url, window.location.href).pathname;
    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const assetFolderIndex = segments.findIndex((segment) => /_files$/i.test(segment));
    if (assetFolderIndex >= 0 && assetFolderIndex < segments.length - 1) {
      return segments.slice(assetFolderIndex).join('/');
    }
  } catch {
    // Keep the flat filename fallback for malformed or non-URL media entries.
  }
  return fallback;
}
