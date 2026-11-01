import { wavFromPcm } from '../gemini.ts';

// Joining the per-panel recordings into one narration track. Pure functions on 16-bit little-endian PCM.

export type DecodedWav = { pcm: Buffer; rate: number };

/** Reads a mono 16-bit WAV, as returned by `gemini.speech()` */
export function readWav(wav: Buffer): DecodedWav {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let rate = 24_000;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      if (wav.readUInt16LE(offset + 10) !== 1 || wav.readUInt16LE(offset + 22) !== 16) throw new Error('Only mono 16-bit WAV is supported');
      rate = wav.readUInt32LE(offset + 12);
    }
    if (id === 'data') {
      // A streamed WAV may declare a size larger than what arrived
      const end = Math.min(wav.length, offset + 8 + size);
      return { pcm: wav.subarray(offset + 8, offset + 8 + Math.floor((end - offset - 8) / 2) * 2), rate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV has no audio data');
}

const FRAME_MS = 10;

/** Cuts the leading and trailing silence from a recording, keeping a short breath either side */
export function trimSilence(pcm: Buffer, rate: number, { thresholdDb = -46, keepMs = 120 } = {}): Buffer {
  const frame = Math.max(1, Math.round(rate * FRAME_MS / 1000)) * 2;
  const threshold = 32768 * 10 ** (thresholdDb / 20);
  const loud = (start: number) => {
    let sum = 0;
    let count = 0;
    for (let i = start; i + 1 < Math.min(pcm.length, start + frame); i += 2) {
      const s = pcm.readInt16LE(i);
      sum += s * s;
      count++;
    }
    return count > 0 && Math.sqrt(sum / count) > threshold;
  };
  let first = -1;
  let last = -1;
  for (let at = 0; at < pcm.length; at += frame) {
    if (loud(at)) {
      if (first === -1) first = at;
      last = at + frame;
    }
  }
  if (first === -1) return pcm.subarray(0, 0);
  const keep = Math.round(rate * keepMs / 1000) * 2;
  return pcm.subarray(Math.max(0, first - keep), Math.min(pcm.length, last + keep));
}

export type JoinedNarration = { wav: Buffer; /** Second at which each recording starts */ marks: number[]; durationSec: number };

/** One track from several recordings with a pause between them, and where each one starts */
export function joinRecordings(wavs: Buffer[], { gapMs = 650 } = {}): JoinedNarration {
  if (!wavs.length) throw new Error('Nothing to join');
  const decoded = wavs.map(readWav);
  const rate = decoded[0].rate;
  if (decoded.some(d => d.rate !== rate)) throw new Error('Recordings use different sample rates');
  const gap = Buffer.alloc(Math.round(rate * gapMs / 1000) * 2);
  const parts: Buffer[] = [];
  const marks: number[] = [];
  let bytes = 0;
  decoded.forEach((d, i) => {
    const pcm = trimSilence(d.pcm, rate);
    if (!pcm.length) throw new Error('A recording was silent');
    if (i > 0) {
      parts.push(gap);
      bytes += gap.length;
    }
    marks.push(round1(bytes / 2 / rate));
    parts.push(pcm);
    bytes += pcm.length;
  });
  return { wav: wavFromPcm(Buffer.concat(parts), rate), marks, durationSec: round1(bytes / 2 / rate) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Length of a WAV in seconds */
export function wavSeconds(wav: Buffer) {
  const { pcm, rate } = readWav(wav);
  return pcm.length / 2 / rate;
}
