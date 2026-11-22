import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const hasBrowserStorage = typeof window !== "undefined";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

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

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        storage: tabSessionStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null;
