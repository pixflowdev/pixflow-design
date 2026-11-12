export const documentInputLimit = 20 * 1024 * 1024;

export const officeFormats = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'rtf'] as const;
const textFormats = [
  'txt', 'md', 'markdown', 'json', 'jsonl', 'ndjson', 'xml', 'yaml', 'yml', 'html', 'htm',
  'css', 'scss', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'php', 'rb', 'java', 'cs',
  'go', 'rs', 'c', 'cpp', 'h', 'sh', 'ps1', 'sql', 'toml', 'ini', 'log',
] as const;
const formats = [...officeFormats, ...textFormats, 'pdf', 'csv', 'tsv', 'doc', 'xls', 'ppt'] as const;
export type DocumentFormat = typeof formats[number];
export function isOfficeFormat(format: DocumentFormat): format is typeof officeFormats[number] {
  return officeFormats.some(value => value === format);
}

export function documentFormat(name: string): DocumentFormat | undefined {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  return formats.find(format => extension === format);
}
