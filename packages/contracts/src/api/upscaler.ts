/** Optional native image pack on the paired Bridge. Size is the download in bytes. */
export interface UpscalerStatus { supported: boolean; installed: boolean; bytes: number; busy: boolean; models?: boolean; noiseReduction?: boolean; enabled?: boolean; installedModels?: string[] }
export interface UpscalerResult { png: string }

export const UPSCALER_MAX_INPUT_BYTES = 17 * 1024 * 1024;
export const UPSCALER_MAX_OUTPUT_PIXELS = 32_000_000;
