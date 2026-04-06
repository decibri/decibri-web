import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the resampling logic used in the AudioWorklet processor.
 *
 * Since the resampler is inlined in the worklet (can't import modules),
 * we re-implement the same algorithm here for isolated testing.
 */

class Resampler {
  private ratio: number;
  private position: number;

  constructor(fromRate: number, toRate: number) {
    this.ratio = fromRate / toRate;
    this.position = 0;
  }

  process(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input;

    const inputLength = input.length;
    let count = 0;
    let pos = this.position;
    while (pos < inputLength - 1) {
      count++;
      pos += this.ratio;
    }

    const output = new Float32Array(count);
    pos = this.position;

    for (let i = 0; i < count; i++) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
      pos += this.ratio;
    }

    this.position = pos - inputLength;
    return output;
  }
}

describe('Resampler', () => {
  it('passes through when rates match', () => {
    const r = new Resampler(48000, 48000);
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const output = r.process(input);
    expect(output).toBe(input); // same reference
  });

  it('downsamples 48000 -> 16000 (clean 3:1)', () => {
    const r = new Resampler(48000, 16000);
    // 12 input frames -> 4 output frames
    const input = new Float32Array(12);
    for (let i = 0; i < 12; i++) input[i] = i;

    const output = r.process(input);
    expect(output.length).toBe(4);
    expect(output[0]).toBeCloseTo(0);
    expect(output[1]).toBeCloseTo(3);
    expect(output[2]).toBeCloseTo(6);
    expect(output[3]).toBeCloseTo(9);
  });

  it('downsamples 44100 -> 16000 (fractional ratio 2.75625)', () => {
    const r = new Resampler(44100, 16000);
    // 128 input frames at 44100 Hz
    const input = new Float32Array(128);
    for (let i = 0; i < 128; i++) input[i] = Math.sin(2 * Math.PI * 1000 * i / 44100);

    const output = r.process(input);

    // Expected: 128 / 2.75625 ≈ 46 output frames
    expect(output.length).toBeGreaterThan(40);
    expect(output.length).toBeLessThan(50);
  });

  it('maintains cross-chunk continuity', () => {
    const r = new Resampler(48000, 16000);

    // Process two consecutive chunks of a ramp signal
    const chunk1 = new Float32Array(12);
    const chunk2 = new Float32Array(12);
    for (let i = 0; i < 12; i++) chunk1[i] = i;
    for (let i = 0; i < 12; i++) chunk2[i] = i + 12;

    const out1 = r.process(chunk1);
    const out2 = r.process(chunk2);

    // Concatenate outputs
    const combined = new Float32Array(out1.length + out2.length);
    combined.set(out1);
    combined.set(out2, out1.length);

    // All output samples should be monotonically increasing (it's a ramp)
    for (let i = 1; i < combined.length; i++) {
      expect(combined[i]).toBeGreaterThan(combined[i - 1]);
    }

    // Compare with processing all at once
    const r2 = new Resampler(48000, 16000);
    const allInput = new Float32Array(24);
    for (let i = 0; i < 24; i++) allInput[i] = i;
    const allOutput = r2.process(allInput);

    // The combined chunked output should closely match the single-pass output
    // (may differ by 1 sample at boundaries due to carry-over)
    const minLen = Math.min(combined.length, allOutput.length);
    for (let i = 0; i < minLen; i++) {
      expect(combined[i]).toBeCloseTo(allOutput[i], 4);
    }
  });

  it('preserves sine wave frequency through resampling', () => {
    const fromRate = 48000;
    const toRate = 16000;
    const freq = 1000; // 1kHz sine
    const r = new Resampler(fromRate, toRate);

    // Generate 480 samples at 48kHz (10ms)
    const input = new Float32Array(480);
    for (let i = 0; i < 480; i++) {
      input[i] = Math.sin(2 * Math.PI * freq * i / fromRate);
    }

    const output = r.process(input);
    // Should produce 160 samples at 16kHz (10ms)
    expect(output.length).toBe(160);

    // Verify output is a 1kHz sine at 16kHz sample rate
    // At 16kHz, 1kHz = 16 samples per cycle. Check first cycle.
    // Peak should be near sample 4 (quarter cycle)
    const peakIdx = Array.from(output.subarray(0, 16)).reduce(
      (maxIdx, val, idx, arr) => val > arr[maxIdx] ? idx : maxIdx, 0
    );
    expect(peakIdx).toBe(4); // quarter cycle of 16 samples/cycle
  });

  it('handles very small input chunks', () => {
    const r = new Resampler(48000, 16000);
    // Only 2 input frames — may produce 0 output frames depending on carry-over
    const input = new Float32Array([0.5, 0.6]);
    const output = r.process(input);
    // Should not crash, may produce 0 or 1 samples
    expect(output.length).toBeLessThanOrEqual(1);
  });
});
