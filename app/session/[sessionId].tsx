import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Input, Paragraph, ScrollView, Text, XStack, YStack } from 'tamagui';

import type { TranscriptCell } from '@/src/domain/types';
import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette, type ChatGptPalette } from '@/src/ui/chatgpt';

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = String(params.sessionId ?? '');

  const { state, setActiveSession, sendMessage, interruptSession, resumeSession, forkSession, respondApproval } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);
  const [text, setText] = useState('');

  const session = state.sessions.find((item) => item.id === sessionId);
  const runtime = state.runtimes[sessionId] ?? { turnId: null, cells: [] };

  useEffect(() => {
    if (session) {
      setActiveSession(session.id);
    }
  }, [session, setActiveSession]);

  if (!session) {
    return (
      <YStack style={{ flex: 1, padding: 16 }}>
        <Text fontWeight="700" style={{ color: palette.text }}>
          Session not found
        </Text>
      </YStack>
    );
  }

  return (
    <YStack style={{ flex: 1 }}>
      <YStack style={{ padding: 16, gap: 8 }}>
        <Text fontWeight="700" style={{ color: palette.text }}>
          {session.title}
        </Text>
        <Paragraph size="$2" style={{ color: palette.mutedText }}>
          threadId: {session.threadId}
        </Paragraph>
        <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button
            style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
            onPress={async () => {
              try {
                await resumeSession(session.id);
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
              try {
                await interruptSession(session.id);
              } catch (error) {
                Alert.alert('Interrupt failed', error instanceof Error ? error.message : 'Unknown interrupt error');
              }
            }}
            disabled={!runtime.turnId}
          >
            Interrupt
          </Button>
          <Button
            style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
            onPress={async () => {
              try {
                await forkSession(session.id);
              } catch (error) {
                Alert.alert('Fork failed', error instanceof Error ? error.message : 'Unknown fork error');
              }
            }}
          >
            Fork
          </Button>
        </XStack>
      </YStack>

      <ScrollView>
        <YStack style={{ padding: 16, gap: 8, paddingBottom: 48 }}>
          {runtime.cells.length === 0 ? (
            <Paragraph style={{ color: palette.mutedText }}>No messages yet.</Paragraph>
          ) : (
            runtime.cells.map((cell) => (
              <CellRow key={cell.id} cell={cell} palette={palette} sessionId={session.id} onApproval={respondApproval} />
            ))
          )}
        </YStack>
      </ScrollView>

      <YStack style={{ padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface }}>
        <Input
          value={text}
          onChangeText={setText}
          placeholder="Type message"
          multiline
          numberOfLines={3}
          autoCapitalize="sentences"
          style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
        />
        <Button
          style={{ backgroundColor: palette.accent, color: '#ffffff' }}
          onPress={async () => {
            const trimmed = text.trim();
            if (!trimmed) return;
            setText('');
            try {
              await sendMessage(session.id, trimmed);
            } catch (error) {
              Alert.alert('Send failed', error instanceof Error ? error.message : 'Unknown send error');
            }
          }}
        >
          Send
        </Button>
      </YStack>
    </YStack>
  );
}

function CellRow(props: {
  cell: TranscriptCell;
  palette: ChatGptPalette;
  sessionId: string;
  onApproval: (sessionId: string, requestKey: string, approve: boolean) => Promise<void>;
}) {
  const { cell, palette } = props;

  if (cell.type === 'approval') {
    return (
      <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
        <Card.Header>
          <Text fontWeight="700" style={{ color: palette.text }}>
            Approval Required
          </Text>
          <Paragraph size="$2" style={{ color: palette.mutedText }}>
            method: {cell.method}
          </Paragraph>
          {cell.reason ? (
            <Paragraph size="$2" style={{ color: palette.mutedText }}>
              reason: {cell.reason}
            </Paragraph>
          ) : null}
          <Paragraph size="$2" style={{ color: palette.mutedText }}>
            status: {cell.status}
          </Paragraph>
        </Card.Header>
        {cell.status === 'pending' ? (
          <Card.Footer>
            <XStack style={{ gap: 8 }}>
              <Button
                style={{ backgroundColor: palette.accent, color: '#ffffff' }}
                onPress={() => void props.onApproval(props.sessionId, cell.requestKey, true)}
              >
                Approve
              </Button>
              <Button
                style={{ backgroundColor: palette.danger, color: '#ffffff' }}
                onPress={() => void props.onApproval(props.sessionId, cell.requestKey, false)}
              >
                Deny
              </Button>
            </XStack>
          </Card.Footer>
        ) : null}
      </Card>
    );
  }

  if (cell.type === 'tool') {
    return (
      <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
        <Card.Header>
          <Text fontWeight="700" style={{ color: palette.text }}>
            Tool: {cell.toolName}
          </Text>
          <Paragraph size="$2" style={{ color: palette.mutedText }}>
            status: {cell.status}
          </Paragraph>
          {cell.title ? (
            <Paragraph size="$2" style={{ color: palette.mutedText }}>
              {cell.title}
            </Paragraph>
          ) : null}
          {cell.output ? (
            <Paragraph size="$2" style={{ color: palette.text }}>
              {cell.output}
            </Paragraph>
          ) : null}
        </Card.Header>
      </Card>
    );
  }

  if (cell.type === 'assistant') {
    return (
      <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.assistantBubble }}>
        <Card.Header>
          <Text style={{ color: palette.text }}>{cell.text}</Text>
        </Card.Header>
      </Card>
    );
  }

  if (cell.type === 'user') {
    return (
      <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.userBubble }}>
        <Card.Header>
          <Text style={{ color: palette.text }}>{cell.text}</Text>
        </Card.Header>
      </Card>
    );
  }

  if (cell.type === 'error') {
    return (
      <Card style={{ borderWidth: 1, borderColor: palette.danger, backgroundColor: palette.surface }}>
        <Card.Header>
          <Text style={{ color: palette.danger }}>{cell.text}</Text>
        </Card.Header>
      </Card>
    );
  }

  return (
    <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
      <Card.Header>
        <Paragraph size="$2" style={{ color: palette.mutedText }}>
          {cell.text}
        </Paragraph>
      </Card.Header>
    </Card>
  );
}
