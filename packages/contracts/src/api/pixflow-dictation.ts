/** Immutable, multilingual whisper.cpp models. No provider account is required. */
export const DICTATION_MODELS = [
  { id: 'base-q5', name: 'Base · Compact', file: 'ggml-base-q5_1.bin', bytes: 59707625, sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898' },
  { id: 'small-q5', name: 'Small · Compact', file: 'ggml-small-q5_1.bin', bytes: 190085487, sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb' },
  { id: 'small', name: 'Small · Full precision', file: 'ggml-small.bin', bytes: 487601967, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' },
] as const;
export type DictationModelId = typeof DICTATION_MODELS[number]['id'];
export type DictationAction = 'status' | 'enable' | 'disable' | 'download' | 'cancel-download' | 'select' | 'delete' | 'transcribe';
export interface DictationStatus {
  enabled: boolean;
  selected: DictationModelId;
  supported: boolean;
  engineReady: boolean;
  installed: DictationModelId[];
  storageBytes: number;
  busy: boolean;
  download: null | { model: DictationModelId; phase: 'engine' | 'model' | 'verifying'; received: number; total: number };
  error: string | null;
}
export interface DictationRequest { model?: DictationModelId; audioBase64?: string; language?: string }
