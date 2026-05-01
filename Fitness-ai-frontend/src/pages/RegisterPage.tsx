import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { StatusBadge } from "@/components/StatusBadge";
import { register as registerUser } from "@/services/auth-api";
import type { RegisterFormValues } from "@/types/auth";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "用户名长度至少 3 位")
    .max(50, "用户名长度不能超过 50 位")
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  email: z.string().email("请输入有效邮箱"),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .refine((value) => /[A-Za-z]/.test(value), "密码必须包含字母")
    .refine((value) => /\d/.test(value), "密码必须包含数字"),
});

export function RegisterPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    try {
      setSubmitError("");
      setSubmitSuccess("");
      await registerUser(values);
      setSubmitSuccess("注册成功，请直接登录。");
      reset();
      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 800);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setSubmitError(error.response?.data?.detail ?? "注册失败，请稍后重试");
        return;
      }

      setSubmitError("注册失败，请稍后重试");
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero auth-hero-rich">
        <div className="auth-hero-top">
          <p className="eyebrow">Create Account</p>
          <h1>建立你的训练档案</h1>
          <p>
            注册后即可开始记录动作表现、管理训练视频，并逐步形成自己的训练数据闭环。
          </p>
        </div>
        <div className="auth-badges">
          <StatusBadge label="用户名规范" tone="muted" />
          <StatusBadge label="邮箱验证" tone="success" />
          <StatusBadge label="密码强度" tone="warning" />
        </div>
        <div className="auth-feature-grid">
          <article className="auth-feature-card">
            <strong>用户名规则</strong>
            <span>3-50 位，仅允许字母、数字和下划线。</span>
          </article>
          <article className="auth-feature-card">
            <strong>邮箱规则</strong>
            <span>使用有效邮箱，便于保持资料完整性。</span>
          </article>
          <article className="auth-feature-card">
            <strong>密码规则</strong>
            <span>至少 8 位，并且必须同时包含字母和数字。</span>
          </article>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-card-header">
          <p className="eyebrow">Register</p>
          <h2>注册</h2>
          <p>先创建账户，再进入训练驾驶舱开始记录与分析。</p>
        </div>
        <form className="stack" onSubmit={handleSubmit(onSubmit)}>
          <label className="field">
            <span>用户名</span>
            <input
              type="text"
              placeholder="3-50 位，字母数字下划线"
              {...register("username")}
            />
            {errors.username ? (
              <small className="field-error">{errors.username.message}</small>
            ) : null}
          </label>
          <label className="field">
            <span>邮箱</span>
            <input type="email" placeholder="请输入邮箱" {...register("email")} />
            {errors.email ? (
              <small className="field-error">{errors.email.message}</small>
            ) : null}
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              placeholder="至少 8 位，包含字母和数字"
              {...register("password")}
            />
            {errors.password ? (
              <small className="field-error">{errors.password.message}</small>
            ) : null}
          </label>
          <p className="field-hint">密码至少 8 位，且必须同时包含字母和数字。</p>
          {submitError ? <p className="form-error">{submitError}</p> : null}
          {submitSuccess ? <p className="form-success">{submitSuccess}</p> : null}
          <button type="submit" className="button-primary" disabled={isSubmitting}>
            {isSubmitting ? "注册中..." : "注册"}
          </button>
        </form>
        <p className="auth-switch">
          已有账号？ <Link to="/login">去登录</Link>
        </p>
      </section>
    </div>
  );
}
