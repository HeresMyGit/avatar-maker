# Avatar runtime

`createAvatarDriver(instance, gltf)` applies the curated avatar behavior to one
`SkeletonUtils.clone()` of the source model. It accepts the full trait bank or a
selected export produced by `export-avatar.js`.

The host application chooses visible traits and runs its body animation mixer
before `driver.update(frame, deltaSeconds, { tracking, now: performance.now() })`.
While tracking, the driver controls supported upper-body, face, and hand bones.
While idle, the host mixer retains body ownership. Springs, lip-mounted props,
and tongue attachments follow the final pose. The tongue controller owns the
tongue mesh's visibility; it stays retracted without a fresh neural observation.

Curated behavior is Enhanced capture, expressive robot mouth with silent voice input,
tracked gaze/blinks/widening, subtle idle eye motion, and hair/garment/jewelry
springs. The robot antenna light pulses red. Use `resetSecondaryMotion()` when
changing traits so spring state resets without losing face/body calibration.
`reset()`, `calibrate(frame?)`, and `dispose()` are available for capture and
component lifecycles. Call `dispose()`
before disposing the avatar's geometries/materials.

Robot mouth articulation and speaker vibration are separate inputs. Camera
tracking drives the existing checker rows and expressions. Optional
`robotVoiceLevel` (0–1) drives speaker vibration; it defaults to zero and can come
from a playback envelope or another explicit input. `robotVoiceStrength` (0–2,
default 1) changes vibration gain; zero mutes vibration while preserving mouth
movement. These per-frame options do not request a microphone or camera.

```js
// Mouth movement only: default behavior.
driver.update(frame, dt, { tracking: true, now: performance.now() });

// Speaker pulse only: closed rows, independent playback/voice envelope.
driver.update(null, dt, {
  tracking: false, now: performance.now(), robotVoiceLevel: voiceEnvelope,
});
```

Omitting the voice level again releases vibration. `reset()` clears both channels.
The low-level grille retains its speaker/ripple controls and all original morph
targets. Its `mode: 'off'` resets the entire grille; use zero voice level or zero
voice strength to silence vibration independently.

`CaptureTracker` is independent of the renderer. Construct it with
`{ video?, vendorBase?, onFrame, onStatus }`, call `setTongueEnabled(true)`, and
start it only from a user action with
`start({ camera: true, microphone: false, mode: 'enhanced', hands: true })`. Call `stop()` on
component disposal or when hiding the page. Vendor files resolve beneath the
Vite base by default; another host can pass its own `vendorBase` URL. Tracking
loads models lazily and processes camera frames in the browser. Tongue inference
uses the retained neural detector; there is no pixel-picking/calibration workflow.
Hardware, CPU, lite-pose, and worker compatibility fallbacks remain available.

A GLB stores geometry, textures, bones, morph targets, animations, and custom
attachment/physics metadata. It does not execute webcam capture or spring code
itself. Applications wanting these behaviors need this runtime or an equivalent
implementation; generic GLB viewers can display the selected avatar and animate
its standard bones/morph targets.

`tests/run-avatar-runtime.mjs` validates the real GLB rig and controlled capture
lifecycle/fallbacks without accessing a physical camera. Type-check this module
with `tsc -p tsconfig.avatar-runtime.json`.
