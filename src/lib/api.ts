import Constants from "expo-constants";
import Toast from "react-native-toast-message";

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (explicit) return explicit;

  const configured = Constants.expoConfig?.extra?.apiBaseUrl as
    | string
    | undefined;
  if (configured && configured !== "http://localhost:3000") return configured;

  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost") return `http://${host}:3000`;
  }
  return configured ?? "http://localhost:3000";
}

const baseUrl = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: { token?: string | null; init?: RequestInit; silent?: boolean } = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const headers = new Headers(opts.init?.headers);
  if (opts.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }
  if (
    opts.init?.body &&
    !headers.has("Content-Type") &&
    typeof opts.init.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, { ...opts.init, headers });
  } catch (err) {
    // Network-level failure (DNS, offline, etc.) — surface unless the
    // caller has opted out (e.g. screen renders its own error UI).
    if (!opts.silent) {
      Toast.show({
        type: "error",
        text1: "Connection error",
        text2: "Couldn't reach the server. Check your connection.",
      });
    }
    throw err;
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? `Request failed: ${res.status}`;
    // 401s come up routinely on token-expiry races; let those resolve
    // silently via Clerk's refresh. Surface 4xx/5xx that the user can
    // actually act on.
    if (!opts.silent && res.status !== 401) {
      Toast.show({
        type: "error",
        text1:
          res.status >= 500 ? "Server error" : "Request failed",
        text2: message,
      });
    }
    throw new ApiError(res.status, body, message);
  }

  return body as T;
}

export type UploadOptions = {
  token?: string | null;
  fieldName?: string;
  fileName?: string;
  mimeType?: string;
};

export async function apiUpload<T = unknown>(
  path: string,
  fileUri: string,
  opts: UploadOptions = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const fieldName = opts.fieldName ?? "files";
  const fileName = opts.fileName ?? "recording.m4a";
  const mimeType = opts.mimeType ?? "audio/m4a";

  const formData = new FormData();
  // React Native's FormData accepts the { uri, name, type } shape — it sets
  // the multipart boundary itself. Don't set Content-Type manually.
  formData.append(fieldName, {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const headers = new Headers();
  if (opts.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData as unknown as BodyInit,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `Upload failed: ${res.status}`;
    throw new ApiError(res.status, body, message);
  }

  return body as T;
}

export { baseUrl as apiBaseUrl };
