import { Link, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { Button, Card, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';

export default function ConnectionsScreen() {
  const router = useRouter();
  const {
    state,
    connectConnection,
    disconnectConnection,
    removeConnection,
    discoverSessions,
    resumeLatestSession,
    resumeSession,
    setActiveSession,
    getSessionLastUserMessage,
  } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);
  const [menuConnectionId, setMenuConnectionId] = React.useState<string | null>(null);
  const [expandedConnectionIds, setExpandedConnectionIds] = React.useState<Record<string, boolean>>({});
  const [lastUserMessageBySession, setLastUserMessageBySession] = React.useState<Record<string, string | null>>({});
  const menuConnection = menuConnectionId ? state.connections.find((connection) => connection.id === menuConnectionId) ?? null : null;

  React.useEffect(() => {
    const expandedConnectionIdsList = Object.entries(expandedConnectionIds)
      .filter(([, expanded]) => expanded)
      .map(([connectionId]) => connectionId);
    const sessionsToHydrate = state.sessions.filter(
      (session) => expandedConnectionIdsList.includes(session.connectionId) && lastUserMessageBySession[session.id] === undefined,
    );
    if (sessionsToHydrate.length === 0) {
      return;
    }
    void Promise.all(
      sessionsToHydrate.map(async (session) => {
        try {
          const message = await getSessionLastUserMessage(session.id);
          setLastUserMessageBySession((current) => ({ ...current, [session.id]: message }));
        } catch {
          setLastUserMessageBySession((current) => ({ ...current, [session.id]: null }));
        }
      }),
    );
  }, [expandedConnectionIds, getSessionLastUserMessage, lastUserMessageBySession, state.sessions]);

  return (
    <YStack flex={1}>
      <ScrollView>
        <YStack style={{ padding: 16, gap: 12, paddingBottom: 96 }}>
          {state.connections.length === 0 ? (
            <Paragraph style={{ color: palette.mutedText }}>No terminals yet. Add one by QR scan or manual URL input.</Paragraph>
          ) : (
            state.connections.map((connection) => {
              const isExpanded = Boolean(expandedConnectionIds[connection.id]);
              const sessions = state.sessions
                .filter((session) => session.connectionId === connection.id)
                .sort((a, b) => b.updatedAt - a.updatedAt);

              return (
                <YStack key={connection.id} style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      setExpandedConnectionIds((current) => ({
                        ...current,
                        [connection.id]: !current[connection.id],
                      }));
                    }}
                  >
                    <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
                      <Card.Header style={{ gap: 4 }}>
                        <XStack style={{ alignItems: 'center', gap: 12 }}>
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 20,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: palette.surfaceAlt,
                              borderWidth: 1,
                              borderColor: palette.border,
                            }}
                          >
                            <Text fontWeight="700" style={{ color: palette.text }}>
                              {initials(connection.name)}
                            </Text>
                          </View>
                          <YStack style={{ flex: 1, gap: 2 }}>
                            <Text fontWeight="700" style={{ color: palette.text }}>
                              {connection.name}
                            </Text>
                            <Paragraph size="$2" style={{ color: palette.mutedText }}>
                              {safeHost(connection.websocketUrl) ?? connection.websocketUrl}
                            </Paragraph>
                            <XStack style={{ alignItems: 'center', gap: 6 }}>
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: statusColor(connection.status),
                                }}
                              />
                              <Paragraph size="$2" style={{ color: palette.mutedText }}>
                                {statusLabel(connection.status)} • {sessionCountLabel(state.sessions, connection.id)}
                              </Paragraph>
                            </XStack>
                          </YStack>
                          <Button
                            accessibilityLabel={`Actions for ${connection.name}`}
                            onPress={(event) => {
                              event.stopPropagation();
                              setMenuConnectionId(connection.id);
                            }}
                            style={{
                              minWidth: 40,
                              height: 40,
                              borderWidth: 1,
                              borderColor: palette.border,
                              backgroundColor: palette.surfaceAlt,
                              color: palette.text,
                              paddingHorizontal: 0,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: palette.text, fontSize: 26, lineHeight: 26 }}>⋮</Text>
                          </Button>
                        </XStack>
                        {connection.errorMessage ? <Paragraph style={{ color: palette.danger }}>{connection.errorMessage}</Paragraph> : null}
                      </Card.Header>
                    </Card>
                  </Pressable>

                  {isExpanded ? (
                    <YStack style={{ gap: 8, paddingLeft: 10 }}>
                      {sessions.length === 0 ? (
                        <Paragraph size="$2" style={{ color: palette.mutedText, paddingHorizontal: 8 }}>
                          No sessions yet.
                        </Paragraph>
                      ) : (
                        sessions.map((session) => (
                          <Pressable
                            key={session.id}
                            onPress={() => {
                              void (async () => {
                                try {
                                  await resumeSession(session.id);
                                  setActiveSession(session.id);
                                  router.push(`/session/${session.id}` as never);
                                } catch (error) {
                                  Alert.alert('Resume failed', error instanceof Error ? error.message : 'Unknown resume error');
                                }
                              })();
                            }}
                          >
                            <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
                              <Card.Header style={{ gap: 3 }}>
                                <Text fontWeight="700" style={{ color: palette.text }}>
                                  {session.title}
                                </Text>
                                <Paragraph size="$2" style={{ color: palette.mutedText }}>
                                  threadId: {session.threadId}
                                </Paragraph>
                                <Paragraph size="$2" numberOfLines={1} style={{ color: palette.mutedText }}>
                                  last user: {lastUserMessageBySession[session.id] ?? 'loading...'}
                                </Paragraph>
                                <Paragraph size="$2" style={{ color: palette.mutedText }}>
                                  state: {session.state}
                                </Paragraph>
                              </Card.Header>
                            </Card>
                          </Pressable>
                        ))
                      )}
                    </YStack>
                  ) : null}
                </YStack>
              );
            })
          )}
        </YStack>
      </ScrollView>

      <Modal visible={menuConnection != null} transparent animationType="fade" onRequestClose={() => setMenuConnectionId(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.38)', justifyContent: 'flex-end' }}
          onPress={() => setMenuConnectionId(null)}
        >
          <Pressable
            style={{
              marginHorizontal: 16,
              marginBottom: 112,
              borderRadius: 16,
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
              padding: 12,
              gap: 8,
            }}
            onPress={(event) => event.stopPropagation()}
          >
            {menuConnection ? (
              <>
                <Text style={{ color: palette.mutedText, fontSize: 13, paddingHorizontal: 6, paddingTop: 4 }}>
                  {menuConnection.name}
                </Text>
                <Button
                  style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                  onPress={() => {
                    setMenuConnectionId(null);
                    router.push(`/connection/edit/${menuConnection.id}` as never);
                  }}
                >
                  Edit
                </Button>
                <Button
                  style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                  onPress={async () => {
                    setMenuConnectionId(null);
                    try {
                      const resumed = await resumeLatestSession(menuConnection.id);
                      router.push(`/session/${resumed.id}` as never);
                    } catch (error) {
                      Alert.alert('Resume failed', error instanceof Error ? error.message : 'Unknown resume error');
                    }
                  }}
                >
                  Resume
                </Button>
                <Button
                  style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                  onPress={async () => {
                    setMenuConnectionId(null);
                    try {
                      await discoverSessions(menuConnection.id);
                    } catch (error) {
                      Alert.alert('Refresh failed', error instanceof Error ? error.message : 'Unknown refresh error');
                    }
                  }}
                >
                  Refresh Threads
                </Button>
                {menuConnection.status === 'connected' || menuConnection.status === 'connecting' ? (
                  <Button
                    style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                    onPress={() => {
                      setMenuConnectionId(null);
                      disconnectConnection(menuConnection.id);
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    style={{ backgroundColor: palette.accent, color: '#ffffff' }}
                    onPress={() => {
                      setMenuConnectionId(null);
                      void connectConnection(menuConnection.id);
                    }}
                  >
                    Connect
                  </Button>
                )}
                <Button
                  style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                  onPress={() => {
                    setMenuConnectionId(null);
                    removeConnection(menuConnection.id);
                  }}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Link href={'/connection/new' as never} asChild>
        <Button
          circular
          size="$8"
          backgroundColor={palette.accent}
          borderColor={palette.accent}
          borderWidth={1}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 28,
            zIndex: 20,
            elevation: 8,
            width: 76,
            height: 76,
            shadowColor: '#000000',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
          accessibilityLabel="Add Connection"
        >
          <Text
            style={{
              color: '#ffffff',
              fontSize: 52,
              fontWeight: '700',
              lineHeight: 52,
              transform: [{ translateY: -2 }],
            }}
          >
            +
          </Text>
        </Button>
      </Link>
    </YStack>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function statusColor(status: 'connected' | 'connecting' | 'disconnected' | 'error'): string {
  switch (status) {
    case 'connected':
      return '#10a37f';
    case 'connecting':
      return '#f59e0b';
    case 'error':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
}

function statusLabel(status: 'connected' | 'connecting' | 'disconnected' | 'error'): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Error';
    default:
      return 'Disconnected';
  }
}

function sessionCountLabel(
  sessions: { connectionId: string }[],
  connectionId: string,
): string {
  const count = sessions.filter((session) => session.connectionId === connectionId).length;
  return `${count} ${count === 1 ? 'session' : 'sessions'}`;
}
