import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  batchDeleteRecords,
  createRecord,
  deleteRecord,
  getExercises,
  getRecords,
  updateRecord,
} from "@/services/exercise-api";
import type {
  ExerciseRecord,
  ExerciseRecordFormValues,
} from "@/types/exercise";
import { extractApiErrorMessage } from "@/utils/error";

const filterSchema = z.object({
  exerciseId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

const recordSchema = z.object({
  exercise_id: z.coerce.number().int().positive("请选择动作"),
  score: z.coerce.number().min(0, "分数不能小于 0").max(100, "分数不能大于 100"),
  count: z.coerce.number().int().min(0, "次数不能小于 0"),
  duration: z.coerce.number().int().min(0, "时长不能小于 0"),
  heart_rate_avg: z.union([z.coerce.number().min(0), z.nan()]).optional(),
  heart_rate_max: z.union([z.coerce.number().min(0), z.nan()]).optional(),
});

function toOptionalNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function formatRecordTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function RecordsPage() {
  const queryClient = useQueryClient();
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | undefined>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExerciseRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [drawerError, setDrawerError] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const exercisesQuery = useQuery({
    queryKey: ["exercise", "catalog"],
    queryFn: getExercises,
  });
  const recordsQuery = useQuery({
    queryKey: ["exercise", "records", selectedExerciseId, startDate, endDate],
    queryFn: () =>
      getRecords({
        exerciseId: selectedExerciseId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });
  const filterForm = useForm({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      exerciseId: "",
      startDate: "",
      endDate: "",
    },
  });
  const recordForm = useForm<ExerciseRecordFormValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: {
      exercise_id: 0,
      score: 80,
      count: 10,
      duration: 60,
      heart_rate_avg: null,
      heart_rate_max: null,
    },
  });

  const exerciseNameMap = useMemo(() => {
    const map = new Map<number, string>();

    for (const item of exercisesQuery.data ?? []) {
      map.set(item.id, item.name);
    }

    return map;
  }, [exercisesQuery.data]);

  useEffect(() => {
    const currentRecordIds = new Set((recordsQuery.data ?? []).map((record) => record.id));
    setSelectedRecordIds((prev) => prev.filter((id) => currentRecordIds.has(id)));
  }, [recordsQuery.data]);

  const hasActiveFilters = Boolean(selectedExerciseId || startDate || endDate);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingRecord(null);
    setDrawerError("");
  }

  function openCreateDrawer() {
    setEditingRecord(null);
    setDrawerError("");
    setPageMessage("");
    setPageError("");
    recordForm.reset({
      exercise_id: exercisesQuery.data?.[0]?.id ?? 0,
      score: 80,
      count: 10,
      duration: 60,
      heart_rate_avg: null,
      heart_rate_max: null,
    });
    setDrawerOpen(true);
  }

  function openEditDrawer(record: ExerciseRecord) {
    setEditingRecord(record);
    setDrawerError("");
    setPageMessage("");
    setPageError("");
    recordForm.reset({
      exercise_id: record.exercise_id,
      score: record.score,
      count: record.count,
      duration: record.duration,
      heart_rate_avg: record.heart_rate_avg,
      heart_rate_max: null,
    });
    setDrawerOpen(true);
  }

  const createMutation = useMutation({
    mutationFn: createRecord,
    onSuccess: async () => {
      setDrawerError("");
      setPageError("");
      setPageMessage("记录创建成功。");
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
      closeDrawer();
    },
    onError: (error) => {
      setDrawerError(extractApiErrorMessage(error, "创建记录失败"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      recordId,
      values,
    }: {
      recordId: number;
      values: Partial<ExerciseRecordFormValues>;
    }) => updateRecord(recordId, values),
    onSuccess: async () => {
      setDrawerError("");
      setPageError("");
      setPageMessage("记录更新成功。");
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
      closeDrawer();
    },
    onError: (error) => {
      setDrawerError(extractApiErrorMessage(error, "更新记录失败"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecord,
    onSuccess: async (_, recordId) => {
      setPageError("");
      setPageMessage("记录删除成功。");
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
      setSelectedRecordIds((prev) => prev.filter((id) => id !== recordId));
    },
    onError: () => {
      setPageMessage("");
      setPageError("删除记录失败，请稍后重试。");
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteRecords,
    onSuccess: async () => {
      setPageError("");
      setPageMessage(`已删除 ${selectedRecordIds.length} 条训练记录。`);
      await queryClient.invalidateQueries({ queryKey: ["exercise", "records"] });
      setSelectedRecordIds([]);
    },
    onError: () => {
      setPageMessage("");
      setPageError("批量删除失败，请稍后重试。");
    },
  });

  function toggleRecordSelection(recordId: number) {
    setSelectedRecordIds((prev) =>
      prev.includes(recordId)
        ? prev.filter((id) => id !== recordId)
        : [...prev, recordId]
    );
  }

  function handleDeleteRecord(recordId: number) {
    setPageMessage("");
    setPageError("");
    if (!window.confirm("确定要删除这条训练记录吗？")) {
      return;
    }

    deleteMutation.mutate(recordId);
  }

  function handleBatchDelete() {
    if (!selectedRecordIds.length) {
      return;
    }

    setPageMessage("");
    setPageError("");
    if (
      !window.confirm(`确定要删除选中的 ${selectedRecordIds.length} 条训练记录吗？`)
    ) {
      return;
    }

    batchDeleteMutation.mutate(selectedRecordIds);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Records</p>
          <h2>训练记录</h2>
        </div>
        <button className="button-primary" type="button" onClick={openCreateDrawer}>
          新增记录
        </button>
      </header>

      <div className="panel-grid records-layout">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>筛选区</h3>
              <p>按动作与日期范围收窄结果，便于聚焦近期训练表现。</p>
            </div>
            <StatusBadge
              label={hasActiveFilters ? "已应用筛选" : "全部记录"}
              tone={hasActiveFilters ? "warning" : "muted"}
            />
          </div>
          <form
            className="stack"
            onSubmit={filterForm.handleSubmit((values) => {
              setSelectedExerciseId(
                values.exerciseId ? Number(values.exerciseId) : undefined
              );
              setStartDate(values.startDate);
              setEndDate(values.endDate);
            })}
          >
            <label className="field">
              <span>动作</span>
              <select {...filterForm.register("exerciseId")}>
                <option value="">全部动作</option>
                {(exercisesQuery.data ?? []).map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>开始日期</span>
              <input type="date" {...filterForm.register("startDate")} />
            </label>
            <label className="field">
              <span>结束日期</span>
              <input type="date" {...filterForm.register("endDate")} />
            </label>
            <p className="field-hint">当前筛选会实时影响记录列表和批量操作范围。</p>
            <div className="inline-actions">
              <button type="submit" className="button-primary">
                应用筛选
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  filterForm.reset({
                    exerciseId: "",
                    startDate: "",
                    endDate: "",
                  });
                  setSelectedExerciseId(undefined);
                  setStartDate("");
                  setEndDate("");
                }}
              >
                清空
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h3>记录列表</h3>
              <p>按训练记录组织日常表现，并支持筛选、编辑和批量清理。</p>
            </div>
            <StatusBadge label={`${recordsQuery.data?.length ?? 0} 条记录`} tone="muted" />
          </div>
          {pageMessage ? <p className="form-success">{pageMessage}</p> : null}
          {pageError ? <p className="form-error">{pageError}</p> : null}
          <div className="records-toolbar">
            <span>已选择 {selectedRecordIds.length} 条</span>
            <div className="inline-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={!selectedRecordIds.length}
                onClick={() => setSelectedRecordIds([])}
              >
                清空选择
              </button>
              <button
                type="button"
                className="button-secondary button-danger"
                disabled={!selectedRecordIds.length || batchDeleteMutation.isPending}
                onClick={handleBatchDelete}
              >
                {batchDeleteMutation.isPending ? "删除中..." : "批量删除"}
              </button>
            </div>
          </div>
          {recordsQuery.isLoading ? <LoadingState message="正在加载训练记录..." /> : null}
          {recordsQuery.isError ? (
            <ErrorState message="训练记录加载失败，请确认已登录且后端已启动。" />
          ) : null}
          {!recordsQuery.isLoading &&
          !recordsQuery.isError &&
          (recordsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="暂无训练记录"
              message={
                hasActiveFilters ? "当前筛选条件下没有匹配的训练记录。" : "现在还没有训练记录。"
              }
            />
          ) : null}
          {recordsQuery.data?.length ? (
            <div className="records-list">
              {recordsQuery.data.map((record) => (
                <article className="record-card" key={record.id}>
                  <div className="record-card-top">
                    <div className="record-card-title-row">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedRecordIds.includes(record.id)}
                          onChange={() => toggleRecordSelection(record.id)}
                        />
                      </label>
                      <div>
                        <p className="record-title">
                          {exerciseNameMap.get(record.exercise_id) ??
                            `动作 ${record.exercise_id}`}
                        </p>
                        <p className="record-meta">
                          {formatRecordTime(record.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="inline-actions">
                      <StatusBadge
                        label={record.video_url ? "已关联视频" : "待上传视频"}
                        tone={record.video_url ? "success" : "muted"}
                      />
                      <Link to={`/records/${record.id}`} className="button-secondary link-button">
                        详情
                      </Link>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => openEditDrawer(record)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="button-secondary button-danger"
                        onClick={() => handleDeleteRecord(record.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="record-metrics">
                    <span>{record.score} 分</span>
                    <span>{record.count} 次</span>
                    <span>{record.duration} 秒</span>
                    <span>{record.video_url ? "已有关联视频" : "暂无视频"}</span>
                    <span>
                      {record.heart_rate_avg ? `均心率 ${record.heart_rate_avg}` : "无心率"}
                    </span>
                  </div>
                  <p className="record-feedback">
                    {record.feedback?.trim() ? record.feedback : "暂无反馈"}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {drawerOpen ? (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <section className="drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">{editingRecord ? "Edit" : "Create"}</p>
                <h3>{editingRecord ? "编辑训练记录" : "新增训练记录"}</h3>
              </div>
              <button
                type="button"
              className="button-secondary"
                onClick={closeDrawer}
              >
                关闭
              </button>
            </div>
            <form
              className="stack"
              onSubmit={recordForm.handleSubmit((values) => {
                setDrawerError("");
                setPageMessage("");
                setPageError("");
                const payload: ExerciseRecordFormValues = {
                  exercise_id: values.exercise_id,
                  score: values.score,
                  count: values.count,
                  duration: values.duration,
                  heart_rate_avg: toOptionalNumber(values.heart_rate_avg),
                  heart_rate_max: toOptionalNumber(values.heart_rate_max),
                };

                if (editingRecord) {
                  updateMutation.mutate({
                    recordId: editingRecord.id,
                    values: payload,
                  });
                  return;
                }

                createMutation.mutate(payload);
              })}
            >
              <label className="field">
                <span>动作</span>
                <select {...recordForm.register("exercise_id")}>
                  <option value={0}>请选择动作</option>
                  {(exercisesQuery.data ?? []).map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
                {recordForm.formState.errors.exercise_id ? (
                  <small className="field-error">
                    {recordForm.formState.errors.exercise_id.message}
                  </small>
                ) : null}
              </label>
              <label className="field">
                <span>分数</span>
                <input type="number" step="0.1" {...recordForm.register("score")} />
                {recordForm.formState.errors.score ? (
                  <small className="field-error">
                    {recordForm.formState.errors.score.message}
                  </small>
                ) : null}
              </label>
              <label className="field">
                <span>次数</span>
                <input type="number" {...recordForm.register("count")} />
                {recordForm.formState.errors.count ? (
                  <small className="field-error">
                    {recordForm.formState.errors.count.message}
                  </small>
                ) : null}
              </label>
              <label className="field">
                <span>时长（秒）</span>
                <input type="number" {...recordForm.register("duration")} />
                {recordForm.formState.errors.duration ? (
                  <small className="field-error">
                    {recordForm.formState.errors.duration.message}
                  </small>
                ) : null}
              </label>
              <label className="field">
                <span>平均心率</span>
                <input type="number" {...recordForm.register("heart_rate_avg")} />
                <small className="field-hint">可选字段，无数据时可留空。</small>
              </label>
              <label className="field">
                <span>最大心率</span>
                <input type="number" {...recordForm.register("heart_rate_max")} />
                <small className="field-hint">可选字段，无数据时可留空。</small>
              </label>
              <p className="field-hint">
                AI 反馈由视频姿态分析生成，不能在训练记录表单中手工修改。
              </p>
              {drawerError ? <p className="form-error">{drawerError}</p> : null}
              <button
                type="submit"
                className="button-primary"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "提交中..."
                  : editingRecord
                    ? "保存修改"
                    : "创建记录"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
