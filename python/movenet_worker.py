"""Local MoveNet worker: one video in, canonical 2D keypoint JSON out."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from importlib import metadata
from pathlib import Path

KEYPOINT_NAMES = (
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
)
MAX_DURATION_MS = 180_000
MAX_SAMPLES = 5400


class WorkerError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def letterbox(frame, size=192, origin=(0, 0)):
    import cv2
    import numpy as np
    height, width = frame.shape[:2]
    scale = min(size / width, size / height)
    new_width = max(1, round(width * scale))
    new_height = max(1, round(height * scale))
    x_offset = (size - new_width) // 2
    y_offset = (size - new_height) // 2
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    canvas[y_offset:y_offset + new_height, x_offset:x_offset + new_width] = resized
    # Use actual integer resize dimensions, including their rounding.
    transform = (new_width / width, new_height / height, x_offset, y_offset, size, origin[0], origin[1])
    return canvas[None, ...], transform


def choose_crop(keypoints, width, height):
    points = {point['name']: point for point in keypoints}
    hips = [points['left_hip'], points['right_hip']]
    shoulders = [points['left_shoulder'], points['right_shoulder']]
    if min(point['confidence'] for point in hips) < 0.2 or max(point['confidence'] for point in shoulders) < 0.2:
        return None
    visible = [point for point in keypoints if point['confidence'] >= 0.2 and 0 <= point['x'] < width and 0 <= point['y'] < height]
    if len(visible) < 6:
        return None
    cx = sum(point['x'] for point in hips) / 2
    cy = sum(point['y'] for point in hips) / 2
    torso = [point for point in hips + shoulders if point['confidence'] >= 0.2]
    torso_range = max(max(abs(point['x'] - cx), abs(point['y'] - cy)) for point in torso)
    body_range = max(max(abs(point['x'] - cx), abs(point['y'] - cy)) for point in visible)
    half = max(torso_range * 1.9, body_range * 1.2, 24)
    if half > max(width, height) / 2:
        return None
    size = math.ceil(half * 2)
    return (round(cx - size / 2), round(cy - size / 2), size)


def prepare_input(frame, region):
    if region is None:
        return letterbox(frame)
    import numpy as np
    x, y, size = region
    height, width = frame.shape[:2]
    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + size, width), min(y + size, height)
    if x2 <= x1 or y2 <= y1:
        return letterbox(frame)
    crop = np.zeros((size, size, 3), dtype=np.uint8)
    crop[y1 - y:y2 - y, x1 - x:x2 - x] = frame[y1:y2, x1:x2]
    return letterbox(crop, origin=(x, y))


def restore_keypoints(rows, transform):
    scale_x, scale_y, x_offset, y_offset, size, origin_x, origin_y = transform
    if len(rows) != 17:
        raise WorkerError('INFERENCE_FAILED', 'MoveNet output must contain 17 keypoints')
    result = []
    for name, row in zip(KEYPOINT_NAMES, rows):
        y, x, confidence = (float(value) for value in row)
        if not all(math.isfinite(value) for value in (x, y, confidence)) or not 0 <= confidence <= 1:
            raise WorkerError('INFERENCE_FAILED', 'MoveNet produced invalid coordinates or confidence')
        # Coordinates in padding can fall outside the image; preserve rather than clamp them.
        result.append({
            'name': name,
            'x': round((x * size - x_offset) / scale_x + origin_x, 3),
            'y': round((y * size - y_offset) / scale_y + origin_y, 3),
            'confidence': round(confidence, 6),
        })
    return result


def load_dependencies():
    try:
        import cv2
        import numpy as np
        from ai_edge_litert.interpreter import Interpreter
    except ImportError as exc:
        raise WorkerError('MODEL_UNAVAILABLE', 'Install python/requirements.txt in FITNESS_PYTHON environment') from exc
    return cv2, np, Interpreter


def estimate_video(model_path: str, video_path: str, sample_fps: float = 10):
    started = time.perf_counter()
    if not math.isfinite(sample_fps) or not 1 <= sample_fps <= 30:
        raise WorkerError('VIDEO_INVALID', 'Sample FPS must be between 1 and 30')
    cv2, np, Interpreter = load_dependencies()
    model = Path(model_path)
    if not model.is_file():
        raise WorkerError('MODEL_UNAVAILABLE', 'MoveNet model file does not exist')
    try:
        interpreter = Interpreter(model_path=str(model), num_threads=2)
        interpreter.allocate_tensors()
        inputs = interpreter.get_input_details()
        outputs = interpreter.get_output_details()
    except Exception as exc:
        raise WorkerError('MODEL_UNAVAILABLE', 'Cannot load the supplied TFLite model') from exc
    if (len(inputs) != 1 or list(inputs[0]['shape']) != [1, 192, 192, 3]
            or inputs[0]['dtype'] != np.uint8 or len(outputs) != 1
            or list(outputs[0]['shape']) != [1, 1, 17, 3] or outputs[0]['dtype'] != np.float32):
        raise WorkerError('MODEL_UNAVAILABLE', 'Expected MoveNet Lightning uint8 [1,192,192,3] -> float32 [1,1,17,3]')

    cap = cv2.VideoCapture(video_path)
    frames = []
    decoded = 0
    inference_ms = 0.0
    try:
        if not cap.isOpened():
            raise WorkerError('VIDEO_INVALID', 'Cannot open video')
        cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        reported_count = float(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or not 0 < fps <= 1000:
            raise WorkerError('VIDEO_INVALID', 'Video frame rate is unavailable')
        total = int(reported_count) if math.isfinite(reported_count) and reported_count > 0 else 0
        rotation = float(cap.get(cv2.CAP_PROP_ORIENTATION_META))
        rotation = rotation if math.isfinite(rotation) else 0.0
        if total and total / fps * 1000 > MAX_DURATION_MS:
            raise WorkerError('VIDEO_INVALID', 'Video exceeds the 180 second analysis budget')
        next_sample = 0.0
        previous_pts = -1.0
        origin_pts = None
        width = height = 0
        for_index = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            index = for_index
            for_index += 1
            decoded += 1
            pts = float(cap.get(cv2.CAP_PROP_POS_MSEC))
            if not math.isfinite(pts) or pts < 0 or pts <= previous_pts:
                raise WorkerError('VIDEO_INVALID', 'Decoder did not provide a strictly increasing video time axis')
            previous_pts = pts
            if origin_pts is None:
                origin_pts = pts
            timestamp = pts - origin_pts
            if timestamp > MAX_DURATION_MS or decoded > 180_000:
                raise WorkerError('VIDEO_INVALID', 'Video exceeds the analysis budget')
            frame_height, frame_width = frame.shape[:2]
            if not width:
                width, height = frame_width, frame_height
                if width * height > 16_777_216:
                    raise WorkerError('VIDEO_INVALID', 'Video frame resolution exceeds 16 megapixels')
            if (frame_width, frame_height) != (width, height):
                raise WorkerError('VIDEO_INVALID', 'Video dimensions changed while decoding')
            if timestamp + 0.001 < next_sample:
                continue
            if len(frames) >= MAX_SAMPLES:
                raise WorkerError('VIDEO_INVALID', 'Video exceeds the 5400 sample budget')
            current_region = next_region if frames else None
            passes = 1 if frames else 3
            for refinement in range(passes):
                tensor, transform = prepare_input(frame, current_region)
                before = time.perf_counter()
                interpreter.set_tensor(inputs[0]['index'], tensor)
                interpreter.invoke()
                rows = interpreter.get_tensor(outputs[0]['index'])[0, 0]
                inference_ms += (time.perf_counter() - before) * 1000
                keypoints = restore_keypoints(rows, transform)
                candidate = choose_crop(keypoints, width, height)
                if refinement + 1 < passes:
                    current_region = candidate
            next_region = candidate
            x, y, region_width = current_region or (0, 0, width)
            frames.append({
                'frameIndex': index, 'timestampMs': round(timestamp, 3), 'keypoints': keypoints,
                'region': {'x': x, 'y': y, 'width': region_width, 'height': region_width if current_region else height},
            })
            next_sample += 1000 / sample_fps
        if not frames:
            raise WorkerError('VIDEO_INVALID', 'Video contains no decodable frames')
        if total and decoded != total:
            raise WorkerError('VIDEO_INVALID', 'Video was not completely decoded; no partial result is returned')
        duration_ms = previous_pts - origin_pts + 1000 / fps
    finally:
        cap.release()
    return {
        'schemaVersion': '1.0', 'coordinateSpace': 'image-pixels',
        'model': {
            'id': 'movenet-singlepose-lightning', 'sha256': hashlib.sha256(model.read_bytes()).hexdigest(),
            'inputSize': 192, 'inputDtype': 'uint8',
            'runtime': f'ai-edge-litert@{metadata.version("ai-edge-litert")}',
            'preprocessing': 'adaptive-crop-letterbox@0.1.0',
        },
        'video': {
            'name': Path(video_path).name, 'width': width, 'height': height,
            'sourceFps': fps, 'totalFrames': total or decoded, 'decodedFrames': decoded,
            'durationMs': round(duration_ms, 3), 'rotationDegrees': rotation,
            'timestampSource': 'decoder-pts',
        },
        'sampling': {'requestedFps': sample_fps, 'sampledFrames': len(frames)},
        'performance': {'elapsedMs': round((time.perf_counter() - started) * 1000, 3), 'inferenceMs': round(inference_ms, 3)},
        'frames': frames,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--video', required=True)
    parser.add_argument('--sample-fps', type=float, default=10)
    args = parser.parse_args()
    try:
        result = estimate_video(args.model, args.video, args.sample_fps)
        print(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
        return 0
    except WorkerError as exc:
        print(json.dumps({'code': exc.code, 'message': str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    except Exception as exc:
        print(json.dumps({'code': 'INFERENCE_FAILED', 'message': f'{type(exc).__name__}: {exc}'}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
