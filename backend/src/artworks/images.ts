// Image types the painter accepts, found from the file's own first bytes (the stored content type is not trusted).
export type PaintableType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx'];
const HEIF_BRANDS = ['mif1', 'msf1', 'heim', 'heis', 'hevm', 'hevs'];

/** The image type of these bytes, or null for anything else (GIFs, documents, truncated files). */
export function sniffImageType(bytes: Buffer): PaintableType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(PNG)) return 'image/png';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('latin1', 4, 8) === 'ftyp') {
    const brand = bytes.toString('latin1', 8, 12);
    if (HEIC_BRANDS.includes(brand)) return 'image/heic';
    if (HEIF_BRANDS.includes(brand)) return 'image/heif';
  }
  return null;
}
