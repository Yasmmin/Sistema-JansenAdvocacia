const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export const appEnv = {
  apiBaseUrl: rawApiBaseUrl.replace(/\/$/, ""),
  mode: import.meta.env.MODE,
  isDevelopment: import.meta.env.DEV,
} as const;
