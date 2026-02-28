import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Button, Paragraph, Text, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function ThreadRedirectScreen() {
  const params = useLocalSearchParams<{ threadId?: string }>();
  const router = useRouter();
  const { state, connectConnection, discoverSessions, resumeSession } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);
  const [statusText, setStatusText] = useState('Looking up thread...');
  const [errorText, setErrorText] = useState<string | null>(null);

  const sessionsRef = useRef(state.sessions);
  const connectionsRef = useRef(state.connections);

  useEffect(() => {
    sessionsRef.current = state.sessions;
  }, [state.sessions]);

  useEffect(() => {
    connectionsRef.current = state.connections;
  }, [state.connections]);

  const threadId = useMemo(() => {
    const raw = String(params.threadId ?? '').trim();
    if (!raw) {
      return '';
    }
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params.threadId]);

  useEffect(() => {
    let cancelled = false;

    const findSessionByThreadId = () =>
      sessionsRef.current.find((session) => session.threadId === threadId);

    const run = async () => {
      if (!threadId) {
        if (!cancelled) {
          setErrorText('Invalid link: missing thread id.');
          setStatusText('Unable to open thread');
        }
        return;
      }

      setErrorText(null);
      setStatusText('Looking up thread...');

      // Give persisted state hydration a brief moment before discovery.
      for (let i = 0; i < 8; i += 1) {
        const existing = findSessionByThreadId();
        if (existing) {
          setStatusText('Opening thread...');
          await resumeSession(existing.id);
          if (!cancelled) {
            router.replace(`/session/${existing.id}` as never);
          }
          return;
        }
        await sleep(250);
      }

      const connections = connectionsRef.current;
      if (connections.length === 0) {
        if (!cancelled) {
          setErrorText('No connections are configured in the app.');
          setStatusText('Unable to open thread');
        }
        return;
      }

      setStatusText('Syncing threads from connections...');
      for (const connection of connections) {
        try {
          await connectConnection(connection.id);
          await discoverSessions(connection.id);
        } catch {
          // Best effort across all configured connections.
        }
      }

      for (let i = 0; i < 8; i += 1) {
        const discovered = findSessionByThreadId();
        if (discovered) {
          setStatusText('Opening thread...');
          await resumeSession(discovered.id);
          if (!cancelled) {
            router.replace(`/session/${discovered.id}` as never);
          }
          return;
        }
        await sleep(250);
      }

      if (!cancelled) {
        setErrorText(`Thread not found: ${threadId}`);
        setStatusText('Unable to open thread');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [threadId, connectConnection, discoverSessions, resumeSession, router]);

  return (
    <YStack style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: palette.appBg }}>
      <Stack.Screen options={{ title: 'Open Thread' }} />
      <ActivityIndicator size="large" color={palette.accent} />
      <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{statusText}</Text>
      <Paragraph style={{ color: palette.mutedText, textAlign: 'center' }}>
        {threadId ? `threadId: ${threadId}` : 'No thread id provided'}
      </Paragraph>
      {errorText ? (
        <>
          <Paragraph style={{ color: palette.danger, textAlign: 'center' }}>{errorText}</Paragraph>
          <Button onPress={() => router.replace('/' as never)}>Go to terminals</Button>
        </>
      ) : null}
    </YStack>
  );
}
