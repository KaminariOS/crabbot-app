import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { TamaguiProvider, Theme } from 'tamagui';

import { AppProvider } from '@/src/state/AppContext';
import { ThemeProvider, useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';
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
  const palette = getChatGptPalette(resolvedTheme);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.style.backgroundColor = palette.appBg;
    document.body.style.backgroundColor = palette.appBg;
  }, [palette.appBg]);

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedTheme}>
      <Theme name={resolvedTheme}>
        <AppProvider>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: palette.appBg },
              headerStyle: { backgroundColor: palette.headerBg },
              headerTintColor: palette.headerText,
              headerTitleStyle: { color: palette.headerText },
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
