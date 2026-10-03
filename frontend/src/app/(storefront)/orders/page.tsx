"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { useCustomerAuth } from "@/lib/auth/customer-auth";
import type { Order, Paginated } from "@/types";

function OrdersContent() {
  const { user, isLoading: authLoading } = useCustomerAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/orders");
    }
  }, [authLoading, user, router]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", page],
    queryFn: async () =>
      (await apiClient.get<Paginated<Order>>("/orders", { params: { page } })).data,
    enabled: !!user,
  });

  if (authLoading || isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!orders || orders.data.length === 0) {
    return <p className="text-muted-foreground">You haven&apos;t placed any orders yet.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your orders</h1>

      <div className="space-y-3">
        {orders.data.map((order) => (
          <Link key={order.id} href={`/orders/${order.id}`}>
            <Card className="transition-colors hover:border-primary">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #{order.id}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">${order.total_amount.toFixed(2)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Pagination
        meta={orders.meta}
        page={page}
        onPageChange={(nextPage) => router.push(`/orders?page=${nextPage}`)}
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <OrdersContent />
    </Suspense>
  );
}
