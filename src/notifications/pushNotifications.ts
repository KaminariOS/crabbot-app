import Constants from 'expo-constants';
import { Platform } from 'react-native';

let initialized = false;
let enabled = false;
let notificationsModule: typeof import('expo-notifications') | null = null;

async function loadNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (notificationsModule) {
    return notificationsModule;
  }
  try {
    notificationsModule = await import('expo-notifications');
    return notificationsModule;
  } catch {
    return null;
  }
}

export function isNativePushAvailable(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }
  // Expo Go does not support production-style native push setup.
  if (Constants.appOwnership === 'expo') {
    return false;
  }
  return true;
}

export async function initializePushNotifications(): Promise<boolean> {
  if (initialized) {
    return enabled;
  }
  initialized = true;

  if (!isNativePushAvailable()) {
    enabled = false;
    return enabled;
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    enabled = false;
    return enabled;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    enabled = false;
    return enabled;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('high-priority', {
      name: 'High Priority',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 800, 250, 800],
      enableVibrate: true,
      sound: 'default',
    });
  }

  enabled = true;
  return enabled;
}

export async function notifyDevice(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  if (!(await initializePushNotifications())) {
    return;
  }
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      ...(Platform.OS === 'android' ? { channelId: 'high-priority' } : {}),
    },
    trigger: null,
  });
}

export async function getNativeDevicePushToken(): Promise<string | null> {
  if (!(await initializePushNotifications())) {
    return null;
  }
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return null;
  }
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    const raw = token?.data;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw;
    }
    if (raw && typeof raw === 'object' && 'token' in raw) {
      const nested = (raw as { token?: unknown }).token;
      if (typeof nested === 'string' && nested.trim().length > 0) {
        return nested;
      }
    }
    return null;
  } catch {
    return null;
  }
}
