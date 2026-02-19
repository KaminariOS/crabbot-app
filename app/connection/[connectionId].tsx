import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';
import { Button, Card, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';

export default function ConnectionDetailScreen() {
  const params = useLocalSearchParams<{ connectionId: string }>();
  const router = useRouter();
  const connectionId = String(params.connectionId ?? '');

  const {
    state,
    connectConnection,
    disconnectConnection,
    createSession,
    discoverSessions,
    resumeSession,
    forkSession,
    setActiveSession,
  } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);

  const connection = state.connections.find((item) => item.id === connectionId);
  const sessions = state.sessions
    .filter((session) => session.connectionId === connectionId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!connection) {
    return (
      <YStack style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text fontWeight="700" style={{ color: palette.text }}>
          Connection not found
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack style={{ padding: 16, gap: 12 }}>
        <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
          <Card.Header style={{ gap: 4 }}>
            <Text fontWeight="700" style={{ color: palette.text }}>
              {connection.name}
            </Text>
            <Paragraph size="$2" style={{ color: palette.mutedText }}>
              {connection.websocketUrl}
            </Paragraph>
            <Paragraph size="$2" style={{ color: palette.mutedText }}>
              Status: {connection.status}
            </Paragraph>
          </Card.Header>
          <Card.Footer>
            <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
              {connection.status === 'connected' || connection.status === 'connecting' ? (
                <Button
                  onPress={() => disconnectConnection(connection.id)}
                  style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                >
                  Disconnect
                </Button>
              ) : (
                <Button onPress={() => void connectConnection(connection.id)} style={{ backgroundColor: palette.accent, color: '#ffffff' }}>
                  Connect
                </Button>
              )}
              <Button
                onPress={() => router.push(`/connection/edit/${connection.id}` as never)}
                style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
              >
                Edit
              </Button>
              <Button
                style={{ backgroundColor: palette.accent, color: '#ffffff' }}
                onPress={async () => {
                  try {
                    const created = await createSession(connection.id);
                    router.push(`/session/${created.id}` as never);
                  } catch (error) {
                    Alert.alert(
                      'Create session failed',
                      error instanceof Error ? error.message : 'Unknown error creating session',
                    );
                  }
                }}
              >
                Create Session
              </Button>
              <Button
                onPress={() => void discoverSessions(connection.id)}
                style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
              >
                Refresh Threads
              </Button>
            </XStack>
          </Card.Footer>
        </Card>

        <Text fontWeight="700" style={{ color: palette.text }}>
          Sessions
        </Text>
        {sessions.length === 0 ? (
          <Paragraph style={{ color: palette.mutedText }}>No sessions yet. Create one or refresh threads.</Paragraph>
        ) : (
          sessions.map((session) => (
            <Card key={session.id} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
              <Card.Header style={{ gap: 4 }}>
                <Text fontWeight="700" style={{ color: palette.text }}>
                  {session.title}
                </Text>
                <Paragraph size="$2" style={{ color: palette.mutedText }}>
                  threadId: {session.threadId}
                </Paragraph>
                <Paragraph size="$2" style={{ color: palette.mutedText }}>
                  state: {session.state}
                </Paragraph>
              </Card.Header>
              <Card.Footer>
                <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                    onPress={() => {
                      setActiveSession(session.id);
                      router.push(`/session/${session.id}` as never);
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                    onPress={async () => {
                      try {
                        await resumeSession(session.id);
                      } catch (error) {
                        Alert.alert(
                          'Resume failed',
                          error instanceof Error ? error.message : 'Unknown resume error',
                        );
                      }
                    }}
                  >
                    Resume
                  </Button>
                  <Button
                    style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                    onPress={async () => {
                      try {
                        const forked = await forkSession(session.id);
                        if (forked) {
                          router.push(`/session/${forked.id}` as never);
                        }
                      } catch (error) {
                        Alert.alert(
                          'Fork failed',
                          error instanceof Error ? error.message : 'Unknown fork error',
                        );
                      }
                    }}
                  >
                    Fork
                  </Button>
                </XStack>
              </Card.Footer>
            </Card>
          ))
        )}
      </YStack>
    </ScrollView>
  );
}
