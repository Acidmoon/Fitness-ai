import { http } from "@/services/http";
import type {
  LoginFormValues,
  RegisterFormValues,
  TokenResponse,
} from "@/types/auth";

export async function login(values: LoginFormValues) {
  const formData = new URLSearchParams();
  formData.set("username", values.username);
  formData.set("password", values.password);

  const { data } = await http.post<TokenResponse>("/api/auth/login", formData, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return data;
}

export async function register(values: RegisterFormValues) {
  const { data } = await http.post("/api/auth/register", values);
  return data;
}
