import { Link } from 'expo-router';
import React from 'react';
import { Button, Card, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';

export default function ConnectionsScreen() {
  const { state, connectConnection, disconnectConnection, removeConnection } = useAppState();

  return (
    <ScrollView>
      <YStack style={{ padding: 16, gap: 12 }}>
        <Link href={'/connection/new' as never} asChild>
          <Button theme="blue">Add Connection</Button>
        </Link>

        {state.connections.length === 0 ? (
          <Paragraph color="$gray10">No connections yet. Add one by QR scan or manual URL input.</Paragraph>
        ) : (
          state.connections.map((connection) => (
            <Card key={connection.id} style={{ borderWidth: 1, borderColor: '#d1d5db' }}>
              <Card.Header style={{ gap: 4 }}>
                <Text fontWeight="700">{connection.name}</Text>
                <Paragraph size="$2">{connection.websocketUrl}</Paragraph>
                <Paragraph size="$2">Status: {connection.status}</Paragraph>
                {connection.errorMessage ? <Paragraph color="$red10">{connection.errorMessage}</Paragraph> : null}
              </Card.Header>
              <Card.Footer>
                <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Link href={`/connection/${connection.id}` as never} asChild>
                    <Button>Open</Button>
                  </Link>
                  {connection.status === 'connected' || connection.status === 'connecting' ? (
                    <Button onPress={() => disconnectConnection(connection.id)}>Disconnect</Button>
                  ) : (
                    <Button onPress={() => void connectConnection(connection.id)}>Connect</Button>
                  )}
                  <Button theme="red" onPress={() => removeConnection(connection.id)}>
                    Delete
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
