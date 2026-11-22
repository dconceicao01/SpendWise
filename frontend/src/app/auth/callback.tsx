import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackScreen() {
  const { code, flow } = useLocalSearchParams<{
    code?: string;
    flow?: string;
  }>();

  useEffect(() => {
    let isMounted = true;
    async function exchangeCode() {
      if (!supabase || typeof code !== "string") {
        if (isMounted) router.replace("/?authError=1");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!isMounted) return;
      router.replace(
        error
          ? "/?authError=1"
          : flow === "recovery"
            ? "/auth/reset-password"
            : "/?confirmed=1",
      );
    }

    void exchangeCode();
    return () => {
      isMounted = false;
    };
  }, [code, flow]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.brand}>SpendWise</Text>
        <ActivityIndicator color="#35684b" style={styles.indicator} />
        <Text style={styles.description}>
          A validar a ligação de segurança…
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f7f2" },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  brand: { color: "#18291f", fontSize: 34, fontWeight: "700" },
  indicator: { alignSelf: "flex-start", marginTop: 28 },
  description: {
    color: "#4c5d52",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
});
