from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from loguru import logger
from sqlalchemy.orm import Session
import os
import uuid
from app.database import get_db
from app.models.exercise import ExerciseRecord
from app.models.user import User
from app.utils.security import get_current_user
from app.utils.video_files import (
    VideoUploadTooLargeError,
    build_video_url,
    delete_video_file,
    ensure_upload_dir,
    get_filename_from_video_url,
    resolve_upload_path,
    stream_upload_to_path,
)

router = APIRouter()

ensure_upload_dir()

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}  # 允许上传的视频格式集合
MAX_FILE_SIZE = 50 * 1024 * 1024  # 最大文件大小 50MB


@router.post("/records/{record_id}/video")  # 定义 POST 路由，record_id路径参数
def upload_video(  # 定义上传视频函数
    record_id: int,  # 运动记录 ID，从 URL 路径获取
    video: UploadFile = File(...),  # 上传的文件对象，File(...) 表示必填
    keep_video: bool = True,  # 是否保留视频，默认 True（保留）
    db: Session = Depends(get_db),  # 数据库会话，Depends 自动注入
    current_user: User = Depends(get_current_user),  # 当前登录用户，自动从 JWT 令牌获取
):
    # 验证文件扩展名是否允许
    file_ext = os.path.splitext(video.filename)[1].lower()  # 获取文件扩展名并转小写
    if file_ext not in ALLOWED_EXTENSIONS:  # 检查扩展名是否在允许列表中
        raise HTTPException(status_code=400, detail="不支持的视频格式")  # 抛出 400 错误

    # 检查运动记录是否存在且属于当前用户
    record = (
        db.query(ExerciseRecord)
        .filter(  # 查询运动记录表
            ExerciseRecord.id == record_id,  # 条件 1：记录 ID 匹配
            ExerciseRecord.user_id
            == current_user.id,  # 条件 2：属于当前用户（权限检查）
        )
        .first()
    )  # 获取第一条匹配记录
    if not record:  # 如果记录不存在
        raise HTTPException(status_code=404, detail="运动记录不存在")  # 抛出 404 错误

    # 生成唯一文件名，避免文件覆盖
    unique_filename = f"{uuid.uuid4()}{file_ext}"  # UUID 生成唯一字符串 + 原扩展名
    file_path = resolve_upload_path(unique_filename)
    if not file_path:
        raise HTTPException(status_code=500, detail="视频文件路径生成失败")

    previous_video_url = record.video_url
    should_replace_previous_video = keep_video
    video_deleted = False
    file_size = 0

    try:
        # 保存文件到服务器
        file_size = stream_upload_to_path(video, file_path, MAX_FILE_SIZE)

        # 根据 keep_video 参数决定是否保留文件
        if keep_video:
            record.video_url = build_video_url(unique_filename)
        else:  # 不保留视频（临时处理）
            video_deleted = True  # 标记视频已删除
            delete_video_file(build_video_url(unique_filename))
            # 临时上传不应影响记录原本已保存的视频引用
            record.video_url = previous_video_url

        db.commit()  # 提交数据库事务，保存更改
        db.refresh(record)  # 刷新记录对象，获取最新数据
    except VideoUploadTooLargeError:
        db.rollback()
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")
    except Exception:
        db.rollback()
        delete_video_file(build_video_url(unique_filename))
        raise

    if should_replace_previous_video and previous_video_url != record.video_url:
        try:
            delete_video_file(previous_video_url)
        except OSError as exc:
            logger.warning(
                "Failed to delete replaced video file for record {}: {}",
                record.id,
                str(exc),
            )

    return {  # 返回成功响应
        "message": "视频上传成功",  # 成功消息
        "video_url": (
            record.video_url if keep_video else None
        ),  # 如果保留则返回路径，否则为 None
        "file_size": file_size,
        "video_deleted": video_deleted,  # 返回视频是否被删除
        "note": (
            "视频仅用于临时分析，不会永久存储" if not keep_video else "视频已永久存储"
        ),
    }


@router.delete("/records/{record_id}/video")  # 手动删除视频接口
def delete_video(
    record_id: int,  # 运动记录 ID
    db: Session = Depends(get_db),  # 数据库会话
    current_user: User = Depends(get_current_user),  # 当前用户
):
    # 查询记录
    record = (
        db.query(ExerciseRecord)
        .filter(
            ExerciseRecord.id == record_id, ExerciseRecord.user_id == current_user.id
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="运动记录不存在")

    # 检查是否有视频
    if not record.video_url:
        raise HTTPException(status_code=404, detail="该记录没有关联视频")

    try:
        delete_video_file(record.video_url)
    except OSError:
        raise HTTPException(status_code=500, detail="视频文件删除失败")

    # 更新数据库
    record.video_url = None  # 清空视频路径
    db.commit()  # 提交事务

    return {"message": "视频已删除"}


@router.get("/videos/{filename}")  # 定义 GET 路由，用于访问已上传的视频
def get_video(
    filename: str,  # 文件名，从 URL 路径获取
    db: Session = Depends(get_db),  # 数据库会话
    current_user: User = Depends(get_current_user),  # 需要登录才能访问（权限控制）
):
    # 安全防护：防止路径穿越攻击
    # 只允许纯文件名，不能包含路径分隔符或向上跳转
    if get_filename_from_video_url(build_video_url(filename)) != filename:
        raise HTTPException(status_code=400, detail="非法的文件名")

    file_path = resolve_upload_path(filename)
    if not file_path:
        raise HTTPException(status_code=403, detail="禁止访问该文件")

    # 资源归属校验：只能访问自己记录关联的视频
    record = (
        db.query(ExerciseRecord)
        .filter(
            ExerciseRecord.user_id == current_user.id,
            ExerciseRecord.video_url == build_video_url(filename),
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="视频文件不存在")

    if not os.path.exists(file_path):  # 检查文件是否存在
        raise HTTPException(status_code=404, detail="视频文件不存在")  # 抛出 404 错误
    return FileResponse(file_path)  # 返回文件响应，FastAPI 会自动处理文件流
