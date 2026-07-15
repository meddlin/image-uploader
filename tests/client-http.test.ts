import { describe, expect, test } from "vitest";

import { readJsonResponse } from "@/components/client-http";

describe("readJsonResponse", () => {
  test("returns successful JSON payloads", async () => {
    const response = Response.json({ value: 42 });

    await expect(readJsonResponse<{ value: number }>(response, "Request failed.")).resolves.toEqual({ value: 42 });
  });

  test("uses an API error message when present", async () => {
    const response = Response.json({ error: "Invalid upload." }, { status: 400 });

    await expect(readJsonResponse(response, "Request failed.")).rejects.toThrow("Invalid upload.");
  });

  test("uses the fallback for JSON errors without a message", async () => {
    const response = Response.json({}, { status: 500 });

    await expect(readJsonResponse(response, "Request failed.")).rejects.toThrow("Request failed.");
  });

  test("describes non-JSON responses", async () => {
    const response = new Response("Proxy unavailable", {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "content-type": "text/plain" }
    });

    await expect(readJsonResponse(response, "Request failed.")).rejects.toThrow(
      "Request failed. The server returned 502 Bad Gateway: Proxy unavailable"
    );
  });
});
