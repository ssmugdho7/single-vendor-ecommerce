"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "@/lib/form-errors";

export default function NewProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const createProduct = useMutation({
    mutationFn: async (values: ProductFormValues) => apiClient.post("/admin/products", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success("Product created");
      router.push("/admin/products");
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast.error(extractErrorMessage(error, "Could not create product"));
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New product</h1>
      <ProductForm
        submitLabel="Create product"
        showStockQuantity
        isSubmitting={createProduct.isPending}
        errors={errors}
        onSubmit={(values) => {
          setErrors({});
          createProduct.mutate(values);
        }}
      />
    </div>
  );
}
