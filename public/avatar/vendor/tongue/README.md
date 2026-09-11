# Tongue keypoint model

`tongue-keypoint.onnx` is our ONNX export of xiaofeiyu0723's ExVR 0.7.2.2 tongue model from the MIT-licensed revision `ed1887ef1a90a35ffc92e5506998fd4880773e8a`. Keep [LICENSE](LICENSE) with redistributed copies. Source URLs, original weight hashes, exporter versions, and exported hash are in [provenance.json](provenance.json).

This is a trained tongue-tip/presence model for a frontal webcam mouth crop. Input `mouth` is float32 `[1,1,32,32]`, grayscale divided by 255. Outputs are `heatmap` `[1,1,32,32]` and `presence` `[1,1]`. It does not estimate tongue depth.

The model was trained on a small dataset. It can fail on profiles, poor lighting, occlusion, and people or expressions unlike its training examples. PyTorch/ONNX numerical parity was checked; that does not establish general accuracy. Camera inference runs locally.

The current GPL-licensed ExVR prebuilt ONNX, FoxyFace models, original training photos, and original PyTorch weights are not distributed here. The source URLs, export settings and tool versions are recorded in `provenance.json`. Its `reproduction_directory` refers to the original avatar studio; those offline export tools are not required or bundled by this app.
