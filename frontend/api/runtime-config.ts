type VercelRequest = {
  method?: string;
};
type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

function requireHttpsUrl(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);

  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`Invalid ${name}`);
  }

  return url.origin;
}

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const publishableKey = process.env.SPENDWISE_ACTIVE_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey.length > 4096) {
    response.status(503).json({ error: "Runtime configuration unavailable" });
    return;
  }

  try {
    response.status(200).json({
      supabaseUrl: requireHttpsUrl("SPENDWISE_ACTIVE_SUPABASE_URL"),
      supabasePublishableKey: publishableKey,
      apiUrl: requireHttpsUrl("SPENDWISE_ACTIVE_API_URL"),
    });
  } catch {
    response.status(503).json({ error: "Runtime configuration unavailable" });
  }
}
