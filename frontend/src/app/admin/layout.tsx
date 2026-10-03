import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminAuthProvider } from "@/lib/auth/admin-auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminGuard>
        <div className="flex min-h-screen">
          <AdminSidebar />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </AdminGuard>
    </AdminAuthProvider>
  );
}
