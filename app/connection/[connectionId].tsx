import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
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
    resumeLatestSession,
    discoverSessions,
    resumeSession,
    setActiveSession,
    getSessionMessagePreview,
    setSessionTitle,
  } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);
  const [lastUserMessageBySession, setLastUserMessageBySession] = React.useState<Record<string, string | null>>({});
  const [lastAssistantMessageBySession, setLastAssistantMessageBySession] = React.useState<Record<string, string | null>>({});
  const [loadingSessionId, setLoadingSessionId] = React.useState<string | null>(null);

  const connection = state.connections.find((item) => item.id === connectionId);
  const sessions = state.sessions
    .filter((session) => session.connectionId === connectionId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  React.useEffect(() => {
    const sessionsToHydrate = sessions.filter(
      (session) => lastUserMessageBySession[session.id] === undefined || lastAssistantMessageBySession[session.id] === undefined,
    );
    if (sessionsToHydrate.length === 0) {
      return;
    }
    void Promise.all(
      sessionsToHydrate.map(async (session) => {
        try {
          const preview = await getSessionMessagePreview(session.id);
          if (preview.lastUser?.trim()) {
            setSessionTitle(session.id, preview.lastUser);
          }
          setLastUserMessageBySession((current) => ({ ...current, [session.id]: preview.lastUser }));
          setLastAssistantMessageBySession((current) => ({ ...current, [session.id]: preview.lastAssistant }));
        } catch {
          setLastUserMessageBySession((current) => ({ ...current, [session.id]: null }));
          setLastAssistantMessageBySession((current) => ({ ...current, [session.id]: null }));
        }
      }),
    );
  }, [connectionId, getSessionMessagePreview, lastAssistantMessageBySession, lastUserMessageBySession, sessions, setSessionTitle]);

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
            <YStack style={{ gap: 8, width: '100%' }}>
              <XStack style={{ gap: 8 }}>
                {connection.status === 'connected' || connection.status === 'connecting' ? (
                  <Button
                    onPress={() => disconnectConnection(connection.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderWidth: 1,
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceAlt,
                      color: palette.text,
                      paddingHorizontal: 8,
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onPress={() => void connectConnection(connection.id)}
                    style={{ flex: 1, minWidth: 0, backgroundColor: palette.accent, color: '#ffffff', paddingHorizontal: 8 }}
                  >
                    Connect
                  </Button>
                )}
                <Button
                  onPress={() => router.push(`/connection/edit/${connection.id}` as never)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceAlt,
                    color: palette.text,
                    paddingHorizontal: 8,
                  }}
                >
                  Edit
                </Button>
              </XStack>
              <XStack style={{ gap: 8 }}>
                <Button
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.surfaceAlt,
                    color: palette.text,
                    paddingHorizontal: 8,
                  }}
                  onPress={async () => {
                    try {
                      const resumed = await resumeLatestSession(connection.id);
                      router.push(`/session/${resumed.id}` as never);
                    } catch (error) {
                      Alert.alert('Resume failed', error instanceof Error ? error.message : 'Unknown resume error');
                    }
                  }}
                >
                  Resume
                </Button>
                <Button
                  style={{ flex: 1, minWidth: 0, backgroundColor: palette.accent, color: '#ffffff', paddingHorizontal: 8 }}
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
              </XStack>
              <Button
                onPress={() => void discoverSessions(connection.id)}
                style={{
                  width: '100%',
                  minWidth: 0,
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: palette.surfaceAlt,
                  color: palette.text,
                  paddingHorizontal: 8,
                }}
              >
                Refresh Threads
              </Button>
            </YStack>
          </Card.Footer>
        </Card>

        <Text fontWeight="700" style={{ color: palette.text }}>
          Sessions
        </Text>
        {sessions.length === 0 ? (
          <Paragraph style={{ color: palette.mutedText }}>No sessions yet. Create one or refresh threads.</Paragraph>
        ) : (
          sessions.map((session) => {
            const pickerTitle = lastUserMessageBySession[session.id]?.trim() || session.title;
            const assistantPreview = lastAssistantMessageBySession[session.id]?.trim();
            return (
              <Pressable
                key={session.id}
                disabled={loadingSessionId === session.id}
                onPress={() => {
                  void (async () => {
                    setLoadingSessionId(session.id);
                    try {
                      await resumeSession(session.id);
                      setActiveSession(session.id);
                      router.push(`/session/${session.id}` as never);
                    } catch (error) {
                      Alert.alert('Resume failed', error instanceof Error ? error.message : 'Unknown resume error');
                    } finally {
                      setLoadingSessionId((current) => (current === session.id ? null : current));
                    }
                  })();
                }}
              >
                <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
                  <Card.Header style={{ gap: 4 }}>
                    <Text fontWeight="700" numberOfLines={1} style={{ color: palette.text }}>
                      {pickerTitle}
                    </Text>
                    <Paragraph size="$2" numberOfLines={2} style={{ color: palette.text }}>
                      {assistantPreview ? `Agent: ${assistantPreview}` : 'Agent: —'}
                    </Paragraph>
                    <Paragraph size="$2" style={{ color: palette.mutedText }}>
                      threadId: {session.threadId}
                    </Paragraph>
                    <Paragraph size="$2" style={{ color: palette.mutedText }}>
                      state: {session.state}
                    </Paragraph>
                    {loadingSessionId === session.id ? (
                      <XStack style={{ alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={palette.accent} />
                        <Paragraph size="$2" style={{ color: palette.accent }}>
                          Loading…
                        </Paragraph>
                      </XStack>
                    ) : null}
                  </Card.Header>
                </Card>
              </Pressable>
            );
          })
        )}
      </YStack>
    </ScrollView>
  );
}
