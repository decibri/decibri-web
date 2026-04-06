import { Emitter } from './emitter';
import { WORKLET_SOURCE } from './worklet-inline';
import type { DecibriEventMap, DecibriOptions, DeviceInfo, VersionInfo } from './types';

declare const __VERSION__: string;

/**
 * Browser microphone capture with the same API as decibri for Node.js.
 *
 * @example
 * ```ts
 * import { Decibri } from 'decibri-web';
 *
 * const mic = new Decibri({ sampleRate: 16000 });
 * mic.on('data', (chunk) => {
 *   // chunk is an Int16Array of PCM samples
 * });
 * await mic.start(); // call from a user gesture in Safari
 * // later…
 * mic.stop();
 * ```
 */
export class Decibri extends Emitter<DecibriEventMap> {
  // ── Private state ───────────────────────────────────────────────────────────
  private _audioContext: AudioContext | null = null;
  private _stream: MediaStream | null = null;
  private _sourceNode: MediaStreamAudioSourceNode | null = null;
  private _workletNode: AudioWorkletNode | null = null;
  private _started = false;
  private _starting: Promise<void> | null = null;
  private _stopRequested = false;

  // ── VAD state ───────────────────────────────────────────────────────────────
  private _vad: boolean;
  private _vadThreshold: number;
  private _vadHoldoff: number;
  private _isSpeaking = false;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Options ─────────────────────────────────────────────────────────────────
  private _sampleRate: number;
  private _channels: number;
  private _framesPerBuffer: number;
  private _device: string | undefined;
  private _format: 'int16' | 'float32';
  private _echoCancellation: boolean;
  private _noiseSuppression: boolean;
  private _workletUrl: string | undefined;

