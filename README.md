<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# decibri-web

Cross-browser microphone capture for the web. Same API as [decibri](https://decibri.dev) for Node.js.

Zero dependencies. Pure TypeScript. Under 10KB.

<!-- badges: start -->
<table>
  <tr>
    <td><strong>Meta</strong></td>
    <td>
      <a href="https://www.npmjs.com/package/decibri-web"><img src="https://img.shields.io/npm/v/decibri-web" alt="npm version"></a>&nbsp;
      <a href="https://github.com/analyticsinmotion/decibri-web/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="Apache 2.0 License"></a>&nbsp;
      <a href="https://decibri.dev"><img src="https://img.shields.io/badge/Website-decibri.dev-blue" alt="decibri.dev"></a>&nbsp;
      <a href="https://github.com/analyticsinmotion"><img src="https://github.com/user-attachments/assets/616c530f-cf2a-4f26-8f6c-7397be513847" alt="Analytics in Motion" width="137" height="20"></a>
    </td>
  </tr>
  <tr>
    <td><strong>CI</strong></td>
    <td>
      <a href="https://github.com/analyticsinmotion/decibri-web/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/analyticsinmotion/decibri-web/ci.yml?label=build%20%26%20test&logo=github" alt="CI"></a>&nbsp;
      <a href="https://www.npmjs.com/package/decibri-web"><img src="https://img.shields.io/bundlephobia/minzip/decibri-web" alt="Bundle size"></a>&nbsp;
      <a href="https://www.npmjs.com/package/decibri-web"><img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero dependencies"></a>
    </td>
  </tr>
  <tr>
    <td><strong>Platform</strong></td>
    <td>
      <a href="https://npmjs.com/package/decibri"><img src="https://img.shields.io/badge/Node.js-decibri-339933?logo=node.js&logoColor=white" alt="decibri (Node.js)"></a>&nbsp;
      <a href="https://npmjs.com/package/decibri-web"><img src="https://img.shields.io/badge/Browser-decibri--web-4285F4?logo=googlechrome&logoColor=white" alt="decibri-web (Browser)"></a>
    </td>
  </tr>
</table>
<!-- badges: end -->
</div>

---

## The decibri platform

| Package | Environment | Backend |
| --------- | ------------ | --------- |
| [decibri](https://npmjs.com/package/decibri) | Node.js | Native C++ (PortAudio) |
| **decibri-web** | **Browser** | **Web Audio API** |

Same API. Different runtimes. Capture audio anywhere JavaScript runs.

## Quick Start

```bash
npm install decibri-web
```

```typescript
import { Decibri } from 'decibri-web';

const mic = new Decibri({ sampleRate: 16000 });

mic.on('data', (chunk) => {
  // chunk is an Int16Array of PCM samples — ready to use
  console.log(`Received ${chunk.length} samples`);
});

// Must be called from a user gesture (click/tap) in Safari
await mic.start();

// Stop when done
mic.stop();
```

## API Reference

### `new Decibri(options?)`

Creates a new microphone capture instance. Does **not** start capture — call `start()`.

| Option | Type | Default | Description |
| -------- | ------ | --------- | ------------- |
| `sampleRate` | `number` | `16000` | Target sample rate in Hz |
| `channels` | `number` | `1` | Number of channels (browsers reliably support 1) |
| `framesPerBuffer` | `number` | `1600` | Frames per chunk (1600 at 16kHz = 100ms) |
| `device` | `string` | system default | `deviceId` from `Decibri.devices()` |
| `format` | `'int16' \| 'float32'` | `'int16'` | Sample encoding format |
| `vad` | `boolean` | `false` | Enable voice activity detection |
| `vadThreshold` | `number` | `0.01` | RMS energy threshold for speech (0–1) |
| `vadHoldoff` | `number` | `300` | Ms of silence before `'silence'` event |
| `echoCancellation` | `boolean` | `true` | Browser echo cancellation. Set `false` for music/tuner apps. |
| `noiseSuppression` | `boolean` | `true` | Browser noise suppression. Set `false` for music/tuner apps. |
| `workletUrl` | `string` | (inline) | URL for the AudioWorklet processor. Override if CSP blocks `blob:` URLs. |

### Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `start()` | `Promise<void>` | Request mic permission and begin capture. No-op if already started. |
| `stop()` | `void` | Stop capture and release all resources. Safe to call anytime. |
| `isOpen` | `boolean` | `true` while actively capturing. |

### Static Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `Decibri.devices()` | `Promise<DeviceInfo[]>` | List audio input devices. Labels may be empty before permission is granted. |
| `Decibri.version()` | `VersionInfo` | Package version info. |

### Events

| Event | Payload | Description |
| ------- | --------- | ------------- |
| `data` | `Int16Array` or `Float32Array` | Audio chunk (format depends on `format` option) |
| `error` | `Error` | Permission denied, worklet load failure, etc. |
| `end` | — | Emitted after `stop()` |
| `close` | — | Emitted after `stop()`, after `end` |
| `speech` | — | VAD: RMS energy crossed threshold (requires `vad: true`) |
| `silence` | — | VAD: sub-threshold audio for `vadHoldoff` ms (requires `vad: true`) |

## Browser Support

| Browser | Minimum Version |
| --------- | ---------------- |
| Chrome | 66+ |
| Firefox | 76+ |
| Safari | 14.1+ (requires user gesture for `start()`) |
| Edge | 79+ |
| iOS Safari | 14.5+ |
| Android Chrome | 66+ |

Requires HTTPS (or localhost) for microphone access.

## Differences from decibri (Node.js)

| Feature | Node.js `decibri` | `decibri-web` |
| --------- | ------------------ | --------------- |
| Constructor | Sync, capture starts on read | Sync, requires `await start()` |
| `data` payload | `Buffer` | `Int16Array` / `Float32Array` |
| `devices()` | Sync | **Async** (returns Promise) |
| `device` option | Number index or name substring | String `deviceId` only |
| `version()` | `{ decibri, portaudio }` | `{ decibriWeb }` |
| `echoCancellation` | N/A | `boolean` (default `true`) |
| `noiseSuppression` | N/A | `boolean` (default `true`) |
| `backpressure` event | Available | Not available |
| `pipe()` / streams | Full Readable stream | Not available |

## WebSocket Streaming Example

```typescript
import { Decibri } from 'decibri-web';

const ws = new WebSocket('wss://your-server.com/audio');
const mic = new Decibri({ sampleRate: 16000, format: 'int16' });

mic.on('data', (chunk) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(chunk.buffer);
  }
});

mic.on('error', (err) => console.error(err));

// Start on button click
document.getElementById('start')!.addEventListener('click', () => mic.start());
document.getElementById('stop')!.addEventListener('click', () => mic.stop());
```

## CDN / Script Tag Usage

```html
<script src="https://unpkg.com/decibri-web/dist/index.global.js"></script>
<script>
  const mic = new DecibriWeb.Decibri({ sampleRate: 16000 });
  mic.on('data', (chunk) => console.log(chunk.length, 'samples'));
  document.getElementById('start').onclick = () => mic.start();
</script>
```

## Device Selection

```typescript
// Call start() first to get permission, then enumerate devices with full labels
await mic.start();
const devices = await Decibri.devices();
console.log(devices);
// [{ deviceId: 'abc123', label: 'Built-in Microphone', groupId: 'g1' }, ...]

// Use a specific device
const usbMic = new Decibri({ device: devices[1].deviceId });
await usbMic.start();
```

## CSP-Restricted Environments

If your Content Security Policy blocks `blob:` URLs, serve the worklet file yourself:

```typescript
import { Decibri } from 'decibri-web';

const mic = new Decibri({
  workletUrl: '/static/decibri-worklet.js', // serve dist/worklet.js at this path
});
```

Copy `node_modules/decibri-web/dist/worklet.js` to your static assets directory and pass the URL.

## License

[Apache-2.0](LICENSE) — [Analytics in Motion](https://github.com/analyticsinmotion)
