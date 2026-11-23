import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";
import { secureSessionStorage } from "@/lib/secure-session-storage";

export type SupabaseRuntimeConfig = {
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
};

export let isSupabaseConfigured = false;
export let supabase: SupabaseClient | null = null;

export function configureSupabase(config: SupabaseRuntimeConfig) {
  isSupabaseConfigured = Boolean(
    config.supabaseUrl && config.supabasePublishableKey,
  );
  supabase =
    isSupabaseConfigured && config.supabaseUrl && config.supabasePublishableKey
      ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: {
            storage: secureSessionStorage,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
            persistSession: true,
          },
        })
      : null;
}
