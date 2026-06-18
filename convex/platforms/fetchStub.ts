// Test-only helper for adapter contract tests. Deliberately imports nothing
// from `vitest` so the Convex bundler can safely ignore/skip it.

export type FetchStub = {
  match: (url: string, init?: RequestInit) => boolean;
  respond: () => Response;
};

export type RecordedCall = { url: string; init?: RequestInit };

/**
 * Replace `global.fetch` with a stub that matches each request against the
 * given rules (first match wins) and records every call. Returns the recorded
 * calls array (populated as requests happen) plus a `restore` function.
 */
export function installFetchStub(stubs: FetchStub[]): {
  calls: RecordedCall[];
  restore: () => void;
} {
  const original = global.fetch;
  const calls: RecordedCall[] = [];

  global.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    const stub = stubs.find((s) => s.match(url, init));
    if (!stub) throw new Error(`Unexpected fetch: ${url}`);
    return stub.respond();
  }) as typeof global.fetch;

  return { calls, restore: () => void (global.fetch = original) };
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
