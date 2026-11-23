import assert from "node:assert/strict";
import test from "node:test";
import { runStagingSmoke } from "./staging-smoke.mjs";

const webOrigin = "https://spendwise-staging.example.test";
const apiOrigin = "https://spendwise-api-staging.example.test";

function healthyFetch(overrides = {}) {
  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin === webOrigin) {
      return new Response("<!doctype html><html><body>SpendWise</body></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/api/v1/health" && options.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "access-control-allow-origin": overrides.allowedOrigin ?? webOrigin,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers":
            overrides.allowedHeaders ?? "authorization, content-type, apikey",
        },
      });
    }
    if (url.pathname === "/api/v1/health") {
      return Response.json({ status: "UP" });
    }
    if (url.pathname === "/api/v1/budgets") {
      return new Response(null, {
        status: overrides.protectedStatus ?? 401,
        headers: { "access-control-allow-origin": webOrigin },
      });
    }
    throw new Error("Unexpected smoke request");
  };
}

test("passes when web, API health, CORS, and anonymous protection are healthy", async () => {
  const messages = [];
  await runStagingSmoke({
    webUrl: webOrigin,
    apiUrl: apiOrigin,
    fetchImpl: healthyFetch(),
    log: (message) => messages.push(message),
  });
  assert.equal(messages.length, 4);
});

test("rejects a non-HTTPS staging origin before making a request", async () => {
  await assert.rejects(
    runStagingSmoke({
      webUrl: "http://spendwise-staging.example.test",
      apiUrl: apiOrigin,
      fetchImpl: healthyFetch(),
      log: () => {},
    }),
    /public HTTPS origin/,
  );
});

test("fails when the API CORS allowlist does not match the staging web origin", async () => {
  await assert.rejects(
    runStagingSmoke({
      webUrl: webOrigin,
      apiUrl: apiOrigin,
      fetchImpl: healthyFetch({ allowedOrigin: "https://other.example.test" }),
      log: () => {},
    }),
    /CORS preflight/,
  );
});

test("fails when the protected API route accepts an anonymous request", async () => {
  await assert.rejects(
    runStagingSmoke({
      webUrl: webOrigin,
      apiUrl: apiOrigin,
      fetchImpl: healthyFetch({ protectedStatus: 200 }),
      log: () => {},
    }),
    /reject unauthenticated requests with 401/,
  );
});
