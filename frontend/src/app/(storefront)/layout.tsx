import { Navbar } from "@/components/storefront/navbar";
import { CustomerAuthProvider } from "@/lib/auth/customer-auth";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerAuthProvider>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Single Vendor Store — demo storefront
      </footer>
    </CustomerAuthProvider>
  );
}
