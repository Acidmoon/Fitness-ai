"""Render local keypoint evidence; original videos remain unchanged."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

EDGES = ((0, 1), (0, 2), (1, 3), (2, 4), (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
         (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16))


def render(video_directory: Path, result_directory: Path, output: Path):
    summary = json.loads((result_directory / 'summary.json').read_text(encoding='utf8'))
    selected = [item for item in summary['records'] if item['file'].startswith(('b2651023', '631c726a', '592aeef1', '3cc74fcd'))]
    rows = []
    for item in selected:
        directory = result_directory / Path(item['file']).stem
        poses = json.loads((directory / 'poses.json').read_text(encoding='utf8'))
        motion = json.loads((directory / 'motion.json').read_text(encoding='utf8'))
        usable = [frame for frame in motion['features'] if frame['angle'] is not None]
        if not usable:
            continue
        chosen = [max(usable, key=lambda frame: frame['angle']), min(usable, key=lambda frame: frame['angle'])]
        cells = []
        cap = cv2.VideoCapture(str(video_directory / item['file']))
        try:
            cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
            for feature in chosen:
                pose = next(frame for frame in poses['frames'] if frame['frameIndex'] == feature['frameIndex'])
                cap.set(cv2.CAP_PROP_POS_FRAMES, pose['frameIndex'])
                ok, frame = cap.read()
                if not ok:
                    raise RuntimeError(f'Cannot decode evidence frame for {item["file"]}')
                for a, b in EDGES:
                    p, q = pose['keypoints'][a], pose['keypoints'][b]
                    if min(p['confidence'], q['confidence']) >= 0.3:
                        cv2.line(frame, (round(p['x']), round(p['y'])), (round(q['x']), round(q['y'])), (50, 240, 240), max(2, round(frame.shape[1] / 500)), cv2.LINE_AA)
                for p in pose['keypoints']:
                    if p['confidence'] >= 0.3:
                        cv2.circle(frame, (round(p['x']), round(p['y'])), max(3, round(frame.shape[1] / 350)), (30, 40, 255), -1, cv2.LINE_AA)
                scale = min(540 / frame.shape[1], 320 / frame.shape[0])
                resized = cv2.resize(frame, (round(frame.shape[1] * scale), round(frame.shape[0] * scale)))
                cell = np.full((385, 540, 3), 24, dtype=np.uint8)
                h, w = resized.shape[:2]
                cell[65:65 + h, (540 - w) // 2:(540 - w) // 2 + w] = resized
                label = f'{item["file"][:12]}  {motion["exercise"]}  cycles={len(motion["repetitions"])}'
                detail = f'{pose["timestampMs"] / 1000:.2f}s  angle={feature["angle"]:.1f} deg'
                cv2.putText(cell, label, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1, cv2.LINE_AA)
                cv2.putText(cell, detail, (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1, cv2.LINE_AA)
                cells.append(cell)
        finally:
            cap.release()
        rows.append(np.hstack(cells))
    if not rows:
        raise RuntimeError('No evidence frames available')
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(output)
    if not cv2.imwrite(str(output), np.vstack(rows)):
        raise RuntimeError('Cannot write evidence image')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('video_directory', type=Path)
    parser.add_argument('result_directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    render(args.video_directory, args.result_directory, args.output)
