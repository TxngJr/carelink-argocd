import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no web implementation, so this falls back to
// localStorage there (acceptable — web is a dev/preview target for this
// app, not how patients use it in the hospital).
const TOKEN_KEY = 'carelink_token';
const USER_KEY = 'carelink_user';

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveSession(token: string, user: unknown) {
  await Promise.all([setItem(TOKEN_KEY, token), setItem(USER_KEY, JSON.stringify(user))]);
}

export async function loadSession(): Promise<{ token: string; user: any } | null> {
  try {
    const [token, userRaw] = await Promise.all([getItem(TOKEN_KEY), getItem(USER_KEY)]);
    if (!token || !userRaw) return null;
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Promise.all([deleteItem(TOKEN_KEY), deleteItem(USER_KEY)]);
}
