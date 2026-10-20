import math
import unittest

import numpy as np

from python.movenet_worker import WorkerError, choose_crop, letterbox, prepare_input, restore_keypoints


class CoordinateTests(unittest.TestCase):
    def test_letterbox_is_uint8_rgb_with_padding(self):
        frame = np.zeros((100, 200, 3), dtype=np.uint8)
        frame[:, :, 0] = 255
        tensor, _ = letterbox(frame)
        self.assertEqual(tensor.shape, (1, 192, 192, 3))
        self.assertEqual(tensor.dtype, np.uint8)
        self.assertEqual(tensor[0, 96, 96].tolist(), [0, 0, 255])
        self.assertEqual(tensor[0, 0, 0].tolist(), [0, 0, 0])

    def test_non_square_coordinates_round_trip_using_actual_resize_dimensions(self):
        for width, height in [(1920, 1080), (1080, 1920), (641, 359)]:
            with self.subTest(width=width, height=height):
                _, transform = letterbox(np.zeros((height, width, 3), dtype=np.uint8))
                sx, sy, ox, oy, size, _, _ = transform
                x, y = width * 0.25, height * 0.75
                rows = np.tile([(y * sy + oy) / size, (x * sx + ox) / size, 0.9], (17, 1))
                point = restore_keypoints(rows, transform)[0]
                self.assertAlmostEqual(point['x'], x, places=3)
                self.assertAlmostEqual(point['y'], y, places=3)

    def test_crop_origin_and_outside_image_padding_round_trip(self):
        frame = np.zeros((400, 800, 3), dtype=np.uint8)
        _, transform = prepare_input(frame, (-50, 50, 300))
        sx, sy, ox, oy, size, origin_x, origin_y = transform
        x, y = 75, 100
        rows = np.tile([((y - origin_y) * sy + oy) / size, ((x - origin_x) * sx + ox) / size, 0.9], (17, 1))
        point = restore_keypoints(rows, transform)[0]
        self.assertAlmostEqual(point['x'], x, places=3)
        self.assertAlmostEqual(point['y'], y, places=3)

    def test_coordinates_in_padding_are_not_clamped(self):
        _, transform = letterbox(np.zeros((100, 200, 3), dtype=np.uint8))
        rows = np.tile([0, 0.5, 0.9], (17, 1))
        self.assertLess(restore_keypoints(rows, transform)[0]['y'], 0)

    def test_non_finite_model_output_is_rejected(self):
        _, transform = letterbox(np.zeros((100, 200, 3), dtype=np.uint8))
        rows = np.tile([math.nan, 0.5, 0.9], (17, 1))
        with self.assertRaises(WorkerError):
            restore_keypoints(rows, transform)

    def test_crop_falls_back_to_full_frame_when_torso_is_unreliable(self):
        from python.movenet_worker import KEYPOINT_NAMES
        points = [{'name': name, 'x': 100, 'y': 100, 'confidence': 0.1} for name in KEYPOINT_NAMES]
        self.assertIsNone(choose_crop(points, 800, 600))


if __name__ == '__main__':
    unittest.main()
