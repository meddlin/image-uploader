type ErrorResponse = {
  error?: string;
};

export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as T;

    if (!response.ok) {
      const errorPayload = payload as ErrorResponse;
      throw new Error(errorPayload.error ?? fallbackMessage);
    }

    return payload;
  }

  const body = await response.text();
  const detail = body.trim().slice(0, 120);

  throw new Error(
    `${fallbackMessage} The server returned ${response.status} ${response.statusText || "with a non-JSON response"}${detail ? `: ${detail}` : "."}`
  );
}

