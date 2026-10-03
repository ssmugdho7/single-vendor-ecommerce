"use client";

import { ADMIN_TOKEN_KEY } from "@/lib/api-client";
import { createAuthContext } from "@/lib/auth/create-auth-context";
import type { User } from "@/types";

export const { AuthProvider: AdminAuthProvider, useAuth: useAdminAuth } =
  createAuthContext<User>({
    storageKey: ADMIN_TOKEN_KEY,
    loginUrl: "/admin/login",
    meUrl: "/admin/me",
    logoutUrl: "/admin/logout",
  });
