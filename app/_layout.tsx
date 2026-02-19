import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Button, TamaguiProvider, Theme } from 'tamagui';

import { AppProvider, useAppState } from '@/src/state/AppContext';
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
            <Stack.Screen name="index" options={{ title: 'Terminals' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="connection/new" options={{ title: 'Add Connection' }} />
            <Stack.Screen name="connection/edit/[connectionId]" options={{ title: 'Edit Connection' }} />
            <Stack.Screen name="connection/[connectionId]" options={{ title: 'Connection' }} />
            <Stack.Screen name="session/[sessionId]" options={{ title: 'Session' }} />
          </Stack>
          <InAppNotificationOverlay />
          <Link href={'/settings' as never} asChild>
            <Button
              circular
              size="$5"
              style={{
                position: 'absolute',
                top: 56,
                right: 16,
                zIndex: 30,
                width: 52,
                height: 52,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: resolvedTheme === 'dark' ? 'rgba(32,35,43,0.72)' : 'rgba(255,255,255,0.76)',
                shadowColor: '#000000',
                shadowOpacity: 0.2,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 6,
              }}
              accessibilityLabel="Settings"
            >
              <Feather name="settings" size={22} color={palette.text} />
            </Button>
          </Link>
          <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
        </AppProvider>
      </Theme>
    </TamaguiProvider>
  );
}

function InAppNotificationOverlay() {
  const { inAppNotifications, dismissInAppNotification } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 104,
        left: 12,
        right: 12,
        zIndex: 100,
        gap: 8,
      }}
    >
      {inAppNotifications.map((notification) => {
        const isApproval = notification.kind === 'approval';
        return (
          <Pressable
            key={notification.id}
            onPress={() => dismissInAppNotification(notification.id)}
            style={{
              borderWidth: 1,
              borderColor: isApproval ? palette.accent : palette.border,
              borderLeftWidth: 4,
              borderLeftColor: isApproval ? palette.accent : palette.mutedText,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: palette.surface,
            }}
          >
            <Button
              chromeless
              size="$2"
              onPress={() => dismissInAppNotification(notification.id)}
              style={{
                alignSelf: 'flex-end',
                position: 'absolute',
                right: 6,
                top: 2,
                minHeight: 20,
                minWidth: 20,
              }}
              accessibilityLabel="Dismiss notification"
            >
              <Feather name="x" size={14} color={palette.mutedText} />
            </Button>
            <View style={{ paddingRight: 16 }}>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{notification.title}</Text>
              <Text style={{ color: palette.mutedText, fontSize: 12, marginTop: 2 }}>
                {notification.body}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
