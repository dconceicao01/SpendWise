import * as SecureStore from "expo-secure-store";
import { secureSessionStorage } from "@/lib/secure-session-storage";

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked-this-device-only",
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const values = new Map<string, string>();

describe("secureSessionStorage", () => {
  beforeEach(() => {
    values.clear();
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
      return values.get(key) ?? null;
    });
    jest
      .mocked(SecureStore.setItemAsync)
      .mockImplementation(async (key, value) => {
        values.set(key, value);
      });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
      values.delete(key);
    });
  });

  it("reads legacy values stored before chunking was introduced", async () => {
    values.set("session", "legacy-token");

    await expect(secureSessionStorage.getItem("session")).resolves.toBe(
      "legacy-token",
    );
  });

  it("writes long values in bounded chunks and reads them back intact", async () => {
    const value = `${"x".repeat(399)}😀${"y".repeat(401)}`;

    await secureSessionStorage.setItem("session", value);

    const index = values.get("session.chunk-index");
    expect(index).toMatch(/^v1\|.+\|3$/);
    expect(values.has("session")).toBe(false);
    await expect(secureSessionStorage.getItem("session")).resolves.toBe(value);

    const [, generation, countText] = index!.split("|");
    const chunks = Array.from({ length: Number(countText) }, (_, position) =>
      values.get(`session.chunk.${generation}.${position}`),
    );
    expect(
      chunks.every((chunk) => chunk !== undefined && chunk.length <= 400),
    ).toBe(true);
  });

  it("rejects incomplete chunk sets instead of returning a partial session", async () => {
    values.set("session.chunk-index", "v1|generation|2");
    values.set("session.chunk.generation.0", "partial");

    await expect(secureSessionStorage.getItem("session")).rejects.toThrow(
      "Secure session data is incomplete.",
    );
  });

  it("removes the index and all chunks when the session is cleared", async () => {
    values.set("session", "legacy-token");
    values.set("session.chunk-index", "v1|generation|2");
    values.set("session.chunk.generation.0", "one");
    values.set("session.chunk.generation.1", "two");

    await secureSessionStorage.removeItem("session");

    expect(values.has("session")).toBe(false);
    expect(values.has("session.chunk-index")).toBe(false);
    expect(values.has("session.chunk.generation.0")).toBe(false);
    expect(values.has("session.chunk.generation.1")).toBe(false);
  });
});
