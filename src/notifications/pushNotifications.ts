import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let initialized = false;
let enabled = false;

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
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  enabled = true;
  return enabled;
}

export async function notifyDevice(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  if (!(await initializePushNotifications())) {
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: null,
  });
}
