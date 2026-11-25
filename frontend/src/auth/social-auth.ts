import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Provider } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type SocialProvider = Extract<Provider, "apple" | "google">;

const codeExchanges = new Map<string, Promise<void>>();

export function getAuthCallbackUrl(flow?: "oauth" | "recovery") {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const callback = new URL("/auth/callback", window.location.origin);
    if (flow) callback.searchParams.set("flow", flow);
    return callback.toString();
  }

  return Linking.createURL("auth/callback", {
    queryParams: flow ? { flow } : undefined,
  });
}

export function exchangeAuthCode(code: string) {
  const existing = codeExchanges.get(code);
  if (existing) return existing;

  const exchange = (async () => {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  })();

  codeExchanges.set(code, exchange);
  while (codeExchanges.size > 5) {
    const oldestCode = codeExchanges.keys().next().value;
    if (!oldestCode) break;
    codeExchanges.delete(oldestCode);
  }
  void exchange.catch(() => codeExchanges.delete(code));
  return exchange;
}

export async function signInWithSocialProvider(provider: SocialProvider) {
  if (!supabase) throw new Error("Supabase is not configured");

  const redirectTo = getAuthCallbackUrl("oauth");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      ...(Platform.OS === "web" ? {} : { skipBrowserRedirect: true }),
    },
  });
  if (error) throw error;
  if (Platform.OS === "web") return;
  if (!data.url) throw new Error("The identity provider returned no URL");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) return;

  const callback = new URL(result.url);
  const providerError =
    callback.searchParams.get("error_description") ??
    callback.searchParams.get("error");
  if (providerError) throw new Error(providerError);

  const code = callback.searchParams.get("code");
  if (!code) throw new Error("The identity provider returned no code");
  await exchangeAuthCode(code);
}

export function getSocialProfileName(userMetadata: Record<string, unknown>) {
  const directName = [userMetadata.full_name, userMetadata.name].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (typeof directName === "string") return directName.trim();

  const firstName = userMetadata.given_name;
  const lastName = userMetadata.family_name;
  return [firstName, lastName]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}
