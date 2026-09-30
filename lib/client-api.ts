export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** All requests are bounded so a disconnected server never locks the editor. */
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(
    path === "/api/coach" && options?.method?.toUpperCase() === "POST"
      ? 50_000
      : 15_000,
  );
  try {
    const response = await fetch(path, {
      ...options,
      signal: options?.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "The server could not complete this request. Your input is still here; please retry.";
      throw new ApiError(message, response.status);
    }
    if (data === null)
      throw new ApiError(
        "The server returned an unreadable response. Please retry.",
        response.status,
      );
    return data as T;
  } catch (error) {
    if (timeout.aborted)
      throw new ApiError(
        "The request timed out. Your input is still here; please retry.",
        408,
      );
    if (error instanceof TypeError)
      throw new ApiError(
        "Could not connect. Your input is still here; check your connection and retry.",
        0,
      );
    throw error;
  }
}
