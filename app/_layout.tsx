import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TamaguiProvider, Theme } from 'tamagui';

import { AppProvider } from '@/src/state/AppContext';
import tamaguiConfig from '@/tamagui.config';

export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <Theme name="light">
        <AppProvider>
          <Stack>
            <Stack.Screen name="index" options={{ title: 'Connections' }} />
            <Stack.Screen name="connection/new" options={{ title: 'Add Connection' }} />
            <Stack.Screen name="connection/edit/[connectionId]" options={{ title: 'Edit Connection' }} />
            <Stack.Screen name="connection/[connectionId]" options={{ title: 'Connection' }} />
            <Stack.Screen name="session/[sessionId]" options={{ title: 'Session' }} />
          </Stack>
          <StatusBar style="dark" />
        </AppProvider>
      </Theme>
    </TamaguiProvider>
  );
}
