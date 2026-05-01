import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { getExercises, getRecords } from "@/services/exercise-api";
import { deleteVideo, fetchVideoBlob, uploadVideo } from "@/services/video-api";

function extractFilename(videoUrl: string) {
  return videoUrl.split("/").pop() ?? "";
}

export function VideoCenterPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadingRecordId, setUploadingRecordId] = useState<number | null>(null);
  const exercisesQuery = useQuery({
    queryKey: ["exercise", "catalog"],
    queryFn: getExercises,
  });
  const recordsQuery = useQuery({
    queryKey: ["exercise", "records", "video-center"],
    queryFn: () => getRecords(),
  });

  const exerciseNameMap = useMemo(() => {
    const map = new Map<number, string>();

    for (const item of exercisesQuery.data ?? []) {
      map.set(item.id, item.name);
    }

    return map;
  }, [exercisesQuery.data]);

  const uploadMutation = useMutation({
    mutationFn: ({ recordId, file }: { recordId: number; file: File }) =>
      uploadVideo(recordId, file, true),
    onMutate: ({ recordId }) => {
      setMessage("");
      setErrorMessage("");
      setUploadingRecordId(recordId);
    },
    onSuccess: async () => {
      setErrorMessage("");
      setMessage("视频上传成功。");
      setUploadingRecordId(null);
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
    },
    onError: (error) => {
      setUploadingRecordId(null);
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.detail ?? "视频上传失败");
        return;
      }

      setErrorMessage("视频上传失败");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVideo,
    onSuccess: async () => {
      setErrorMessage("");
      setMessage("视频删除成功。");
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.detail ?? "视频删除失败");
        return;
      }

      setErrorMessage("视频删除失败");
    },
  });

  async function handlePreview(videoUrl: string) {
    try {
      setErrorMessage("");
      const filename = extractFilename(videoUrl);
      const blob = await fetchVideoBlob(filename);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.detail ?? "视频预览失败");
        return;
      }

      setErrorMessage("视频预览失败");
    }
  }

  const records = recordsQuery.data ?? [];
  const uploadedRecords = records.filter((record) => record.video_url);
  const pendingRecords = records.filter((record) => !record.video_url);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Videos</p>
          <h2>视频中心</h2>
        </div>
        <Link to="/records" className="button-secondary link-button">
          返回训练记录
        </Link>
      </header>
      {recordsQuery.isLoading ? <LoadingState message="正在加载视频记录..." /> : null}
      {recordsQuery.isError ? (
        <ErrorState message="视频中心加载失败，请确认已登录且后端已启动。" />
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      <div className="panel-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>已上传视频</h3>
              <p>这些记录已经具备视频素材，可直接预览、删除或承接 AI 分析。</p>
            </div>
            <StatusBadge label={`${uploadedRecords.length} 个素材`} tone="success" />
          </div>
          {!recordsQuery.isLoading && !recordsQuery.isError && uploadedRecords.length === 0 ? (
            <EmptyState title="已上传视频为空" message="当前还没有已上传的视频。" />
          ) : null}
          <div className="records-list">
            {uploadedRecords.map((record) => (
              <article className="record-card" key={record.id}>
                <div className="record-card-top">
                  <div>
                    <p className="record-title">
                      {exerciseNameMap.get(record.exercise_id) ?? `动作 ${record.exercise_id}`}
                    </p>
                    <p className="record-meta">记录 ID：{record.id}</p>
                  </div>
                  <StatusBadge label="已上传" tone="success" />
                </div>
                <div className="inline-actions">
                  <Link to={`/records/${record.id}`} className="button-secondary link-button">
                    查看详情
                  </Link>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handlePreview(record.video_url!)}
                  >
                    预览视频
                  </button>
                  <button
                    type="button"
                    className="button-secondary button-danger"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      setMessage("");
                      setErrorMessage("");
                      if (!window.confirm("确定要删除该视频吗？")) {
                        return;
                      }
                      deleteMutation.mutate(record.id);
                    }}
                  >
                    {deleteMutation.isPending ? "删除中..." : "删除视频"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="panel accent-panel">
          <div className="section-heading">
            <div>
              <h3>AI 状态预留</h3>
              <p>视频中心已经有真实素材入口，后续只需补任务状态和分析结果。</p>
            </div>
            <StatusBadge label="uploaded / processing / done" tone="success" />
          </div>
          <p>当前先展示已上传状态，后续扩展 `processing / done / failed`。</p>
          <p>视频中心已经具备真实数据来源，后续可直接挂接任务状态接口。</p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>待上传视频的记录</h3>
              <p>这部分记录还没有素材，可以直接在这里补充视频。</p>
            </div>
            <StatusBadge label={`${pendingRecords.length} 条待上传`} tone="muted" />
          </div>
          {!recordsQuery.isLoading && !recordsQuery.isError && pendingRecords.length === 0 ? (
            <EmptyState
              title="待上传记录为空"
              message="当前所有训练记录都已有视频，或还没有训练记录。"
            />
          ) : null}
          <div className="records-list">
            {pendingRecords.map((record) => (
              <article className="record-card" key={record.id}>
                <div className="record-card-top">
                  <div>
                    <p className="record-title">
                      {exerciseNameMap.get(record.exercise_id) ?? `动作 ${record.exercise_id}`}
                    </p>
                    <p className="record-meta">记录 ID：{record.id}</p>
                  </div>
                  <StatusBadge label="待上传" tone="muted" />
                </div>
                <label className="field">
                  <span>选择视频文件</span>
                  <input
                    type="file"
                    accept=".mp4,.avi,.mov,.mkv"
                    disabled={uploadMutation.isPending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }

                      uploadMutation.mutate({ recordId: record.id, file });
                      event.currentTarget.value = "";
                    }}
                  />
                  <small className="field-hint">
                    上传后将自动关联到当前训练记录，可在详情页继续预览或删除。
                  </small>
                </label>
                {uploadingRecordId === record.id ? (
                  <p className="field-hint">当前正在上传该记录的视频，请稍候。</p>
                ) : null}
                <div className="inline-actions">
                  <Link to={`/records/${record.id}`} className="button-secondary link-button">
                    查看详情
                  </Link>
                  <StatusBadge
                    label={uploadingRecordId === record.id ? "上传中" : "等待上传"}
                    tone={uploadingRecordId === record.id ? "warning" : "muted"}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
