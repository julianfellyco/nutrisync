import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("access_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Request failed");
  }

  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ access_token: string; refresh_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    register: (name: string, email: string, password: string, role: string) =>
      request<{ access_token: string; refresh_token: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      }),

    me: () => request<{ id: string; email: string; name: string; role: string }>("/api/v1/auth/me"),
  },

  logs: {
    create: (log_type: string, payload: Record<string, unknown>, logged_at?: string) =>
      request<{ id: string; logged_at: string }>("/api/v1/logs", {
        method: "POST",
        body: JSON.stringify({ log_type, payload, logged_at }),
      }),

    list: (days = 7, log_type?: string, limit = 50, before?: string) => {
      const params = new URLSearchParams({ days: String(days), limit: String(limit) });
      if (log_type) params.set("log_type", log_type);
      if (before) params.set("before", before);
      return request<{ data: unknown[]; next_cursor: string | null; has_more: boolean }>(
        `/api/v1/logs?${params}`,
      );
    },
  },

  ai: {
    chat: (message: string, ingredients: string[] = [], session_id?: string) =>
      request<{ session_id: string; reply: string }>("/api/v1/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, ingredients, session_id }),
      }),

    analyzePhoto: (
      image_b64: string,
      opts: { mime_type?: string; save_log?: boolean } = {},
    ) =>
      request<{
        foods: Array<{ name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; confidence: string }>;
        totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
        log_id: string | null;
        note: string | null;
      }>("/api/v1/ai/analyze-photo", {
        method: "POST",
        body: JSON.stringify({
          image_b64,
          mime_type: opts.mime_type ?? "image/jpeg",
          save_log: opts.save_log ?? false,
        }),
      }),
  },
};
