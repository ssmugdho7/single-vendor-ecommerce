"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useCustomerAuth } from "@/lib/auth/customer-auth";
import type { Cart } from "@/types";

export function useCart() {
  const { user } = useCustomerAuth();

  return useQuery({
    queryKey: ["cart"],
    queryFn: async () => (await apiClient.get<{ data: Cart }>("/cart")).data.data,
    enabled: !!user,
  });
}
