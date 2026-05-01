import os
from typing import Iterable, Optional

VIDEO_URL_PREFIX = "/videos/"
UPLOAD_DIR = "uploads/videos"
UPLOAD_CHUNK_SIZE = 1024 * 1024
VIDEO_SIGNATURE_READ_SIZE = 32
VIDEO_DELETE_STATUS_DELETED = "deleted"
VIDEO_DELETE_STATUS_MISSING = "missing"
VIDEO_DELETE_STATUS_SKIPPED = "skipped"
ALLOWED_VIDEO_MIME_TYPES = {
    ".mp4": {"video/mp4", "application/mp4", "application/octet-stream"},
    ".mov": {"video/quicktime", "application/octet-stream"},
    ".mkv": {"video/x-matroska", "application/octet-stream"},
    ".avi": {"video/x-msvideo", "video/avi", "application/octet-stream"},
}
MP4_COMPATIBLE_BRANDS = {
    b"isom",
    b"iso2",
    b"iso5",
    b"iso6",
    b"mp41",
    b"mp42",
    b"avc1",
    b"dash",
    b"M4V ",
}


class VideoUploadTooLargeError(Exception):
    pass


class UnsupportedVideoContentError(Exception):
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


def read_upload_header(upload_file, size: int = VIDEO_SIGNATURE_READ_SIZE) -> bytes:
    original_position = upload_file.file.tell()
    header = upload_file.file.read(size)
    upload_file.file.seek(original_position)
    return header


def detect_video_signature(header: bytes) -> Optional[str]:
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"AVI ":
        return ".avi"

    if len(header) >= 4 and header[:4] == b"\x1A\x45\xDF\xA3":
        return ".mkv"

    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand == b"qt  ":
            return ".mov"
        if brand in MP4_COMPATIBLE_BRANDS:
            return ".mp4"

    return None


def validate_video_upload_content(upload_file, file_ext: str) -> None:
    allowed_mime_types = ALLOWED_VIDEO_MIME_TYPES.get(file_ext)
    if not allowed_mime_types:
        raise UnsupportedVideoContentError("不支持的视频格式")

    content_type = (upload_file.content_type or "").lower()
    if content_type not in allowed_mime_types:
        raise UnsupportedVideoContentError("视频 MIME 类型与扩展名不匹配")

    header = read_upload_header(upload_file)
    detected_signature = detect_video_signature(header)
    if detected_signature != file_ext:
        raise UnsupportedVideoContentError("视频文件内容与扩展名不匹配")


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
