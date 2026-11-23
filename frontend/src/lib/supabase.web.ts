import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseRuntimeConfig = {
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
};

const hasBrowserStorage = typeof window !== "undefined";
export let isSupabaseConfigured = false;
export let supabase: SupabaseClient | null = null;

const tabSessionStorage = {
  getItem: (key: string) =>
    hasBrowserStorage ? window.sessionStorage.getItem(key) : null,
  setItem: (key: string, value: string) => {
    if (hasBrowserStorage) window.sessionStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (hasBrowserStorage) window.sessionStorage.removeItem(key);
  },
};

export function configureSupabase(config: SupabaseRuntimeConfig) {
  isSupabaseConfigured = Boolean(
    config.supabaseUrl && config.supabasePublishableKey,
  );
  supabase =
    isSupabaseConfigured && config.supabaseUrl && config.supabasePublishableKey
      ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: {
            storage: tabSessionStorage,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
            persistSession: true,
          },
        })
      : null;
}