  constructor(options: DecibriOptions = {}) {
    super();
    this._sampleRate = options.sampleRate ?? 16000;
    this._channels = options.channels ?? 1;
    this._framesPerBuffer = options.framesPerBuffer ?? 1600;
    this._device = options.device;
    this._format = options.format ?? 'int16';
    this._vad = options.vad ?? false;
    this._vadThreshold = options.vadThreshold ?? 0.01;
    this._vadHoldoff = options.vadHoldoff ?? 300;
    this._echoCancellation = options.echoCancellation ?? true;
    this._noiseSuppression = options.noiseSuppression ?? true;
    this._workletUrl = options.workletUrl;

    // Validate
    if (this._sampleRate < 1000 || this._sampleRate > 384000) {
      throw new TypeError(`sampleRate must be between 1000 and 384000, got ${this._sampleRate}`);
    }
    if (this._channels < 1 || this._channels > 32) {
      throw new TypeError(`channels must be between 1 and 32, got ${this._channels}`);
    }
    if (this._framesPerBuffer < 64 || this._framesPerBuffer > 65536) {
      throw new TypeError(`framesPerBuffer must be between 64 and 65536, got ${this._framesPerBuffer}`);
    }
    if (this._vadThreshold < 0 || this._vadThreshold > 1) {
      throw new TypeError(`vadThreshold must be between 0 and 1, got ${this._vadThreshold}`);
    }
    if (this._vadHoldoff < 0) {
      throw new TypeError(`vadHoldoff must be >= 0, got ${this._vadHoldoff}`);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start microphone capture.
   *
   * Requests microphone permission and sets up the audio pipeline.
   * Must be called from a user gesture context in Safari.
   * No-op if already started.  Returns the existing promise if a start
   * is already in progress.
   */
  start(): Promise<void> {
    if (this._started) return Promise.resolve();
    if (this._starting) return this._starting;

    this._starting = this._doStart().finally(() => {
      this._starting = null;
    });

    return this._starting;
  }

  /**
   * Stop microphone capture and release all resources.
   *
   * Safe to call multiple times or before `start()`.
   * After `stop()`, calling `start()` again creates a fresh session.
   */
  stop(): void {
    // If start() is in-flight but hasn't completed yet, flag for teardown on completion
    if (!this._started) {
      if (this._starting) {
        this._stopRequested = true;
      }
      return;
    }
    this._started = false;

    // Stop media tracks
    this._stream?.getTracks().forEach(t => t.stop());

    // Disconnect audio nodes
    this._sourceNode?.disconnect();
    this._workletNode?.disconnect();
    this._workletNode?.port.close();

    // Close audio context
    this._audioContext?.close();

    // Clear VAD
    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    this._isSpeaking = false;

    // Release references for GC
    this._audioContext = null;
    this._stream = null;
    this._sourceNode = null;
    this._workletNode = null;

    this.emit('end');
    this.emit('close');
  }

  /** Whether the microphone is currently capturing. */
  get isOpen(): boolean {
    return this._started;
  }

  /**
   * List available audio input devices.
   *
   * Device labels may be empty until microphone permission is granted.
   * Call `start()` first to trigger the permission prompt, then call
   * `devices()` to get full labels.
   */
  static async devices(): Promise<DeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter(d => d.kind === 'audioinput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label,
        groupId: d.groupId,
      }));
  }

  /** Version information. */
  static version(): VersionInfo {
    return { decibriWeb: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0' };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async _doStart(): Promise<void> {
    // 1. Create AudioContext at native sample rate
    this._audioContext = new AudioContext();
    const nativeSampleRate = this._audioContext.sampleRate;

    // Safari fix: resume suspended AudioContext
    await this._audioContext.resume();

    // 2. Request microphone access
    const audioConstraints: MediaTrackConstraints = {
      channelCount: this._channels,
      echoCancellation: this._echoCancellation,
      noiseSuppression: this._noiseSuppression,
    };
    if (this._device) {
      audioConstraints.deviceId = { exact: this._device };
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
      await this._audioContext.close();
      this._audioContext = null;
      const error = this._mapError(err);
      this.emit('error', error);
      throw error;
    }

    // 3. Load AudioWorklet processor
    let blobUrl: string | null = null;
    const workletUrl = this._workletUrl ?? (blobUrl = this._createBlobUrl());

    try {
      await this._audioContext.audioWorklet.addModule(workletUrl);
    } catch (err) {
      // Clean up on failure
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
      await this._audioContext.close();
      this._audioContext = null;
      const error = new Error('Failed to load audio worklet: ' + (err instanceof Error ? err.message : String(err)));
      this.emit('error', error);
      throw error;
    }

    if (blobUrl) URL.revokeObjectURL(blobUrl);

    // 4. Build audio graph
    this._sourceNode = this._audioContext.createMediaStreamSource(this._stream);
    this._workletNode = new AudioWorkletNode(this._audioContext, 'decibri-processor', {
      processorOptions: {
        framesPerBuffer: this._framesPerBuffer,
        format: this._format,
        nativeSampleRate,
        targetSampleRate: this._sampleRate,
      },
    });

    // 5. Wire up data from worklet
    this._workletNode.port.onmessage = (event: MessageEvent) => {
      const buffer: ArrayBuffer = event.data;
      const chunk = this._format === 'int16'
        ? new Int16Array(buffer)
        : new Float32Array(buffer);

      this.emit('data', chunk);

      if (this._vad) {
        this._processVad(chunk);
      }
    };

    // 6. Connect (source -> worklet, NOT to destination)
    this._sourceNode.connect(this._workletNode);

    this._started = true;

    // If stop() was called while start() was in-flight, tear down now
    if (this._stopRequested) {
      this._stopRequested = false;
      this.stop();
    }
  }

  private _createBlobUrl(): string {
    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  private _mapError(err: unknown): Error {
    if (err instanceof DOMException) {
      switch (err.name) {
        case 'NotAllowedError':
          return new Error('Microphone permission denied');
        case 'NotFoundError':
          return new Error('No microphone found');
        default:
          return new Error('Microphone access failed: ' + err.message);
      }
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  // ── VAD (ported from decibri index.js lines 12-27, 131-149) ─────────────

  private _processVad(chunk: Int16Array | Float32Array): void {
    const rms = this._computeRms(chunk);

    if (rms >= this._vadThreshold) {
      if (this._silenceTimer !== null) {
        clearTimeout(this._silenceTimer);
        this._silenceTimer = null;
      }
      if (!this._isSpeaking) {
        this._isSpeaking = true;
        this.emit('speech');
      }
    } else if (this._isSpeaking && this._silenceTimer === null) {
      this._silenceTimer = setTimeout(() => {
        this._isSpeaking = false;
        this._silenceTimer = null;
        this.emit('silence');
      }, this._vadHoldoff);
    }
  }

  private _computeRms(chunk: Int16Array | Float32Array): number {
    let sum = 0;
    const n = chunk.length;
    if (n === 0) return 0;

    if (chunk instanceof Float32Array) {
      for (let i = 0; i < n; i++) sum += chunk[i] * chunk[i];
    } else {
      for (let i = 0; i < n; i++) {
        const s = chunk[i] / 32768;
        sum += s * s;
      }
    }

    return Math.sqrt(sum / n);
  }
}
