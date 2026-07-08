import { http } from "@/services/http";
import type { components } from "@/api/types";
import type { LoginFormValues, RegisterFormValues } from "@/types/auth";
import { setAccessToken, setRefreshToken } from "@/services/auth-storage";

type LoginTokenResponse = components["schemas"]["TokenWithRefresh"] & {
  refresh_token?: string;
};

export async function login(values: LoginFormValues) {
  const formData = new URLSearchParams();
  formData.set("username", values.username);
  formData.set("password", values.password);

  const { data } = await http.post<LoginTokenResponse>(
    "/api/auth/login",
    formData,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  if ("refresh_token" in data && data.refresh_token) {
    setRefreshToken(data.refresh_token);
  }
  setAccessToken(data.access_token);

  return data;
}

export async function register(values: RegisterFormValues) {
  const { data } = await http.post("/api/auth/register", values);
  return data;
}
