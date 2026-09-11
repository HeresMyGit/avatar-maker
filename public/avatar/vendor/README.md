# Browser tracking dependencies

Vendored from the curated mfer avatar studio. This directory is served beneath
`BASE_URL + avatar/vendor/`; media frames remain in the browser.

- MediaPipe Tasks Vision 0.10.17: Apache-2.0; see `LICENSE-MEDIAPIPE` and `provenance.json` for pinned runtime/model sources and SHA-256 hashes.
- ONNX Runtime Web: MIT; license, third-party notices, and provenance in `onnxruntime/`.
- Tongue keypoint model: pinned MIT-licensed ExVR revision; license and provenance in `tongue/`.

Capture loads these files only after the user starts webcam control. Full-pose,
lite-pose, SIMD/non-SIMD, GPU/CPU, and worker/main-thread fallbacks are retained.
The older pixel-picking tongue detector is not included.
