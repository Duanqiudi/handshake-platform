import { describe, expect, it, vi } from "vitest";
import { HandshakeApiClient, HandshakeApiError } from "../src/api-client.js";

describe("HandshakeApiClient", () => {
  it("authenticates, sends JSON, and unwraps successful data", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { id: "capsule_1" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HandshakeApiClient({
      baseUrl: "https://handshake.example.test/api",
      ownerToken: "owner-token-test",
      fetch: fetchMock as typeof fetch,
    });

    await expect(client.post("/v1/me/capsules/import", { goal: "ship" })).resolves.toEqual({
      id: "capsule_1",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://handshake.example.test/api/v1/me/capsules/import");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: "Bearer owner-token-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ goal: "ship" }),
    });
  });

  it("does not send a content type or body for GET", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HandshakeApiClient({
      baseUrl: "http://127.0.0.1:3000",
      ownerToken: "test-token",
      fetch: fetchMock as typeof fetch,
    });
    await client.get("/v1/discovery/candidates");
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("content-type");
  });

  it("turns member API failures into stable, safe errors", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "CAPSULE_NOT_FOUND",
              message: "Capsule does not exist.",
              retryable: false,
            },
          }),
          { status: 404 },
        ),
    );
    const client = new HandshakeApiClient({
      baseUrl: "http://localhost:3000",
      ownerToken: "test-token",
      fetch: fetchMock as typeof fetch,
    });

    const failure = client.post("/v1/me/capsules/capsule_missing/publish");
    await expect(failure).rejects.toMatchObject({
      name: "HandshakeApiError",
      status: 404,
      code: "CAPSULE_NOT_FOUND",
      message: "Capsule does not exist.",
      retryable: false,
    });
    await expect(failure).rejects.toBeInstanceOf(HandshakeApiError);
  });

  it("rejects unsafe configuration and non-member paths", async () => {
    expect(
      () =>
        new HandshakeApiClient({
          baseUrl: "https://user:password@example.test",
          ownerToken: "test-token",
        }),
    ).toThrow("without embedded credentials");
    const client = new HandshakeApiClient({
      baseUrl: "https://example.test",
      ownerToken: "test-token",
      fetch: vi.fn() as unknown as typeof fetch,
    });
    await expect(client.get("/healthz")).rejects.toThrow("must start with /v1/");
  });
});
