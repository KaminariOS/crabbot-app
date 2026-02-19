import { Link } from 'expo-router';
import React from 'react';
import { Button, Card, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';

export default function ConnectionsScreen() {
  const { state, connectConnection, disconnectConnection, removeConnection } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);

  return (
    <YStack flex={1}>
      <ScrollView>
        <YStack style={{ padding: 16, gap: 12, paddingBottom: 96 }}>
          {state.connections.length === 0 ? (
            <Paragraph style={{ color: palette.mutedText }}>No connections yet. Add one by QR scan or manual URL input.</Paragraph>
          ) : (
            state.connections.map((connection) => (
              <Card key={connection.id} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
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
                  {connection.errorMessage ? <Paragraph style={{ color: palette.danger }}>{connection.errorMessage}</Paragraph> : null}
                </Card.Header>
                <Card.Footer>
                  <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/connection/${connection.id}` as never} asChild>
                      <Button style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}>
                        Open
                      </Button>
                    </Link>
                    <Link href={`/connection/edit/${connection.id}` as never} asChild>
                      <Button style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}>
                        Edit
                      </Button>
                    </Link>
                    {connection.status === 'connected' || connection.status === 'connecting' ? (
                      <Button
                        onPress={() => disconnectConnection(connection.id)}
                        style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        onPress={() => void connectConnection(connection.id)}
                        style={{ backgroundColor: palette.accent, color: '#ffffff' }}
                      >
                        Connect
                      </Button>
                    )}
                    <Button
                      style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
                      onPress={() => removeConnection(connection.id)}
                    >
                      Delete
                    </Button>
                  </XStack>
                </Card.Footer>
              </Card>
            ))
          )}
        </YStack>
      </ScrollView>

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
