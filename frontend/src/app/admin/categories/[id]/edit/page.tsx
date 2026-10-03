"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CategoryForm, type CategoryFormValues } from "@/components/admin/category-form";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "@/lib/form-errors";
import type { Category } from "@/types";

export default function EditCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const { data: category, isLoading } = useQuery({
    queryKey: ["admin", "category", id],
    queryFn: async () =>
      (await apiClient.get<{ data: Category }>(`/admin/categories/${id}`)).data.data,
  });

  const updateCategory = useMutation({
    mutationFn: async (values: CategoryFormValues) =>
      apiClient.put(`/admin/categories/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast.success("Category updated");
      router.push("/admin/categories");
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast.error(extractErrorMessage(error, "Could not update category"));
    },
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!category) {
    return <p className="text-muted-foreground">Category not found.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit category</h1>
      <CategoryForm
        submitLabel="Save changes"
        initialValues={{ name: category.name, description: category.description ?? "" }}
        isSubmitting={updateCategory.isPending}
        errors={errors}
        onSubmit={(values) => {
          setErrors({});
          updateCategory.mutate(values);
        }}
      />
    </div>
  );
}
