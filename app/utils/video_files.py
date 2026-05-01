import os
from typing import Iterable, Optional

VIDEO_URL_PREFIX = "/videos/"
UPLOAD_DIR = "uploads/videos"
UPLOAD_CHUNK_SIZE = 1024 * 1024
VIDEO_DELETE_STATUS_DELETED = "deleted"
VIDEO_DELETE_STATUS_MISSING = "missing"
VIDEO_DELETE_STATUS_SKIPPED = "skipped"


class VideoUploadTooLargeError(Exception):
    pass


def ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def is_safe_filename(filename: str) -> bool:
    return bool(
        filename
        and ".." not in filename
        and "/" not in filename
        and "\\" not in filename
    )


def build_video_url(filename: str) -> str:
    return f"{VIDEO_URL_PREFIX}{filename}"


def resolve_upload_path(filename: str) -> Optional[str]:
    if not is_safe_filename(filename):
        return None

    file_path = os.path.join(UPLOAD_DIR, filename)
    real_path = os.path.realpath(file_path)
    real_upload_dir = os.path.realpath(UPLOAD_DIR)
    if not real_path.startswith(real_upload_dir + os.sep):
        return None

    return file_path


def get_filename_from_video_url(video_url: Optional[str]) -> Optional[str]:
    if not video_url or not video_url.startswith(VIDEO_URL_PREFIX):
        return None

    filename = video_url[len(VIDEO_URL_PREFIX) :]
    if not is_safe_filename(filename):
        return None

    return filename


def resolve_video_path_from_url(video_url: Optional[str]) -> Optional[str]:
    filename = get_filename_from_video_url(video_url)
    if not filename:
        return None
    return resolve_upload_path(filename)


def delete_video_file(video_url: Optional[str]) -> str:
    file_path = resolve_video_path_from_url(video_url)
    if not file_path:
        return VIDEO_DELETE_STATUS_SKIPPED

    try:
        os.remove(file_path)
        return VIDEO_DELETE_STATUS_DELETED
    except FileNotFoundError:
        return VIDEO_DELETE_STATUS_MISSING



def delete_record_videos(records: Iterable) -> None:
    for record in records:
        delete_video_file(getattr(record, "video_url", None))


def stream_upload_to_path(upload_file, file_path: str, max_file_size: int) -> int:
    total_size = 0

    try:
        with open(file_path, "wb") as buffer:
            while True:
                chunk = upload_file.file.read(UPLOAD_CHUNK_SIZE)
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
