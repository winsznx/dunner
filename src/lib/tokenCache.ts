import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

interface TokenCache {
  getToken: (key: string) => Promise<string | undefined | null>;
  saveToken: (key: string, token: string) => Promise<void>;
}

export const tokenCache: TokenCache | undefined =
  Platform.OS === "web"
    ? undefined
    : {
        async getToken(key: string) {
          try {
            return await SecureStore.getItemAsync(key);
          } catch (err) {
            console.warn("[tokenCache] getToken failed", err);
            return null;
          }
        },
        async saveToken(key: string, value: string) {
          try {
            await SecureStore.setItemAsync(key, value);
          } catch (err) {
            console.warn("[tokenCache] saveToken failed", err);
          }
        },
      };
