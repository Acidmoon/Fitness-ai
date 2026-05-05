import os
from typing import Optional

VIDEO_URL_PREFIX = "/videos/"
VIDEO_DELETE_STATUS_DELETED = "deleted"
VIDEO_DELETE_STATUS_MISSING = "missing"
VIDEO_DELETE_STATUS_SKIPPED = "skipped"


class VideoUploadTooLargeError(Exception):
    pass


class LocalVideoStorage:
    """Local filesystem storage adapter for uploaded exercise videos."""

    def __init__(self, upload_dir: str):
        self.upload_dir = upload_dir

    def ensure_ready(self) -> None:
        os.makedirs(self.upload_dir, exist_ok=True)

    def build_url(self, filename: str) -> str:
        return f"{VIDEO_URL_PREFIX}{filename}"

    def get_filename_from_url(self, video_url: Optional[str]) -> Optional[str]:
        if not video_url or not video_url.startswith(VIDEO_URL_PREFIX):
            return None

        filename = video_url[len(VIDEO_URL_PREFIX) :]
        if not self.is_safe_filename(filename):
            return None

        return filename

    def resolve_path(self, filename: str) -> Optional[str]:
        if not self.is_safe_filename(filename):
            return None

        file_path = os.path.join(self.upload_dir, filename)
        real_path = os.path.realpath(file_path)
        real_upload_dir = os.path.realpath(self.upload_dir)
        if not real_path.startswith(real_upload_dir + os.sep):
            return None

        return file_path

    def resolve_path_from_url(self, video_url: Optional[str]) -> Optional[str]:
        filename = self.get_filename_from_url(video_url)
        if not filename:
            return None
        return self.resolve_path(filename)

    def exists(self, filename: str) -> bool:
        file_path = self.resolve_path(filename)
        return bool(file_path and os.path.exists(file_path))

    def delete(self, video_url: Optional[str]) -> str:
        file_path = self.resolve_path_from_url(video_url)
        if not file_path:
            return VIDEO_DELETE_STATUS_SKIPPED

        try:
            os.remove(file_path)
            return VIDEO_DELETE_STATUS_DELETED
        except FileNotFoundError:
            return VIDEO_DELETE_STATUS_MISSING

    def stream_upload_to_path(
        self,
        upload_file,
        file_path: str,
        max_file_size: int,
        chunk_size: int,
    ) -> int:
        total_size = 0

        try:
            with open(file_path, "wb") as buffer:
                while True:
                    chunk = upload_file.file.read(chunk_size)
                    if not chunk:
                        break

                    total_size += len(chunk)
                    if total_size > max_file_size:
                        raise VideoUploadTooLargeError

                    buffer.write(chunk)
        except Exception:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise
        finally:
            upload_file.file.seek(0)

        return total_size

    @staticmethod
    def is_safe_filename(filename: str) -> bool:
        return bool(
            filename
            and ".." not in filename
            and "/" not in filename
            and "\\" not in filename
            and filename == os.path.basename(filename)
        )
