const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

function storeTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

let _refreshPromise: Promise<void> | null = null;

async function _doRefresh(): Promise<void> {
  const rt = getRefreshToken();
  if (!rt) throw new ApiError(401, "No refresh token");
  const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  });
  if (!res.ok) {
    clearTokens();
    throw new ApiError(401, "Session expired — please log in again");
  }
  const data = await res.json();
  storeTokens(data.access_token, data.refresh_token);
}

async function request<T>(path: string, init: RequestInit = {}, _retry = true): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && _retry) {
    // Deduplicate concurrent refresh attempts
    if (!_refreshPromise) {
      _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
    }
    try {
      await _refreshPromise;
      return request<T>(path, init, false);
    } catch {
      clearTokens();   // must clear before redirect — prevents loop
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "Session expired");
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    if (res.status === 401) clearTokens();
    throw new ApiError(res.status, body.detail ?? "Request failed");
  }
  return res.json();
}

export const api = {
  auth: {
    login: async (email: string, password: string) => {
      const data = await request<{ access_token: string; refresh_token: string }>(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
        false,
      );
      storeTokens(data.access_token, data.refresh_token);
      return data;
    },

    register: async (name: string, email: string, password: string, role: "client" | "consultant") => {
      const data = await request<{ access_token: string; refresh_token: string }>(
        "/api/v1/auth/register",
        { method: "POST", body: JSON.stringify({ name, email, password, role }) },
        false,
      );
      storeTokens(data.access_token, data.refresh_token);
      return data;
    },

    me: () =>
      request<{ id: string; email: string; name: string; role: string }>("/api/v1/auth/me"),

    updateMe: (name: string) =>
      request<{ id: string; email: string; name: string; role: string }>(
        "/api/v1/auth/me",
        { method: "PATCH", body: JSON.stringify({ name }) },
      ),

    logout: () => clearTokens(),
  },

  clients: {
    me:          ()            => request<Client>("/api/v1/clients/me"),
    list:        ()            => request<Client[]>("/api/v1/clients"),
    get:         (id: string)  => request<Client>(`/api/v1/clients/${id}`),
    unassigned:  ()            => request<Client[]>("/api/v1/clients/unassigned"),
    claim:       (email: string) =>
      request<Client>("/api/v1/clients/claim", { method: "POST", body: JSON.stringify({ email }) }),
    update:      (id: string, body: Partial<ClientProfileUpdate>) =>
      request<Client>(`/api/v1/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  logs: {
    list: (days = 7, log_type?: string, limit = 50, before?: string) => {
      const p = new URLSearchParams({ days: String(days), limit: String(limit) });
      if (log_type) p.set("log_type", log_type);
      if (before) p.set("before", before);
      return request<LogPage>(`/api/v1/logs?${p}`);
    },
    create: (log_type: string, payload: Record<string, unknown>, logged_at?: string) =>
      request<{ id: string; logged_at: string }>("/api/v1/logs", {
        method: "POST",
        body: JSON.stringify({ log_type, payload, logged_at }),
      }),
    forClient: (clientId: string, days = 30, log_type?: string, limit = 50, before?: string) => {
      const p = new URLSearchParams({ days: String(days), limit: String(limit) });
      if (log_type) p.set("log_type", log_type);
      if (before) p.set("before", before);
      return request<LogPage>(`/api/v1/logs/client/${clientId}?${p}`);
    },
  },

  plans: {
    list:   (clientId: string) => request<Plan[]>(`/api/v1/plans?client_id=${clientId}`),
    create: (body: CreatePlanBody) =>
      request<Plan>("/api/v1/plans", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { content?: PlanContent; valid_from?: string; valid_to?: string }) =>
      request<Plan>(`/api/v1/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  ai: {
    chat: (message: string, opts: { ingredients?: string[]; session_id?: string; on_behalf_of_client_id?: string } = {}) =>
      request<{ session_id: string; reply: string }>("/api/v1/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, ...opts }),
      }),

    analyzePhoto: (image_b64: string, opts: { mime_type?: string; save_log?: boolean; on_behalf_of_client_id?: string } = {}) =>
      request<PhotoAnalysisResponse>("/api/v1/ai/analyze-photo", {
        method: "POST",
        body: JSON.stringify({ image_b64, mime_type: opts.mime_type ?? "image/jpeg", ...opts }),
      }),
  },

  insights: {
    list: (clientId: string) =>
      request<{ client_id: string; insights: InsightCard[] }>(`/api/v1/insights/${clientId}`),
  },
};

// ── Shared types ───────────────────────────────────────────────────────────────
export interface PhotoAnalysisResponse {
  foods: Array<{
    name: string; portion: string; calories: number;
    protein_g: number; carbs_g: number; fat_g: number; confidence: string;
  }>;
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  log_id: string | null;
  note: string | null;
}

export interface InsightCard {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  action: string;
  metric?: Record<string, unknown>;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  profile: {
    dob?: string;
    height_cm?: number;
    weight_kg?: number;
    fitness_goal: string;
    dietary_restrictions: string[];
    macro_targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
    assigned_consultant_id: string;
    current_streak?: number;
    longest_streak?: number;
  } | null;
}

export interface ClientProfileUpdate {
  fitness_goal?: string;
  dietary_restrictions?: string[];
  macro_targets?: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  dob?: string;
  height_cm?: number;
  weight_kg?: number;
}

export interface HealthLog {
  id: string;
  log_type: "meal" | "activity" | "biometric";
  logged_at: string;
  payload: Record<string, unknown>;
}

export interface LogPage {
  data: HealthLog[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface Plan {
  id: string;
  client_id: string;
  plan_type: "meal" | "workout";
  valid_from: string;
  valid_to: string;
  content: PlanContent;
  version: number;
}

export interface PlanContent {
  days: PlanDay[];
}

export interface PlanDay {
  id: string;
  label: string;
  items: PlanItem[];
}

export interface PlanItem {
  id: string;
  time?: string;
  title: string;
  detail?: string;
  macros?: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}

export interface CreatePlanBody {
  client_id: string;
  plan_type: "meal" | "workout";
  valid_from: string;
  valid_to: string;
  content: PlanContent;
}
