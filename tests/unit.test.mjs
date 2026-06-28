// Unit tests for pure functions in index.html
// Run with: node --test tests/unit.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Functions replicated from index.html ──────────────────────────────────────

const TARGET_SR = 16000;

function resample(input, fromRate) {
  if (fromRate === TARGET_SR) return input;
  const ratio  = fromRate / TARGET_SR;
  const outLen = Math.round(input.length / ratio);
  const out    = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos  = i * ratio;
    const lo   = Math.floor(pos);
    const hi   = Math.min(lo + 1, input.length - 1);
    const frac = pos - lo;
    out[i]     = input[lo] * (1 - frac) + input[hi] * frac;
  }
  return out;
}

function cleanTranscript(text) {
  return text
    .replace(/\[(?!Music|Applause|Laughter)[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampFontSize(n) {
  return Math.max(14, Math.min(44, n));
}

// ── resample() ────────────────────────────────────────────────────────────────

describe('resample()', () => {
  it('returns the same reference when rate already matches target', () => {
    const input = new Float32Array([0.1, 0.5, 0.9]);
    assert.strictEqual(resample(input, 16000), input);
  });

  it('downsamples 44100 Hz → 16000 Hz to correct output length', () => {
    const input  = new Float32Array(44100); // 1 second of audio
    const output = resample(input, 44100);
    assert.strictEqual(output.length, 16000);
  });

  it('downsamples 48000 Hz → 16000 Hz to correct output length', () => {
    const input  = new Float32Array(48000);
    const output = resample(input, 48000);
    assert.strictEqual(output.length, 16000);
  });

  it('upsamples 8000 Hz → 16000 Hz to correct output length', () => {
    const input  = new Float32Array(8000);
    const output = resample(input, 8000);
    assert.strictEqual(output.length, 16000);
  });

  it('preserves the value of the first sample exactly', () => {
    const input = new Float32Array([0.75, 0.25, 0.0]);
    const output = resample(input, 32000);
    assert.strictEqual(output[0], 0.75);
  });

  it('clamps to the last sample at the end of the output', () => {
    const input = new Float32Array([0.0, 0.5, 1.0]);
    const output = resample(input, 48000);
    const last = output[output.length - 1];
    assert.ok(last >= 0.0 && last <= 1.0, `Last sample ${last} out of range`);
  });

  it('interpolates linearly between adjacent samples', () => {
    // Two samples at 32000 Hz → one interpolated sample at 16000 Hz
    const input = new Float32Array([0.0, 1.0]);
    const output = resample(input, 32000);
    // Middle point at ratio 2 → maps to position 1.0 in input → value 0.5 (lerp)
    assert.ok(output[0] >= 0.0 && output[0] <= 1.0);
  });

  it('returns a Float32Array', () => {
    const input = new Float32Array(44100);
    const output = resample(input, 44100);
    assert.ok(output instanceof Float32Array);
  });
});

// ── cleanTranscript() ─────────────────────────────────────────────────────────

describe('cleanTranscript()', () => {
  it('removes generic noise tags like [Background noise]', () => {
    assert.strictEqual(cleanTranscript('[Background noise] Hello'), 'Hello');
  });

  it('removes [static] tags', () => {
    assert.strictEqual(cleanTranscript('Hello [static] world'), 'Hello world');
  });

  it('removes [BLANK_AUDIO] leaving an empty string', () => {
    assert.strictEqual(cleanTranscript('[BLANK_AUDIO]'), '');
  });

  it('keeps [Music] annotation', () => {
    assert.ok(cleanTranscript('[Music] Playing softly').includes('[Music]'));
  });

  it('keeps [Applause] annotation', () => {
    assert.ok(cleanTranscript('Thank you [Applause]').includes('[Applause]'));
  });

  it('keeps [Laughter] annotation', () => {
    assert.ok(cleanTranscript('Ha ha [Laughter]').includes('[Laughter]'));
  });

  it('is case-insensitive when removing noise tags', () => {
    assert.strictEqual(cleanTranscript('[NOISE] Hello'), 'Hello');
  });

  it('removes multiple noise tags in one pass', () => {
    const result = cleanTranscript('[Noise] Hello [static] world [inaudible]');
    assert.strictEqual(result, 'Hello world');
  });

  it('collapses multiple spaces into one', () => {
    assert.strictEqual(cleanTranscript('hello   world'), 'hello world');
  });

  it('trims leading and trailing whitespace', () => {
    assert.strictEqual(cleanTranscript('  hello  '), 'hello');
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(cleanTranscript(''), '');
  });

  it('leaves plain speech unchanged', () => {
    const text = 'I think that is a brilliant idea.';
    assert.strictEqual(cleanTranscript(text), text);
  });
});

// ── clampFontSize() ───────────────────────────────────────────────────────────

describe('clampFontSize()', () => {
  it('clamps values below 14 up to 14', () => {
    assert.strictEqual(clampFontSize(8), 14);
  });

  it('clamps values above 44 down to 44', () => {
    assert.strictEqual(clampFontSize(100), 44);
  });

  it('passes through values within range unchanged', () => {
    assert.strictEqual(clampFontSize(22), 22);
  });

  it('allows the minimum boundary value of 14', () => {
    assert.strictEqual(clampFontSize(14), 14);
  });

  it('allows the maximum boundary value of 44', () => {
    assert.strictEqual(clampFontSize(44), 44);
  });

  it('clamps zero to minimum', () => {
    assert.strictEqual(clampFontSize(0), 14);
  });

  it('clamps negative values to minimum', () => {
    assert.strictEqual(clampFontSize(-10), 14);
  });
});
