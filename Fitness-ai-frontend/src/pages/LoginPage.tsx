import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { StatusBadge } from "@/components/StatusBadge";
import { login } from "@/services/auth-api";
import { setAccessToken } from "@/services/auth-storage";
import type { LoginFormValues } from "@/types/auth";
import { extractApiErrorMessage } from "@/utils/error";

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState("");
  const from =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      setSubmitError("");
      const data = await login(values);
      setAccessToken(data.access_token);
      navigate(from, { replace: true });
    } catch (error) {
      setSubmitError(extractApiErrorMessage(error, "登录失败，请稍后重试"));
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero auth-hero-rich">
        <div className="auth-hero-top">
          <p className="eyebrow">Fitness AI</p>
          <h1>校园训练数据面板</h1>
          <p>
            用统一的训练驾驶舱串起记录、统计、视频与后续 AI 分析，不再把训练数据散落在不同页面。
          </p>
        </div>
        <div className="auth-badges">
          <StatusBadge label="记录管理" tone="success" />
          <StatusBadge label="趋势统计" tone="warning" />
          <StatusBadge label="视频中心" tone="muted" />
        </div>
        <div className="auth-feature-grid">
          <article className="auth-feature-card">
            <strong>训练记录</strong>
            <span>增删改查、筛选、详情和视频关联。</span>
          </article>
          <article className="auth-feature-card">
            <strong>统计分析</strong>
            <span>近期趋势、分类结构和个人最佳表现。</span>
          </article>
          <article className="auth-feature-card">
            <strong>AI 预留</strong>
            <span>后续在现有视频链路上继续接分析状态与结果。</span>
          </article>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-card-header">
          <p className="eyebrow">Login</p>
          <h2>登录</h2>
          <p>输入账号后直接进入训练驾驶舱。</p>
        </div>
        <form className="stack" onSubmit={handleSubmit(onSubmit)}>
          <label className="field">
            <span>用户名</span>
            <input type="text" placeholder="请输入用户名" {...register("username")} />
            {errors.username ? (
              <small className="field-error">{errors.username.message}</small>
            ) : null}
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              placeholder="请输入密码"
              {...register("password")}
            />
            {errors.password ? (
              <small className="field-error">{errors.password.message}</small>
            ) : null}
          </label>
          {submitError ? <p className="form-error">{submitError}</p> : null}
          <button type="submit" className="button-primary" disabled={isSubmitting}>
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </form>
        <p className="auth-switch">
          还没有账号？ <Link to="/register">去注册</Link>
        </p>
      </section>
    </div>
  );
}
