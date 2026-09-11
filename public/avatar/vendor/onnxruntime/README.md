# ONNX Runtime Web 1.29.0

These three runtime assets are unmodified files from the npm `onnxruntime-web` 1.29.0 package. The downloaded tarball's SHA512 was checked against npm's published integrity value before copying. [provenance.json](provenance.json) records package URLs, integrity, and per-file SHA256 hashes.

- `ort.wasm.min.mjs`: JavaScript ESM interface.
- `ort-wasm-simd-threaded.mjs`: WebAssembly loader.
- `ort-wasm-simd-threaded.wasm`: SIMD WebAssembly runtime. The application can configure one thread even though the upstream filename includes `threaded`.

Copyright Microsoft Corporation. Distributed under the accompanying [MIT license](LICENSE); upstream [third-party notices](ThirdPartyNotices.txt) are preserved. Hosting these files locally lets browser inference work without a third-party runtime CDN. Model assets have their own license in `../tongue/`.
