import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { clearAccessToken } from "@/services/auth-storage";
import {
  changePassword,
  deleteAccount,
  getProfile,
  updateProfile,
} from "@/services/user-api";
import type {
  DeleteAccountValues,
  PasswordChangeValues,
  UserProfileUpdateValues,
} from "@/types/user";

const profileSchema = z.object({
  username: z
    .string()
    .min(3, "用户名长度至少 3 位")
    .max(50, "用户名长度不能超过 50 位")
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  email: z.string().email("请输入有效邮箱"),
});

const passwordSchema = z.object({
  old_password: z.string().min(1, "请输入原密码"),
  new_password: z
    .string()
    .min(8, "新密码至少 8 位")
    .refine((value) => /[A-Za-z]/.test(value), "新密码必须包含字母")
    .refine((value) => /\d/.test(value), "新密码必须包含数字"),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, "请输入当前密码以确认注销"),
});

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const profileQuery = useQuery({
    queryKey: ["user", "profile"],
    queryFn: getProfile,
  });
  const profileForm = useForm<UserProfileUpdateValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  });
  const passwordForm = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      old_password: "",
      new_password: "",
    },
  });
  const deleteAccountForm = useForm<DeleteAccountValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      password: "",
    },
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    profileForm.reset({
      username: profileQuery.data.username,
      email: profileQuery.data.email,
    });
  }, [profileForm, profileQuery.data]);

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: async (data) => {
      setProfileError("");
      setProfileMessage("资料已更新。");
      profileForm.reset({
        username: data.username,
        email: data.email,
      });
      await queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        setProfileError(error.response?.data?.detail ?? "资料更新失败");
        return;
      }

      setProfileError("资料更新失败");
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setPasswordError("");
      setPasswordMessage("密码修改成功。");
      passwordForm.reset();
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        setPasswordError(error.response?.data?.detail ?? "密码修改失败");
        return;
      }

      setPasswordError("密码修改失败");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      setDeleteError("");
      setDeleteMessage("账户已注销，正在返回登录页。");
      clearAccessToken();
      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 900);
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        setDeleteError(error.response?.data?.detail ?? "账户注销失败");
        return;
      }

      setDeleteError("账户注销失败");
    },
  });

  if (profileQuery.isLoading) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>个人中心</h2>
          </div>
        </header>
        <LoadingState message="正在加载个人资料..." />
      </section>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>个人中心</h2>
          </div>
        </header>
        <ErrorState message="请确认后端服务正常，且当前登录态有效。" />
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>个人中心</h2>
        </div>
      </header>
      <div className="panel-grid">
        <section className="panel">
          <h3>基本资料</h3>
          <form
            className="stack"
            onSubmit={profileForm.handleSubmit((values) => {
              setProfileMessage("");
              setProfileError("");
              profileMutation.mutate(values);
            })}
          >
            <label className="field">
              <span>用户名</span>
              <input type="text" {...profileForm.register("username")} />
              {profileForm.formState.errors.username ? (
                <small className="field-error">
                  {profileForm.formState.errors.username.message}
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>邮箱</span>
              <input type="email" {...profileForm.register("email")} />
              {profileForm.formState.errors.email ? (
                <small className="field-error">
                  {profileForm.formState.errors.email.message}
                </small>
              ) : null}
            </label>
            <p className="field-hint">用户 ID：{profileQuery.data.id}</p>
            {profileError ? <p className="form-error">{profileError}</p> : null}
            {profileMessage ? <p className="form-success">{profileMessage}</p> : null}
            <button
              type="submit"
              className="button-primary"
              disabled={profileMutation.isPending}
            >
              {profileMutation.isPending ? "保存中..." : "保存资料"}
            </button>
          </form>
        </section>
        <section className="panel">
          <h3>账户安全</h3>
          <form
            className="stack"
            onSubmit={passwordForm.handleSubmit((values) => {
              setPasswordMessage("");
              setPasswordError("");
              passwordMutation.mutate(values);
            })}
          >
            <label className="field">
              <span>原密码</span>
              <input type="password" {...passwordForm.register("old_password")} />
              {passwordForm.formState.errors.old_password ? (
                <small className="field-error">
                  {passwordForm.formState.errors.old_password.message}
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>新密码</span>
              <input type="password" {...passwordForm.register("new_password")} />
              {passwordForm.formState.errors.new_password ? (
                <small className="field-error">
                  {passwordForm.formState.errors.new_password.message}
                </small>
              ) : null}
            </label>
            <p className="field-hint">新密码至少 8 位，必须包含字母和数字。</p>
            {passwordError ? <p className="form-error">{passwordError}</p> : null}
            {passwordMessage ? (
              <p className="form-success">{passwordMessage}</p>
            ) : null}
            <button
              type="submit"
              className="button-primary"
              disabled={passwordMutation.isPending}
            >
              {passwordMutation.isPending ? "提交中..." : "修改密码"}
            </button>
          </form>
        </section>
        <section className="panel danger-panel">
          <h3>危险操作</h3>
          <form
            className="stack"
            onSubmit={deleteAccountForm.handleSubmit((values) => {
              setDeleteMessage("");
              setDeleteError("");
              if (!window.confirm("注销后账户和关联记录将被删除，确定继续吗？")) {
                return;
              }
              deleteAccountMutation.mutate(values);
            })}
          >
            <p>注销账户是不可恢复操作，会删除当前账户及其关联训练记录。</p>
            <label className="field">
              <span>确认密码</span>
              <input type="password" {...deleteAccountForm.register("password")} />
              {deleteAccountForm.formState.errors.password ? (
                <small className="field-error">
                  {deleteAccountForm.formState.errors.password.message}
                </small>
              ) : null}
            </label>
            {deleteError ? <p className="form-error">{deleteError}</p> : null}
            {deleteMessage ? <p className="form-success">{deleteMessage}</p> : null}
            <button
              type="submit"
              className="button-secondary button-danger"
              disabled={deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending ? "注销中..." : "注销账户"}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
