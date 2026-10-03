"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useCustomerAuth } from "@/lib/auth/customer-auth";

export function Navbar() {
  const { user, isLoading, logout } = useCustomerAuth();
  const { data: cart } = useCart();
  const router = useRouter();
  const itemCount = cart?.items.length ?? 0;

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Single Vendor Store
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:underline">
            Products
          </Link>

          {user && (
            <Link href="/orders" className="hover:underline">
              Orders
            </Link>
          )}

          <Link href="/cart" className="hover:underline">
            Cart{itemCount > 0 ? ` (${itemCount})` : ""}
          </Link>

          {isLoading ? null : user ? (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">{user.name}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login" className="hover:underline">
                Login
              </Link>
              <Link href="/register" className="hover:underline">
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
