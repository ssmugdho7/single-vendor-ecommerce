"use client";

import { CUSTOMER_TOKEN_KEY } from "@/lib/api-client";
import { createAuthContext } from "@/lib/auth/create-auth-context";
import type { User } from "@/types";

export const { AuthProvider: CustomerAuthProvider, useAuth: useCustomerAuth } =
  createAuthContext<User>({
    storageKey: CUSTOMER_TOKEN_KEY,
    loginUrl: "/login",
    meUrl: "/me",
    logoutUrl: "/logout",
  });
