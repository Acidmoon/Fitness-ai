import os
from typing import Iterable, Optional

VIDEO_URL_PREFIX = "/videos/"
UPLOAD_DIR = "uploads/videos"


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


def delete_video_file(video_url: Optional[str]) -> bool:
    file_path = resolve_video_path_from_url(video_url)
    if not file_path:
        return False

    if os.path.exists(file_path):
        os.remove(file_path)
        return True

    return False


def delete_record_videos(records: Iterable) -> None:
    for record in records:
        delete_video_file(getattr(record, "video_url", None))
