import { afterEach, describe, expect, it, vi } from "vitest";

const getAccessToken = vi.fn();
vi.mock("../spotify/auth", () => ({ getAccessToken: () => getAccessToken() }));

import { workerFetch } from "./worker";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("workerFetch", () => {
  it("throws without a Spotify token and does not call the worker", async () => {
    vi.stubEnv("VITE_WORKER_URL", "https://w.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getAccessToken.mockResolvedValue(null);
    await expect(workerFetch("/tags")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the bearer token to the worker URL", async () => {
    vi.stubEnv("VITE_WORKER_URL", "https://w.example/");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    getAccessToken.mockResolvedValue("tok");
    await workerFetch("/tags?x=1");
    expect(fetchMock).toHaveBeenCalledWith("https://w.example/tags?x=1", { headers: { Authorization: "Bearer tok" } });
  });
});
