/**
 * AudioWorklet processor for decibri-web.
 *
 * Runs in a dedicated audio thread.  Receives Float32 samples at the
 * browser's native sample rate, resamples to the target rate via linear
 * interpolation, optionally converts to Int16, and posts chunks to the
 * main thread.
 *
 * This file is compiled as a standalone script — it cannot import other
 * modules.  All logic (resampling, format conversion) is inlined.
 */

interface ProcessorOptions {
  framesPerBuffer: number;
  format: 'int16' | 'float32';
  nativeSampleRate: number;
  targetSampleRate: number;
}

class DecibriProcessor extends AudioWorkletProcessor {
  private framesPerBuffer: number;
  private format: 'int16' | 'float32';
  private ratio: number;           // nativeSampleRate / targetSampleRate
  private needsResample: boolean;
  private position: number;        // fractional position in input space (carries across calls)
  private buffer: Float32Array;    // accumulation buffer at target rate
  private bufferIndex: number;     // fill level of accumulation buffer

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const opts = options.processorOptions as ProcessorOptions;
    this.framesPerBuffer = opts.framesPerBuffer;
    this.format = opts.format;
    this.ratio = opts.nativeSampleRate / opts.targetSampleRate;
    this.needsResample = opts.nativeSampleRate !== opts.targetSampleRate;
    this.position = 0;
    this.buffer = new Float32Array(this.framesPerBuffer);
    this.bufferIndex = 0;
  }

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    let samples: Float32Array;

    if (this.needsResample) {
      samples = this.resample(input);
    } else {
      samples = input;
    }

    // Accumulate resampled frames into the buffer
    let offset = 0;
    while (offset < samples.length) {
      const remaining = this.framesPerBuffer - this.bufferIndex;
      const available = samples.length - offset;
      const toCopy = Math.min(remaining, available);

      this.buffer.set(samples.subarray(offset, offset + toCopy), this.bufferIndex);
      this.bufferIndex += toCopy;
      offset += toCopy;

      if (this.bufferIndex >= this.framesPerBuffer) {
        this.flush();
      }
    }

    return true;
  }

  private resample(input: Float32Array): Float32Array {
    const inputLength = input.length;

    // Calculate how many output samples we can produce
    // We need position < inputLength - 1 for interpolation (need idx and idx+1)
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

    // Carry fractional remainder relative to consumed input
    this.position = pos - inputLength;

    return output;
  }

  private flush(): void {
    let transferBuffer: ArrayBuffer;

    if (this.format === 'int16') {
      const int16 = new Int16Array(this.framesPerBuffer);
      for (let i = 0; i < this.framesPerBuffer; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, Math.round(this.buffer[i] * 32768)));
      }
      transferBuffer = int16.buffer;
    } else {
      // Copy the float32 buffer (original will be reused)
      transferBuffer = this.buffer.slice(0, this.framesPerBuffer).buffer;
    }

    this.port.postMessage(transferBuffer, [transferBuffer]);

    // Reset accumulation buffer
    this.buffer = new Float32Array(this.framesPerBuffer);
    this.bufferIndex = 0;
  }
}

registerProcessor('decibri-processor', DecibriProcessor);
