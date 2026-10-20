# MoveNet model asset

[movenet_lightning_fp16.tflite](movenet_lightning_fp16.tflite) copied from the user's existing backend model directory. The original file is unchanged.

- Size: 4,758,512 bytes.
- SHA-256: `0fac2226112d0371903ca86e3853cec24ef603a0b2f96f589b180f0ebdd135ab`.
- Verified input: one RGB `uint8` tensor of shape `[1, 192, 192, 3]`, pixel range 0–255.
- Verified output: one `float32` tensor of shape `[1, 1, 17, 3]`; each row contains `[y, x, confidence]` in model-input coordinates.
- The `fp16` filename describes the model asset; the actual input and output tensors are **not** float16.

The worker reverses letterboxing and adaptive crop transforms before publishing image-pixel coordinates. Image origin is the top left; x increases rightward, y downward. Left/right keypoint names refer to the person's anatomical side.

The exact upstream release revision and training provenance are not independently established from the supplied file. Model identity is recorded using its hash rather than an assumed upstream version.

Official references:

- [TensorFlow pose estimation overview](https://www.tensorflow.org/lite/examples/pose_estimation/overview)
- [MoveNet tutorial](https://www.tensorflow.org/hub/tutorials/movenet)
- [SinglePose model card](https://storage.googleapis.com/movenet/MoveNet.SinglePose%20Model%20Card.pdf)
