import { http } from "@/services/http";
import type {
  DeleteAccountValues,
  PasswordChangeValues,
  UserProfile,
  UserProfileUpdateValues,
} from "@/types/user";

export async function getProfile() {
  const { data } = await http.get<UserProfile>("/api/user/profile");
  return data;
}

export async function updateProfile(values: UserProfileUpdateValues) {
  const { data } = await http.put<UserProfile>("/api/user/profile", values);
  return data;
}

export async function changePassword(values: PasswordChangeValues) {
  const { data } = await http.put<{ message: string }>(
    "/api/user/password",
    values
  );
  return data;
}

export async function deleteAccount(values: DeleteAccountValues) {
  const { data } = await http.delete<{ message: string }>("/api/user/account", {
    data: values,
  });
  return data;
}
