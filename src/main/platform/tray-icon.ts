import { deflateSync, crc32 } from 'node:zlib';

/** The tray icon sizes, in pixels: the 1x and 2x (Retina) renditions of a 16 point menu-bar icon. */
export const TRAY_ICON_SIZES = [16, 32] as const;

const DESIGN_GRID = 16;
const SUPERSAMPLES_PER_AXIS = 4;

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Three kanban columns of falling height, in a 16 by 16 design grid. */
const KANBAN_BARS: readonly Bar[] = [
  { x: 2, y: 3, width: 3, height: 10 },
  { x: 6.5, y: 3, width: 3, height: 7 },
  { x: 11, y: 3, width: 3, height: 5 },
];

function isInsideBars(gridX: number, gridY: number): boolean {
  return KANBAN_BARS.some(
    (bar) => gridX >= bar.x && gridX < bar.x + bar.width && gridY >= bar.y && gridY < bar.y + bar.height,
  );
}

function pixelCoverage(column: number, row: number, scale: number): number {
  let covered = 0;
  for (let sampleRow = 0; sampleRow < SUPERSAMPLES_PER_AXIS; sampleRow++) {
    for (let sampleColumn = 0; sampleColumn < SUPERSAMPLES_PER_AXIS; sampleColumn++) {
      const gridX = (column + (sampleColumn + 0.5) / SUPERSAMPLES_PER_AXIS) / scale;
      const gridY = (row + (sampleRow + 0.5) / SUPERSAMPLES_PER_AXIS) / scale;
      if (isInsideBars(gridX, gridY)) covered++;
    }
  }
  return covered / (SUPERSAMPLES_PER_AXIS * SUPERSAMPLES_PER_AXIS);
}

/**
 * Draws the icon as RGBA pixels: solid black with the shape in the alpha channel, which is what macOS needs
 * of a template image so that it can tint the icon for light and dark menu bars.
 */
export function renderTrayIconRgba(size: number): Uint8Array {
  const scale = size / DESIGN_GRID;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      pixels[(row * size + column) * 4 + 3] = Math.round(pixelCoverage(column, row, scale) * 255);
    }
  }
  return pixels;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGBA_8_BIT = { bitDepth: 8, colourType: 6 } as const;

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

/** Encodes 8-bit RGBA pixels as a PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = RGBA_8_BIT.bitDepth;
  header[9] = RGBA_8_BIT.colourType;
  const rowBytes = width * 4;
  const scanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let row = 0; row < height; row++) {
    const start = row * (rowBytes + 1);
    scanlines[start] = 0;
    scanlines.set(rgba.subarray(row * rowBytes, (row + 1) * rowBytes), start + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The tray icon as a PNG of the given size in pixels. */
export function renderTrayIconPng(size: number): Buffer {
  return encodePng(size, size, renderTrayIconRgba(size));
}
