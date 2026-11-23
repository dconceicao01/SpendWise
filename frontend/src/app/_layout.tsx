import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/auth/auth-provider";
import { initializeLanguage } from "@/i18n/i18n";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isLanguageReady, setIsLanguageReady] = useState(false);

  useEffect(() => {
    void initializeLanguage()
      .catch(() => undefined)
      .finally(() => setIsLanguageReady(true));
  }, []);

  if (!isLanguageReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#285c3c" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <AuthProvider>
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
