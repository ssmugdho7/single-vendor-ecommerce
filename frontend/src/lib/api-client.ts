import axios from "axios";

export const CUSTOMER_TOKEN_KEY = "storefront_token";
export const ADMIN_TOKEN_KEY = "admin_token";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    Accept: "application/json",
  },
});

function isAdminRequest(url?: string): boolean {
  return Boolean(url?.replace(apiClient.defaults.baseURL ?? "", "").startsWith("/admin"));
}

apiClient.interceptors.request.use((config) => {
  if (typeof window === "undefined") {
    return config;
  }

  const tokenKey = isAdminRequest(config.url) ? ADMIN_TOKEN_KEY : CUSTOMER_TOKEN_KEY;
  const token = window.localStorage.getItem(tokenKey);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && error.response?.status === 401) {
      const admin = isAdminRequest(error.config?.url);
      window.localStorage.removeItem(admin ? ADMIN_TOKEN_KEY : CUSTOMER_TOKEN_KEY);

      const loginPath = admin ? "/admin/login" : "/login";
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }

    return Promise.reject(error);
  },
);
