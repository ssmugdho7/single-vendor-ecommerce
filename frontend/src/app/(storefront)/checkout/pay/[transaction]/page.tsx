"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/form-errors";

function FakePaymentContent() {
  const { transaction } = useParams<{ transaction: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const [resolved, setResolved] = useState(false);
  const queryClient = useQueryClient();

  const simulate = useMutation({
    mutationFn: async (outcome: "pay" | "cancel") =>
      apiClient.post(`/payments/fake/${transaction}/${outcome}`),
    onSuccess: (_response, outcome) => {
      setResolved(true);
      if (orderId) {
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
      toast[outcome === "pay" ? "success" : "error"](
        outcome === "pay" ? "Payment successful" : "Payment failed",
      );
    },
    onError: (error) => toast.error(extractErrorMessage(error, "Could not process payment")),
  });

  return (
    <Card className="mx-auto mt-12 max-w-md">
      <CardHeader>
        <CardTitle>Simulated checkout</CardTitle>
        <CardDescription>
          This stands in for a real payment gateway&apos;s hosted page. Transaction:{" "}
          <code className="text-xs">{transaction}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {resolved ? (
          <Button
            className="w-full"
            onClick={() => router.push(orderId ? `/orders/${orderId}` : "/orders")}
          >
            View order
          </Button>
        ) : (
          <>
            <Button
              className="w-full"
              disabled={simulate.isPending}
              onClick={() => simulate.mutate("pay")}
            >
              Simulate successful payment
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={simulate.isPending}
              onClick={() => simulate.mutate("cancel")}
            >
              Simulate failed payment
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function FakePaymentPage() {
  return (
    <Suspense>
      <FakePaymentContent />
    </Suspense>
  );
}
