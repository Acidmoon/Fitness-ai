from io import BytesIO

import pytest

from app.utils.video_storage import (
    LocalVideoStorage,
    VIDEO_DELETE_STATUS_DELETED,
    VIDEO_DELETE_STATUS_MISSING,
    VIDEO_DELETE_STATUS_SKIPPED,
    VideoUploadTooLargeError,
)


class UploadStub:
    def __init__(self, content: bytes):
        self.file = BytesIO(content)


class TestLocalVideoStorage:
    def test_resolves_safe_filename_inside_upload_dir(self, tmp_path):
        storage = LocalVideoStorage(str(tmp_path))

        assert storage.resolve_path("demo.mp4") == str(tmp_path / "demo.mp4")

    def test_rejects_path_traversal_filename(self, tmp_path):
        storage = LocalVideoStorage(str(tmp_path))

        assert storage.resolve_path("../demo.mp4") is None
        assert storage.get_filename_from_url("/videos/../demo.mp4") is None

    def test_deletes_existing_file(self, tmp_path):
        storage = LocalVideoStorage(str(tmp_path))
        file_path = tmp_path / "demo.mp4"
        file_path.write_bytes(b"video")

        result = storage.delete("/videos/demo.mp4")

        assert result == VIDEO_DELETE_STATUS_DELETED
        assert not file_path.exists()

    def test_missing_and_invalid_delete_statuses(self, tmp_path):
        storage = LocalVideoStorage(str(tmp_path))

        assert storage.delete("/videos/missing.mp4") == VIDEO_DELETE_STATUS_MISSING
        assert storage.delete("/outside/missing.mp4") == VIDEO_DELETE_STATUS_SKIPPED

    def test_stream_upload_enforces_size_limit(self, tmp_path):
        storage = LocalVideoStorage(str(tmp_path))
        upload = UploadStub(b"abcdef")
        file_path = tmp_path / "oversized.mp4"

        with pytest.raises(VideoUploadTooLargeError):
            storage.stream_upload_to_path(upload, str(file_path), 3, 2)

        assert not file_path.exists()
