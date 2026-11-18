// Reading PNG/JPG in the main thread (SPEC §4bis). createImageBitmap and the canvas only once:
// the order receives the binary bitmap, and from there the pipeline is pure.
import { IMAGE_MAX_PX } from '../config';
import type { RasterImageSource, TraceMode } from '../order/schema';
import {
  bitmapFromLuminance,
  otsuThreshold,
  type CroppedBitmap,
  type LuminanceOptions,
} from './bitmapCodec';
import { IMAGE_MAX_BYTES } from './svgImport';

export interface RasterImportOptions {
  name?: string;
  trace?: TraceMode;
  /** If missing, the threshold is Otsu's. */
  threshold?: number;
  invert?: boolean;
}

export interface RasterImportResult {
  source: RasterImageSource;
  warnings: string[];
  /** Luminance after the possible reduction, before threshold and crop. */
  luminance: Uint8Array;
  width: number;
  height: number;
}

/** Decodes, composites transparency on white, reduces if needed, thresholds and crops. */
export async function importRaster(file: Blob, options: RasterImportOptions = {}): Promise<RasterImportResult> {
  if (file.size > IMAGE_MAX_BYTES) throw new Error('The file is over 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!(bitmap.width > 0) || !(bitmap.height > 0)) throw new Error('The image is empty.');
    const warnings: string[] = [];
    let width = bitmap.width;
    let height = bitmap.height;
    const longSide = Math.max(width, height);
    if (longSide > IMAGE_MAX_PX) {
      const scale = IMAGE_MAX_PX / longSide;
      width = Math.max(1, Math.round(bitmap.width * scale));
      height = Math.max(1, Math.round(bitmap.height * scale));
      warnings.push(`Image reduced to ${width}×${height} px: the long side is over ${IMAGE_MAX_PX} px.`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!ctx) throw new Error('Canvas not available.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height, { colorSpace: 'srgb' });
    const luminance = rec709(image);
    const threshold = options.threshold ?? otsuThreshold(luminance);
    const name = options.name ?? 'image';
    const built = bitmapFromLuminance(luminance, width, height, {
      name,
      threshold,
      invert: options.invert ?? false,
      trace: options.trace ?? 'centerline',
    });
    if (!built) throw new Error('No ink pixels at this threshold.');
    return { source: built.source, warnings, luminance, width, height };
  } finally {
    bitmap.close();
  }
}

/** Recomputes threshold and crop from the luminance already read, without reopening the file. */
export function rebuildRaster(
  luminance: Uint8Array,
  width: number,
  height: number,
  options: LuminanceOptions,
): { source: RasterImageSource; binary: CroppedBitmap } | null {
  return bitmapFromLuminance(luminance, width, height, options);
}

/** Threshold preview: light ink on a dark background, at most 220 px per side. */
export function paintThresholdPreview(canvas: HTMLCanvasElement, binary: CroppedBitmap): void {
  const maxEdge = 220;
  const scale = Math.min(1, maxEdge / Math.max(binary.width, binary.height));
  const width = Math.max(1, Math.round(binary.width * scale));
  const height = Math.max(1, Math.round(binary.height * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(binary.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(binary.width - 1, Math.floor(x / scale));
      const on = binary.data[sourceY * binary.width + sourceX];
      const offset = (y * width + x) * 4;
      const tone = on ? 244 : 28;
      image.data[offset] = tone;
      image.data[offset + 1] = tone;
      image.data[offset + 2] = tone;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Rec. 709, after compositing on white. The canvas is already opaque; residual alpha is composited anyway. */
function rec709(image: ImageData): Uint8Array {
  const src = image.data;
  const out = new Uint8Array(image.width * image.height);
  for (let i = 0, pixel = 0; i < src.length; i += 4, pixel++) {
    const alpha = src[i + 3]! / 255;
    const red = src[i]! * alpha + 255 * (1 - alpha);
    const green = src[i + 1]! * alpha + 255 * (1 - alpha);
    const blue = src[i + 2]! * alpha + 255 * (1 - alpha);
    const tone = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    out[pixel] = Math.min(255, Math.max(0, tone));
  }
  return out;
}
