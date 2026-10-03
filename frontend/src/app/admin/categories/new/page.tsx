"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CategoryForm, type CategoryFormValues } from "@/components/admin/category-form";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "@/lib/form-errors";

export default function NewCategoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldErrors>({});

  const createCategory = useMutation({
    mutationFn: async (values: CategoryFormValues) => apiClient.post("/admin/categories", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast.success("Category created");
      router.push("/admin/categories");
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast.error(extractErrorMessage(error, "Could not create category"));
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New category</h1>
      <CategoryForm
        submitLabel="Create category"
        isSubmitting={createCategory.isPending}
        errors={errors}
        onSubmit={(values) => {
          setErrors({});
          createCategory.mutate(values);
        }}
      />
    </div>
  );
}
