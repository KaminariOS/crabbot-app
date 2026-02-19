import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';
import { Button, Card, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';

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

  const connection = state.connections.find((item) => item.id === connectionId);
  const sessions = state.sessions
    .filter((session) => session.connectionId === connectionId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!connection) {
    return (
      <YStack style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text fontWeight="700">Connection not found</Text>
      </YStack>
    );
  }

  return (
    <ScrollView>
      <YStack style={{ padding: 16, gap: 12 }}>
        <Card style={{ borderWidth: 1, borderColor: '#d1d5db' }}>
          <Card.Header style={{ gap: 4 }}>
            <Text fontWeight="700">{connection.name}</Text>
            <Paragraph size="$2">{connection.websocketUrl}</Paragraph>
            <Paragraph size="$2">Status: {connection.status}</Paragraph>
          </Card.Header>
          <Card.Footer>
            <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
              {connection.status === 'connected' || connection.status === 'connecting' ? (
                <Button onPress={() => disconnectConnection(connection.id)}>Disconnect</Button>
              ) : (
                <Button onPress={() => void connectConnection(connection.id)}>Connect</Button>
              )}
              <Button
                theme="blue"
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
              <Button onPress={() => void discoverSessions(connection.id)}>Refresh Threads</Button>
            </XStack>
          </Card.Footer>
        </Card>

        <Text fontWeight="700">Sessions</Text>
        {sessions.length === 0 ? (
          <Paragraph color="$gray10">No sessions yet. Create one or refresh threads.</Paragraph>
        ) : (
          sessions.map((session) => (
            <Card key={session.id} style={{ borderWidth: 1, borderColor: '#d1d5db' }}>
              <Card.Header style={{ gap: 4 }}>
                <Text fontWeight="700">{session.title}</Text>
                <Paragraph size="$2">threadId: {session.threadId}</Paragraph>
                <Paragraph size="$2">state: {session.state}</Paragraph>
              </Card.Header>
              <Card.Footer>
                <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    onPress={() => {
                      setActiveSession(session.id);
                      router.push(`/session/${session.id}` as never);
                    }}
                  >
                    Open
                  </Button>
                  <Button
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
