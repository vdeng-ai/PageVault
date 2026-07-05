export type Visibility = "public" | "private";
export type ItemStatus = "active" | "disabled" | "deleted";
export type DerivedStatus =
  | "active"
  | "private"
  | "disabled"
  | "deleted"
  | "url_expired"
  | "file_expired";

export interface HtmlItem {
  id: string;
  title: string;
  originalFilename: string;
  slug: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  visibility: Visibility;
  status: ItemStatus;
  derivedStatus: DerivedStatus;
  publicUrl: string;
  urlExpiresAt: string;
  fileExpiresAt: string;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListItemsResult {
  items: HtmlItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DashboardStats {
  total: number;
  publicCount: number;
  urlExpired: number;
  fileDeletingSoon: number;
  deleted: number;
}

export type BatchAction =
  | "extend_url"
  | "extend_file"
  | "set_url_expires_at"
  | "set_file_expires_at"
  | "set_public"
  | "set_private"
  | "disable"
  | "restore"
  | "delete";

export interface CurrentUser {
  authenticated: boolean;
  email?: string;
  csrfToken?: string;
}

let csrfToken: string | null = null;

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed";
    throw new Error(message);
  }
  return data as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (csrfToken && init.method && init.method !== "GET") {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(path, {
    ...init,
    headers
  });
  return parseResponse<T>(response);
}

export async function login(email: string, password: string): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  await me();
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  csrfToken = null;
}

export async function me(): Promise<CurrentUser> {
  const user = await request<CurrentUser>("/api/auth/me");
  csrfToken = user.csrfToken ?? null;
  return user;
}

export function dashboard(): Promise<DashboardStats> {
  return request<DashboardStats>("/api/admin/dashboard");
}

export function listItems(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  visibility?: string;
}): Promise<ListItemsResult> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).length > 0) {
      query.set(key, String(value));
    }
  }
  return request<ListItemsResult>(`/api/admin/items?${query.toString()}`);
}

export function getItem(id: string): Promise<HtmlItem> {
  return request<HtmlItem>(`/api/admin/items/${id}`);
}

export function uploadHtml(input: {
  file: File;
  urlExpireDays: number;
  fileExpireDays: number;
  visibility: Visibility;
}): Promise<{ id: string; title: string; slug: string; publicUrl: string; urlExpiresAt: string; fileExpiresAt: string }> {
  const body = new FormData();
  body.set("file", input.file);
  body.set("urlExpireDays", String(input.urlExpireDays));
  body.set("fileExpireDays", String(input.fileExpireDays));
  body.set("visibility", input.visibility);
  return request("/api/admin/items", {
    method: "POST",
    body
  });
}

export function updateItem(
  id: string,
  patch: Partial<Pick<HtmlItem, "title" | "visibility" | "status" | "urlExpiresAt" | "fileExpiresAt">>
): Promise<HtmlItem> {
  return request<HtmlItem>(`/api/admin/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export function deleteItem(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/admin/items/${id}`, {
    method: "DELETE"
  });
}

export function batchItems(input: {
  ids: string[];
  action: BatchAction;
  days?: number;
  urlExpiresAt?: string;
  fileExpiresAt?: string;
}): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }> {
  return request("/api/admin/items/batch", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
