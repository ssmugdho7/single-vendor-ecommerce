import { isAxiosError } from "axios";

export type FieldErrors = Record<string, string[]>;

/**
 * Pulls Laravel's `{ message, errors: { field: [...] } }` validation
 * payload out of a failed axios request, if that's what it is.
 */
export function extractFieldErrors(error: unknown): FieldErrors {
  if (isAxiosError(error) && error.response?.status === 422) {
    return (error.response.data?.errors as FieldErrors) ?? {};
  }

  return {};
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error) && typeof error.response?.data?.message === "string") {
    return error.response.data.message;
  }

  return fallback;
}
