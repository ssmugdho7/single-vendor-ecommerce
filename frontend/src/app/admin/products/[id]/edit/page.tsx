"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "@/lib/form-errors";
import type { Product } from "@/types";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: async () => (await apiClient.get<{ data: Product }>(`/admin/products/${id}`)).data.data,
  });

  const updateProduct = useMutation({
    mutationFn: async (values: ProductFormValues) =>
      apiClient.put(`/admin/products/${id}`, {
        category_id: values.category_id,
        name: values.name,
        description: values.description,
        price: values.price,
        is_active: values.is_active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success("Product updated");
      router.push("/admin/products");
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast.error(extractErrorMessage(error, "Could not update product"));
    },
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!product) {
    return <p className="text-muted-foreground">Product not found.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit product</h1>
      <ProductForm
        submitLabel="Save changes"
        showStockQuantity={false}
        initialValues={{
          category_id: product.category_id,
          name: product.name,
          description: product.description ?? "",
          price: String(product.price),
          is_active: product.is_active,
        }}
        isSubmitting={updateProduct.isPending}
        errors={errors}
        onSubmit={(values) => {
          setErrors({});
          updateProduct.mutate(values);
        }}
      />
    </div>
  );
}
