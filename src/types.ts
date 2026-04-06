/** Constructor options for `Decibri`. */
export interface DecibriOptions {
  /**
   * Samples per second.
   * @default 16000
   */
  sampleRate?: number;

  /**
   * Number of input channels. Browsers reliably support 1 (mono) only.
   * @default 1
   */
  channels?: number;

  /**
   * Output frames per chunk. At 16 kHz the default of 1600 produces 100 ms chunks.
   * @default 1600
   */
  framesPerBuffer?: number;

  /**
   * Device to capture from. Pass a `deviceId` string obtained from `Decibri.devices()`.
   * Omit to use the system default input device.
   */
  device?: string;

  /**
   * Sample encoding format.
   * - `'int16'`   — 16-bit signed integer
   * - `'float32'` — 32-bit IEEE 754 float
   * @default 'int16'
   */
  format?: 'int16' | 'float32';

  /**
   * Enable voice activity detection.
   * When `true`, emits `'speech'` and `'silence'` events.
   * @default false
   */
  vad?: boolean;

  /**
   * RMS energy threshold for speech detection (0–1 normalised scale).
   * @default 0.01
   */
  vadThreshold?: number;

  /**
   * Milliseconds of sub-threshold audio before `'silence'` is emitted.
   * @default 300
   */
  vadHoldoff?: number;

  /**
   * Enable browser echo cancellation.
   * Set to `false` for music/tuner applications where raw signal is needed.
   * @default true
   */
  echoCancellation?: boolean;

  /**
   * Enable browser noise suppression.
   * Set to `false` for music/tuner applications where raw signal is needed.
   * @default true
   */
  noiseSuppression?: boolean;

  /**
   * URL for the AudioWorklet processor script. By default the worklet code
   * is inlined via a Blob URL. Override this if your CSP blocks `blob:` URLs.
   */
  workletUrl?: string;
}

/** Describes an available audio input device. */
export interface DeviceInfo {
  /** Opaque device identifier — pass as `options.device`. */
  deviceId: string;
  /** Human-readable device name. May be empty before microphone permission is granted. */
  label: string;
  /** Group identifier (devices sharing the same physical device share a groupId). */
  groupId: string;
}

/** Version information returned by `Decibri.version()`. */
export interface VersionInfo {
  /** decibri-web package version. */
  decibriWeb: string;
}

/** Maps event names to their listener argument tuples. */
export type DecibriEventMap = {
  data: [Int16Array | Float32Array];
  error: [Error];
  end: [];
  close: [];
  speech: [];
  silence: [];
};
