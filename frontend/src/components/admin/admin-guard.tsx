"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminAuth } from "@/lib/auth/admin-auth";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAdminAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user && pathname !== "/admin/login") {
      router.push("/admin/login");
    }
  }, [isLoading, user, pathname, router]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (isLoading || !user) {
    return <p className="p-8 text-muted-foreground">Loading…</p>;
  }

  return <>{children}</>;
}
