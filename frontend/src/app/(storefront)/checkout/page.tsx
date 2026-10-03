"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/hooks/use-cart";
import { apiClient } from "@/lib/api-client";
import { useCustomerAuth } from "@/lib/auth/customer-auth";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "@/lib/form-errors";
import type { Order } from "@/types";

export default function CheckoutPage() {
  const { user, isLoading: authLoading } = useCustomerAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: cart, isLoading: cartLoading } = useCart();

  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/checkout");
    }
  }, [authLoading, user, router]);

  const checkout = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<{ data: Order }>("/checkout", {
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          shipping_address: shippingAddress,
        })
      ).data.data,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order placed");
      router.push(`/orders/${order.id}`);
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast.error(extractErrorMessage(error, "Could not place order"));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    checkout.mutate();
  }

  if (authLoading || cartLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!cart || cart.items.length === 0) {
    return <p className="text-muted-foreground">Your cart is empty — add something first.</p>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Shipping details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="recipient_name">Recipient name</Label>
              <Input
                id="recipient_name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                required
              />
              {errors.recipient_name && (
                <p className="text-sm text-destructive">{errors.recipient_name[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient_phone">Phone number</Label>
              <Input
                id="recipient_phone"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                required
              />
              {errors.recipient_phone && (
                <p className="text-sm text-destructive">{errors.recipient_phone[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shipping_address">Shipping address</Label>
              <Textarea
                id="shipping_address"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                required
              />
              {errors.shipping_address && (
                <p className="text-sm text-destructive">{errors.shipping_address[0]}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={checkout.isPending}>
              {checkout.isPending ? "Placing order…" : "Place order"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cart.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.product.name} × {item.quantity}
              </span>
              <span>${item.line_total.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-3 text-lg font-semibold">
            <span>Total</span>
            <span>${cart.total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
