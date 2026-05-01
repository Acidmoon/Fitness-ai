export interface UserProfile {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfileUpdateValues {
  username?: string;
  email?: string;
}

export interface PasswordChangeValues {
  old_password: string;
  new_password: string;
}

export interface DeleteAccountValues {
  password: string;
}
