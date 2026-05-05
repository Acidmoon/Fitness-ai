from typing import Iterable, Optional

from app.config import settings
from app.utils.video_storage import (
    LocalVideoStorage,
    VIDEO_DELETE_STATUS_DELETED,
    VIDEO_DELETE_STATUS_MISSING,
    VIDEO_DELETE_STATUS_SKIPPED,
    VIDEO_URL_PREFIX,
    VideoUploadTooLargeError,
)

UPLOAD_DIR = settings.VIDEO_UPLOAD_DIR
UPLOAD_CHUNK_SIZE = 1024 * 1024
VIDEO_SIGNATURE_READ_SIZE = 32
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


class UnsupportedVideoContentError(Exception):
    pass


def get_video_storage() -> LocalVideoStorage:
    if settings.VIDEO_STORAGE_BACKEND != "local":
        raise RuntimeError("VIDEO_STORAGE_BACKEND 当前仅支持 local")
    return LocalVideoStorage(UPLOAD_DIR)


def ensure_upload_dir() -> None:
    get_video_storage().ensure_ready()


def is_safe_filename(filename: str) -> bool:
    return LocalVideoStorage.is_safe_filename(filename)


def build_video_url(filename: str) -> str:
    return get_video_storage().build_url(filename)


def resolve_upload_path(filename: str) -> Optional[str]:
    return get_video_storage().resolve_path(filename)


def get_filename_from_video_url(video_url: Optional[str]) -> Optional[str]:
    return get_video_storage().get_filename_from_url(video_url)


def resolve_video_path_from_url(video_url: Optional[str]) -> Optional[str]:
    return get_video_storage().resolve_path_from_url(video_url)


def delete_video_file(video_url: Optional[str]) -> str:
    return get_video_storage().delete(video_url)


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
    return get_video_storage().stream_upload_to_path(
        upload_file,
        file_path,
        max_file_size,
        UPLOAD_CHUNK_SIZE,
    )


__all__ = [
    "ALLOWED_VIDEO_MIME_TYPES",
    "MP4_COMPATIBLE_BRANDS",
    "UPLOAD_CHUNK_SIZE",
    "UPLOAD_DIR",
    "UnsupportedVideoContentError",
    "VIDEO_DELETE_STATUS_DELETED",
    "VIDEO_DELETE_STATUS_MISSING",
    "VIDEO_DELETE_STATUS_SKIPPED",
    "VIDEO_SIGNATURE_READ_SIZE",
    "VIDEO_URL_PREFIX",
    "VideoUploadTooLargeError",
    "build_video_url",
    "delete_record_videos",
    "delete_video_file",
    "detect_video_signature",
    "ensure_upload_dir",
    "get_filename_from_video_url",
    "get_video_storage",
    "is_safe_filename",
    "read_upload_header",
    "resolve_upload_path",
    "resolve_video_path_from_url",
    "stream_upload_to_path",
    "validate_video_upload_content",
]
