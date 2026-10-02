import { appEnv } from "@/config/env";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${appEnv.apiBaseUrl}${normalizedPath}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), { credentials: "include", ...init });
  if (response.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("jansen:unauthorized"));
  return response;
}
