import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const platforms = ["Web", "Android", "iOS"];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>POUPAR EM CONJUNTO</Text>
        <Text style={styles.title}>SpendWise</Text>
        <Text style={styles.description}>
          A base multiplataforma está pronta para começar a transformar
          objetivos em progresso.
        </Text>
        <View
          accessibilityLabel="Plataformas suportadas"
          style={styles.platforms}
        >
          {platforms.map((platform) => (
            <Text key={platform} style={styles.platform}>
              {platform}
            </Text>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7f2",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: "#35684b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
    marginBottom: 12,
  },
  title: {
    color: "#18291f",
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: -1.5,
  },
  description: {
    color: "#4c5d52",
    fontSize: 18,
    lineHeight: 28,
    marginTop: 16,
    maxWidth: 520,
  },
  platforms: {
    flexDirection: "row",
    gap: 10,
    marginTop: 28,
  },
  platform: {
    color: "#234b34",
    backgroundColor: "#e3eee5",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
  },
});
