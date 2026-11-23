import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/auth/auth-provider";
import { initializeLanguage } from "@/i18n/i18n";
import {
  initializeRuntimeConfig,
  refreshRuntimeConfig,
  subscribeRuntimeConfig,
} from "@/lib/runtime-config";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isAppReady, setIsAppReady] = useState(false);
  const [runtimeConfigVersion, setRuntimeConfigVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeRuntimeConfig(() => {
      setRuntimeConfigVersion((version) => version + 1);
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void refreshRuntimeConfig().catch(() => undefined);
        }
      },
    );

    void Promise.all([initializeLanguage(), initializeRuntimeConfig()])
      .catch(() => undefined)
      .finally(() => setIsAppReady(true));

    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  if (!isAppReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#285c3c" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <AuthProvider key={runtimeConfigVersion}>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f7f2",
  },
});
