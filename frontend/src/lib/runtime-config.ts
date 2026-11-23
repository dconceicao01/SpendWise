import { configureSupabase } from "@/lib/supabase";

export type SpendWiseRuntimeConfig = {
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  apiUrl: string | null;
};

const fallbackConfig: SpendWiseRuntimeConfig = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null,
  apiUrl: process.env.EXPO_PUBLIC_SPENDWISE_API_URL?.replace(/\/$/, "") ?? null,
};

let activeConfig = fallbackConfig;
const listeners = new Set<() => void>();

function isAllowedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.username === "" &&
      url.password === "" &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1")))
    );
  } catch {
    return false;
  }
}

function validateConfig(value: unknown): SpendWiseRuntimeConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid runtime configuration");
  }

  const config = value as Record<string, unknown>;
  if (
    !isAllowedUrl(config.supabaseUrl) ||
    typeof config.supabasePublishableKey !== "string" ||
    config.supabasePublishableKey.length < 10 ||
    config.supabasePublishableKey.length > 4096 ||
    !isAllowedUrl(config.apiUrl)
  ) {
    throw new Error("Invalid runtime configuration");
  }

  return {
    supabaseUrl: config.supabaseUrl.replace(/\/$/, ""),
    supabasePublishableKey: config.supabasePublishableKey,
    apiUrl: config.apiUrl.replace(/\/$/, ""),
  };
}

function applyConfig(nextConfig: SpendWiseRuntimeConfig) {
  if (
    activeConfig.supabaseUrl === nextConfig.supabaseUrl &&
    activeConfig.supabasePublishableKey === nextConfig.supabasePublishableKey &&
    activeConfig.apiUrl === nextConfig.apiUrl
  ) {
    return;
  }

  activeConfig = nextConfig;
  configureSupabase(nextConfig);
  listeners.forEach((listener) => listener());
}

export function getRuntimeConfig() {
  return activeConfig;
}

export function subscribeRuntimeConfig(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getConfigEndpoint() {
  const configuredEndpoint = process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL;
  if (configuredEndpoint) {
    if (!isAllowedUrl(configuredEndpoint)) {
      throw new Error("Runtime configuration URL must use HTTPS");
    }
    return configuredEndpoint;
  }

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return new URL("/api/runtime-config", window.location.origin).toString();
  }

  return null;
}

export async function refreshRuntimeConfig() {
  const endpoint = getConfigEndpoint();
  if (!endpoint) return;

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Runtime configuration unavailable");

  const nextConfig = validateConfig(await response.json());
  applyConfig(nextConfig);
}

export async function initializeRuntimeConfig() {
  configureSupabase(activeConfig);
  try {
    await refreshRuntimeConfig();
  } catch {
    // Keep the last known build-time configuration if the control plane is unavailable.
  }
}
