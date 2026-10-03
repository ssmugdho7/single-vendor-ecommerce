"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/lib/auth/admin-auth";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuth();

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.push("/admin/login");
  }

  return (
    <aside className="flex w-56 flex-col gap-1 border-r p-4">
      <p className="mb-4 px-3 font-semibold">Admin</p>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            pathname.startsWith(link.href) ? "bg-muted font-medium" : "hover:bg-muted",
          )}
        >
          {link.label}
        </Link>
      ))}
      <div className="mt-auto space-y-2 pt-4">
        <p className="px-3 text-xs text-muted-foreground">{user.name}</p>
        <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </aside>
  );
}
