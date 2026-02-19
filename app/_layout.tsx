import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { TamaguiProvider, Theme } from 'tamagui';

import { AppProvider } from '@/src/state/AppContext';
import { ThemeProvider, useThemeSettings } from '@/src/state/ThemeContext';
import tamaguiConfig from '@/tamagui.config';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootContent />
    </ThemeProvider>
  );
}

function RootContent() {
  const { resolvedTheme } = useThemeSettings();
  const screenBackground = resolvedTheme === 'dark' ? '#0b0d10' : '#f3f4f6';
  const headerBackground = resolvedTheme === 'dark' ? '#05070a' : '#ffffff';
  const headerText = resolvedTheme === 'dark' ? '#f3f4f6' : '#111827';

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.style.backgroundColor = screenBackground;
    document.body.style.backgroundColor = screenBackground;
  }, [screenBackground]);

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedTheme}>
      <Theme name={resolvedTheme}>
        <AppProvider>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: screenBackground },
              headerStyle: { backgroundColor: headerBackground },
              headerTintColor: headerText,
              headerTitleStyle: { color: headerText },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Connections' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="connection/new" options={{ title: 'Add Connection' }} />
            <Stack.Screen name="connection/edit/[connectionId]" options={{ title: 'Edit Connection' }} />
            <Stack.Screen name="connection/[connectionId]" options={{ title: 'Connection' }} />
            <Stack.Screen name="session/[sessionId]" options={{ title: 'Session' }} />
          </Stack>
          <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        </AppProvider>
      </Theme>
    </TamaguiProvider>
  );
}
