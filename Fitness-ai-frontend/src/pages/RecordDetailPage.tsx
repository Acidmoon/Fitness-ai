import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { getExercises, getRecordDetail } from "@/services/exercise-api";
import {
  applyPoseScoring,
  getPoseAnalysis,
  previewPoseScoring,
  triggerPoseAnalysis,
} from "@/services/pose-analysis-api";
import { deleteVideo, fetchVideoBlob, uploadVideo } from "@/services/video-api";
import type { PoseScoringResult } from "@/types/pose-scoring";
import { extractApiErrorMessage } from "@/utils/error";

function extractFilename(videoUrl: string) {
  return videoUrl.split("/").pop() ?? "";
}

function formatRecordTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} 秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  if (!restSeconds) {
    return `${minutes} 分钟`;
  }

  return `${minutes} 分 ${restSeconds} 秒`;
}

function formatConfidence(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "暂无";
  }

  return `${Math.round(value * 100)}%`;
}

export function RecordDetailPage() {
  const { recordId } = useParams();
  const numericRecordId = Number(recordId);
  const [detailMessage, setDetailMessage] = useState("");
  const [detailError, setDetailError] = useState("");
  const [poseScoringPreview, setPoseScoringPreview] =
    useState<PoseScoringResult | null>(null);
  const queryClient = useQueryClient();
  const exercisesQuery = useQuery({
    queryKey: ["exercise", "catalog"],
    queryFn: getExercises,
  });
  const recordQuery = useQuery({
    queryKey: ["exercise", "record-detail", numericRecordId],
    queryFn: () => getRecordDetail(numericRecordId),
    enabled: Number.isFinite(numericRecordId),
  });
  const poseAnalysisQuery = useQuery({
    queryKey: ["pose-analysis", numericRecordId],
    queryFn: () => getPoseAnalysis(numericRecordId),
    enabled: Number.isFinite(numericRecordId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadVideo(numericRecordId, file, true),
    onSuccess: async () => {
      setDetailError("");
      setDetailMessage("视频上传成功。");
      await queryClient.invalidateQueries({
        queryKey: ["exercise", "record-detail", numericRecordId],
      });
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
    },
    onError: (error) => {
      setDetailMessage("");
      setDetailError(extractApiErrorMessage(error, "视频上传失败"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteVideo(numericRecordId),
    onSuccess: async () => {
      setDetailError("");
      setDetailMessage("视频删除成功。");
      await queryClient.invalidateQueries({
        queryKey: ["exercise", "record-detail", numericRecordId],
      });
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
    },
    onError: (error) => {
      setDetailMessage("");
      setDetailError(extractApiErrorMessage(error, "视频删除失败"));
    },
  });

  const poseAnalysisMutation = useMutation({
    mutationFn: () => triggerPoseAnalysis(numericRecordId),
    onSuccess: async () => {
      setDetailError("");
      setPoseScoringPreview(null);
      setDetailMessage("姿态分析完成。");
      await queryClient.invalidateQueries({
        queryKey: ["pose-analysis", numericRecordId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["exercise", "record-detail", numericRecordId],
      });
    },
    onError: (error) => {
      setDetailMessage("");
      setDetailError(extractApiErrorMessage(error, "姿态分析失败"));
    },
  });

  const poseScoringPreviewMutation = useMutation({
    mutationFn: () => previewPoseScoring(numericRecordId),
    onSuccess: (data) => {
      setDetailError("");
      setDetailMessage(
        data.status === "unsupported" ? "当前动作暂不支持 AI 评分。" : "AI 评分预览已生成。"
      );
      setPoseScoringPreview(data);
    },
    onError: (error) => {
      setDetailMessage("");
      setDetailError(extractApiErrorMessage(error, "AI 评分预览失败"));
    },
  });

  const poseScoringApplyMutation = useMutation({
    mutationFn: () => applyPoseScoring(numericRecordId),
    onSuccess: async (data) => {
      setDetailError("");
      setDetailMessage("AI 评分已应用。");
      setPoseScoringPreview(data);
      await queryClient.invalidateQueries({
        queryKey: ["exercise", "record-detail", numericRecordId],
      });
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
    },
    onError: (error) => {
      setDetailMessage("");
      setDetailError(extractApiErrorMessage(error, "AI 评分应用失败"));
    },
  });

  async function handlePreview(videoUrl: string) {
    try {
      setDetailError("");
      const blob = await fetchVideoBlob(extractFilename(videoUrl));
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setDetailError(extractApiErrorMessage(error, "视频预览失败"));
    }
  }

  if (recordQuery.isLoading || exercisesQuery.isLoading) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Record Detail</p>
            <h2>记录详情</h2>
          </div>
        </header>
        <LoadingState message="正在加载记录详情..." />
      </section>
    );
  }

  if (recordQuery.isError || !recordQuery.data) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Record Detail</p>
            <h2>记录详情</h2>
          </div>
        </header>
        <ErrorState message="请确认记录存在，并且当前登录态有效。" />
      </section>
    );
  }

  const exercise = exercisesQuery.data?.find(
    (item) => item.id === recordQuery.data.exercise_id
  );
  const poseAnalysis = poseAnalysisQuery.data;
  const poseAnalysisStatus = poseAnalysisMutation.isPending
    ? "processing"
    : poseAnalysis?.status ?? "idle";
  const canTriggerPoseAnalysis =
    Boolean(recordQuery.data.video_url) && !poseAnalysisMutation.isPending;
  const poseStatusLabel =
    poseAnalysisStatus === "done"
      ? "分析完成"
      : poseAnalysisStatus === "failed"
        ? "分析失败"
        : poseAnalysisStatus === "processing"
          ? "分析中"
          : "待分析";
  const poseStatusTone =
    poseAnalysisStatus === "done"
      ? "success"
      : poseAnalysisStatus === "failed"
        ? "warning"
        : "muted";
  const canPreviewPoseScoring =
    poseAnalysisStatus === "done" &&
    !poseScoringPreviewMutation.isPending &&
    !poseScoringApplyMutation.isPending;
  const canApplyPoseScoring =
    poseScoringPreview?.status === "scored" &&
    !poseScoringApplyMutation.isPending &&
    !poseScoringPreviewMutation.isPending;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Record Detail</p>
          <h2>记录详情</h2>
        </div>
        <div className="inline-actions">
          <Link to="/videos" className="button-secondary link-button">
            前往视频中心
          </Link>
          <Link to="/records" className="button-secondary link-button">
            返回记录列表
          </Link>
        </div>
      </header>
      {detailMessage ? <p className="form-success">{detailMessage}</p> : null}
      {detailError ? <p className="form-error">{detailError}</p> : null}
      <div className="panel-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>基础信息</h3>
              <p>单条训练记录的核心表现数据，用于后续分析与回看。</p>
            </div>
            <StatusBadge label={`记录 #${recordQuery.data.id}`} tone="muted" />
          </div>
          <div className="data-list">
            <div className="data-list-item">
              <span>动作</span>
              <strong>{exercise?.name ?? `动作 ${recordQuery.data.exercise_id}`}</strong>
            </div>
            <div className="data-list-item">
              <span>得分</span>
              <strong>{recordQuery.data.score}</strong>
            </div>
            <div className="data-list-item">
              <span>次数</span>
              <strong>{recordQuery.data.count}</strong>
            </div>
            <div className="data-list-item">
              <span>时长</span>
              <strong>{recordQuery.data.duration} 秒</strong>
            </div>
            <div className="data-list-item">
              <span>平均心率</span>
              <strong>
                {recordQuery.data.heart_rate_avg
                  ? recordQuery.data.heart_rate_avg
                  : "暂无"}
              </strong>
            </div>
            <div className="data-list-item">
              <span>记录时间</span>
              <strong>{formatRecordTime(recordQuery.data.created_at)}</strong>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>反馈信息</h3>
              <p>当前以文本反馈为主，后续可拓展为结构化纠错建议。</p>
            </div>
            <StatusBadge
              label={recordQuery.data.feedback?.trim() ? "已有反馈" : "暂无反馈"}
              tone={recordQuery.data.feedback?.trim() ? "success" : "muted"}
            />
          </div>
          <p>
            {recordQuery.data.feedback?.trim()
              ? recordQuery.data.feedback
              : "当前记录暂无文本反馈。"}
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>视频状态</h3>
              <p>当前详情页可直接维护视频素材，无需回到列表页。</p>
            </div>
            <StatusBadge
              label={recordQuery.data.video_url ? "已关联视频" : "待上传视频"}
              tone={recordQuery.data.video_url ? "success" : "muted"}
            />
          </div>
          {recordQuery.data.video_url ? (
            <>
              <p>当前记录已关联视频，可执行预览或删除。</p>
              <div className="inline-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={deleteMutation.isPending || uploadMutation.isPending}
                  onClick={() => handlePreview(recordQuery.data.video_url!)}
                >
                  预览视频
                </button>
                <button
                  type="button"
                  className="button-secondary button-danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!window.confirm("确定要删除该视频吗？")) {
                      return;
                    }
                    deleteMutation.mutate();
                  }}
                >
                  {deleteMutation.isPending ? "删除中..." : "删除视频"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>当前记录还没有关联视频。</p>
              <label className="field">
                <span>上传视频</span>
                <input
                  type="file"
                  accept=".mp4,.avi,.mov,.mkv"
                  disabled={uploadMutation.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }

                    setDetailMessage("");
                    setDetailError("");
                    uploadMutation.mutate(file);
                    event.currentTarget.value = "";
                  }}
                />
                <small className="field-hint">
                  支持 mp4、avi、mov、mkv，文件大小上限 50MB。
                </small>
              </label>
              {uploadMutation.isPending ? <p className="field-hint">视频上传中，请稍候。</p> : null}
            </>
          )}
        </section>
        <section className="panel accent-panel">
          <div className="section-heading">
            <div>
              <h3>AI 姿态分析</h3>
              <p>基于已上传视频提取姿态关键点摘要，用于后续评分和纠错。</p>
            </div>
            <StatusBadge label={poseStatusLabel} tone={poseStatusTone} />
          </div>
          {poseAnalysisQuery.isLoading ? (
            <p className="field-hint">正在读取姿态分析结果...</p>
          ) : null}
          {poseAnalysisQuery.isError ? (
            <p className="form-error">姿态分析结果加载失败。</p>
          ) : null}
          <div className="inline-actions">
            {recordQuery.data.video_url ? (
              <button
                type="button"
                className="button-primary"
                disabled={!canTriggerPoseAnalysis}
                onClick={() => {
                  setDetailMessage("");
                  setDetailError("");
                  poseAnalysisMutation.mutate();
                }}
              >
                {poseAnalysisMutation.isPending ? "分析中..." : "开始姿态分析"}
              </button>
            ) : (
              <span className="field-hint">上传视频后可开始姿态分析。</span>
            )}
          </div>
          <div className="detail-ai-grid">
            <article className="detail-ai-card">
              <span>分析状态</span>
              <strong>{poseStatusLabel}</strong>
              <p>
                {recordQuery.data.video_url
                  ? "视频已就绪，可随时重新触发姿态分析。"
                  : "当前没有视频素材，分析链路保持待分析状态。"}
              </p>
            </article>
            <article className="detail-ai-card">
              <span>有效帧</span>
              <strong>
                {poseAnalysis?.summary
                  ? `${poseAnalysis.summary.valid_frame_count} 帧`
                  : "暂无"}
              </strong>
              <p>
                {poseAnalysis?.summary
                  ? `采样 ${poseAnalysis.summary.sampled_frames} 帧，来源共 ${poseAnalysis.summary.total_frames} 帧。`
                  : "尚未生成可用于评分的关键点摘要。"}
              </p>
            </article>
            <article className="detail-ai-card">
              <span>平均置信度</span>
              <strong>
                {formatConfidence(poseAnalysis?.summary?.average_confidence)}
              </strong>
              <p>
                {poseAnalysis?.model
                  ? `模型 ${poseAnalysis.model.name ?? "未知"}，输入尺寸 ${
                      poseAnalysis.model.input_size ?? "未知"
                    }。`
                  : "等待分析结果返回模型和置信度信息。"}
              </p>
            </article>
          </div>
          <div className="data-list detail-ai-summary">
            <div className="data-list-item">
              <span>当前动作上下文</span>
              <strong>{exercise?.name ?? `动作 ${recordQuery.data.exercise_id}`}</strong>
            </div>
            <div className="data-list-item">
              <span>训练负载摘要</span>
              <strong>
                {recordQuery.data.count} 次 / {formatDuration(recordQuery.data.duration)}
              </strong>
            </div>
            <div className="data-list-item">
              <span>推荐下一步</span>
              <strong>
                {poseAnalysisStatus === "done"
                  ? "进入动作评分"
                  : recordQuery.data.video_url
                    ? "开始姿态分析"
                    : "先补视频素材"}
              </strong>
            </div>
          </div>
          <div className="detail-ai-grid">
            <article className="detail-ai-card">
              <span>动作评分</span>
              <strong>
                {poseScoringPreview?.score !== null &&
                poseScoringPreview?.score !== undefined
                  ? `${poseScoringPreview.score} 分`
                  : "暂无"}
              </strong>
              <p>
                {poseScoringPreview?.status === "unsupported"
                  ? "当前动作暂不支持基于姿态的评分。"
                  : poseAnalysisStatus === "done"
                    ? "可先预览 AI 评分，再决定是否写入记录。"
                    : "完成姿态分析后可预览 AI 评分。"}
              </p>
            </article>
            <article className="detail-ai-card">
              <span>AI 估算次数</span>
              <strong>
                {poseScoringPreview?.count !== null &&
                poseScoringPreview?.count !== undefined
                  ? `${poseScoringPreview.count} 次`
                  : "暂无"}
              </strong>
              <p>
                {poseScoringPreview?.metrics?.valid_frames
                  ? `基于 ${poseScoringPreview.metrics.valid_frames} 个有效采样帧。`
                  : "等待评分结果返回有效帧信息。"}
              </p>
            </article>
            <article className="detail-ai-card">
              <span>评分置信度</span>
              <strong>{formatConfidence(poseScoringPreview?.confidence)}</strong>
              <p>
                {poseScoringPreview?.metrics?.angle_range !== undefined
                  ? `动作角度行程 ${poseScoringPreview.metrics.angle_range}°。`
                  : "评分后展示动作幅度摘要。"}
              </p>
            </article>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={!canPreviewPoseScoring}
              onClick={() => {
                setDetailMessage("");
                setDetailError("");
                poseScoringPreviewMutation.mutate();
              }}
            >
              {poseScoringPreviewMutation.isPending ? "评分中..." : "预览动作评分"}
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={!canApplyPoseScoring}
              onClick={() => {
                if (!window.confirm("确定要用 AI 评分覆盖当前得分、次数和反馈吗？")) {
                  return;
                }
                setDetailMessage("");
                setDetailError("");
                poseScoringApplyMutation.mutate();
              }}
            >
              {poseScoringApplyMutation.isPending ? "应用中..." : "应用 AI 评分"}
            </button>
            {poseAnalysisStatus !== "done" ? (
              <span className="field-hint">完成姿态分析后可预览动作评分。</span>
            ) : null}
          </div>
          {poseScoringPreview?.feedback?.length ? (
            <div className="data-list detail-ai-summary">
              {poseScoringPreview.feedback.map((item) => (
                <div className="data-list-item" key={item}>
                  <span>AI 反馈</span>
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
