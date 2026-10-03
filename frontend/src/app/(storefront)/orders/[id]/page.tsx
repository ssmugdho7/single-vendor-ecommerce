"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { useCustomerAuth } from "@/lib/auth/customer-auth";
import { extractErrorMessage } from "@/lib/form-errors";
import type { Order, Payment } from "@/types";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useCustomerAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?next=/orders/${id}`);
    }
  }, [authLoading, user, router, id]);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => (await apiClient.get<{ data: Order }>(`/orders/${id}`)).data.data,
    enabled: !!user,
    // Shipment creation happens in a queued job right after payment —
    // poll briefly so "paid" picks up "shipped" without a manual refresh.
    refetchInterval: (query) => (query.state.data?.status === "paid" ? 2000 : false),
  });

  const pay = useMutation({
    mutationFn: async () =>
      (await apiClient.post<{ payment: Payment }>(`/orders/${id}/pay`)).data,
    onSuccess: (data) => {
      router.push(`/checkout/pay/${data.payment.transaction_id}?order=${id}`);
    },
    onError: (error) => toast.error(extractErrorMessage(error, "Could not start payment")),
  });

  if (authLoading || isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!order) {
    return <p className="text-muted-foreground">Order not found.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order #{order.id}</h1>
        <StatusBadge status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.product?.name ?? "Deleted product"} × {item.quantity}
              </span>
              <span>${item.line_total.toFixed(2)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>${order.total_amount.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{order.recipient_name}</p>
          <p>{order.recipient_phone}</p>
          <p className="text-muted-foreground">{order.shipping_address}</p>
        </CardContent>
      </Card>

      {order.status === "pending_payment" && (
        <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
          {pay.isPending ? "Starting payment…" : "Pay now"}
        </Button>
      )}

      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{payment.transaction_id}</span>
                <StatusBadge status={payment.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.delivery && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{order.delivery.tracking_id}</span>
            <StatusBadge status={order.delivery.status} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
