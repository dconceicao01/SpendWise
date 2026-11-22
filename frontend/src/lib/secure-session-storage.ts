import * as SecureStore from "expo-secure-store";

// Keep each value below SecureStore's platform-dependent ~2 KB payload limit.
const chunkSize = 400;
const indexSuffix = ".chunk-index";
let operationQueue = Promise.resolve();
let generationCounter = 0;

type ChunkIndex = {
  generation: string;
  count: number;
};

function serialize<T>(operation: () => Promise<T>) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function parseIndex(value: string | null): ChunkIndex | null {
  if (!value) return null;
  const [version, generation, countValue] = value.split("|");
  const count = Number(countValue);
  if (
    version !== "v1" ||
    !generation ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    throw new Error("Invalid secure session storage index.");
  }
  return { generation, count };
}

function getIndexKey(key: string) {
  return `${key}${indexSuffix}`;
}

function getChunkKey(key: string, generation: string, position: number) {
  return `${key}.chunk.${generation}.${position}`;
}

function splitValue(value: string) {
  const chunks: string[] = [];
  let start = 0;

  while (start < value.length) {
    let end = Math.min(start + chunkSize, value.length);
    const lastCodeUnit = value.charCodeAt(end - 1);
    const splitsSurrogatePair =
      end < value.length && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff;
    if (splitsSurrogatePair) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }

  return chunks.length > 0 ? chunks : [""];
}

async function deleteChunks(key: string, index: ChunkIndex) {
  await Promise.all(
    Array.from({ length: index.count }, (_, position) =>
      SecureStore.deleteItemAsync(
        getChunkKey(key, index.generation, position),
      ).catch(() => undefined),
    ),
  );
}

export const secureSessionStorage = {
  getItem(key: string) {
    return serialize(async () => {
      const indexValue = await SecureStore.getItemAsync(getIndexKey(key));
      const index = parseIndex(indexValue);
      if (!index) return SecureStore.getItemAsync(key);

      const chunks = await Promise.all(
        Array.from({ length: index.count }, (_, position) =>
          SecureStore.getItemAsync(
            getChunkKey(key, index.generation, position),
          ),
        ),
      );
      if (chunks.some((chunk) => chunk === null)) {
        throw new Error("Secure session data is incomplete.");
      }
      return chunks.join("");
    });
  },

  setItem(key: string, value: string) {
    return serialize(async () => {
      const indexKey = getIndexKey(key);
      const previousIndex = parseIndex(
        await SecureStore.getItemAsync(indexKey),
      );
      const generation = `${Date.now().toString(36)}-${(++generationCounter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const chunks = splitValue(value);

      try {
        for (const [position, chunk] of chunks.entries()) {
          await SecureStore.setItemAsync(
            getChunkKey(key, generation, position),
            chunk,
            {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            },
          );
        }

        await SecureStore.setItemAsync(
          indexKey,
          `v1|${generation}|${chunks.length}`,
          {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          },
        );
      } catch (error) {
        await deleteChunks(key, { generation, count: chunks.length });
        throw error;
      }

      if (previousIndex) await deleteChunks(key, previousIndex);
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
    });
  },

  removeItem(key: string) {
    return serialize(async () => {
      const indexKey = getIndexKey(key);
      const index = parseIndex(await SecureStore.getItemAsync(indexKey));
      await SecureStore.deleteItemAsync(indexKey);
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
      if (index) await deleteChunks(key, index);
    });
  },
};
