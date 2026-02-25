import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

import type { TranscriptCell } from '@/src/domain/types';
import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette, type ChatGptPalette } from '@/src/ui/chatgpt';

const STREAM_DEBUG = true;

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = String(params.sessionId ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { state, setActiveSession, sendMessage, respondApproval } = useAppState();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);
  const [text, setText] = useState('');
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  const listRef = useRef<FlatList<TranscriptCell> | null>(null);

  const session = state.sessions.find((item) => item.id === sessionId);
  const runtime = state.runtimes[sessionId] ?? { turnId: null, cells: [] };
  const visibleCells = useMemo(() => coalesceAssistantCells(runtime.cells), [runtime.cells]);
  useEffect(() => {
    if (!STREAM_DEBUG) return;
    const rawAssistant = runtime.cells.filter((cell) => cell.type === 'assistant').length;
    const visibleAssistant = visibleCells.filter((cell) => cell.type === 'assistant').length;
    console.log('[stream-debug][render] cells', {
      sessionId,
      rawCount: runtime.cells.length,
      rawAssistant,
      visibleCount: visibleCells.length,
      visibleAssistant,
      lastVisibleType: visibleCells[visibleCells.length - 1]?.type,
    });
  }, [runtime.cells, sessionId, visibleCells]);

  useEffect(() => {
    if (session) {
      setActiveSession(session.id);
    }
  }, [session, setActiveSession]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [visibleCells.length]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onShow = Keyboard.addListener('keyboardDidShow', (event) => {
      setAndroidKeyboardHeight(event.endCoordinates.height);
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const statusLabel = runtime.turnId ? 'Thinking' : 'Idle';
  const statusColor = runtime.turnId ? palette.accent : palette.mutedText;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !session) return;

    setText('');
    try {
      await sendMessage(session.id, trimmed);
    } catch (error) {
      Alert.alert('Send failed', error instanceof Error ? error.message : 'Unknown send error');
    }
  };

  if (!session) {
    return (
      <YStack style={{ flex: 1, padding: 20, backgroundColor: palette.appBg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: palette.text, fontWeight: '700', fontSize: 18 }}>Session not found</Text>
      </YStack>
    );
  }

  return (
    <YStack style={{ flex: 1, backgroundColor: palette.appBg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <YStack
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 12,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
          backgroundColor: palette.headerBg,
        }}
      >
        <XStack style={{ alignItems: 'center', gap: 8 }}>
          <Button
            size="$3"
            circular
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
              width: 36,
              height: 36,
            }}
            accessibilityLabel="Back"
          >
            <Feather name="arrow-left" size={16} color={palette.text} />
          </Button>

          <YStack style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
              {session.title}
            </Text>
            <Paragraph numberOfLines={1} size="$2" style={{ color: palette.mutedText }}>
              thread: {session.threadId}
            </Paragraph>
          </YStack>

          <XStack style={{ alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: statusColor,
              }}
            />
            <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>{statusLabel}</Text>
          </XStack>
        </XStack>
      </YStack>

      <FlatList
        ref={listRef}
        data={visibleCells}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 8, flexGrow: 1 }}
        renderItem={({ item }) => (
          <CellRow cell={item} palette={palette} sessionId={session.id} onApproval={respondApproval} />
        )}
        ListEmptyComponent={
          <YStack style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: palette.mutedText }}>Start the conversation.</Text>
          </YStack>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        keyboardVerticalOffset={0}
        style={{ marginBottom: Platform.OS === 'android' ? androidKeyboardHeight : 0 }}
      >
        <YStack
          style={{
            borderTopWidth: 1,
            borderTopColor: palette.border,
            backgroundColor: palette.surface,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 8),
            gap: 8,
          }}
        >
          <XStack style={{ alignItems: 'center', gap: 8 }}>
            <Input
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              multiline={false}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => void handleSend()}
              autoCapitalize="sentences"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surfaceAlt,
                color: palette.text,
                minHeight: 42,
              }}
            />
          </XStack>
        </YStack>
      </KeyboardAvoidingView>
    </YStack>
  );
}

function coalesceAssistantCells(cells: TranscriptCell[]): TranscriptCell[] {
  const visible = cells.filter((cell) => cell.type !== 'status');
  const merged: TranscriptCell[] = [];
  for (const cell of visible) {
    const prev = merged[merged.length - 1];
    if (cell.type === 'assistant' && prev?.type === 'assistant') {
      prev.text = `${prev.text}${cell.text}`;
      if (!prev.turnId && cell.turnId) {
        prev.turnId = cell.turnId;
      }
      continue;
    }
    merged.push({ ...cell });
  }
  return merged;
}

function CellRow(props: {
  cell: TranscriptCell;
  palette: ChatGptPalette;
  sessionId: string;
  onApproval: (sessionId: string, requestKey: string, approve: boolean) => Promise<void>;
}) {
  const { cell, palette } = props;
  const markdownStyle = useMemo(() => getMarkdownStyle(palette), [palette]);

  if (cell.type === 'user') {
    return (
      <XStack style={{ justifyContent: 'flex-end' }}>
        <YStack
          style={{
            maxWidth: '85%',
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 14,
            backgroundColor: palette.userBubble,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: palette.text, lineHeight: 20 }}>{cell.text}</Text>
        </YStack>
      </XStack>
    );
  }

  if (cell.type === 'assistant') {
    return (
      <XStack style={{ justifyContent: 'flex-start' }}>
        <YStack
          style={{
            maxWidth: '90%',
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 14,
            backgroundColor: palette.assistantBubble,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Markdown style={markdownStyle}>{cell.text}</Markdown>
        </YStack>
      </XStack>
    );
  }

  if (cell.type === 'approval') {
    return (
      <YStack
        style={{
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 12,
          backgroundColor: palette.surface,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={{ color: palette.text, fontWeight: '700' }}>Approval required</Text>
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
        {cell.status === 'pending' ? (
          <XStack style={{ gap: 8, marginTop: 4 }}>
            <Button
              style={{ flex: 1, borderColor: palette.accent, backgroundColor: palette.accent, color: '#ffffff' }}
              onPress={() => void props.onApproval(props.sessionId, cell.requestKey, true)}
            >
              Approve
            </Button>
            <Button
              style={{ flex: 1, borderColor: palette.danger, backgroundColor: palette.danger, color: '#ffffff' }}
              onPress={() => void props.onApproval(props.sessionId, cell.requestKey, false)}
            >
              Deny
            </Button>
          </XStack>
        ) : null}
      </YStack>
    );
  }

  if (cell.type === 'tool') {
    return (
      <YStack
        style={{
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 12,
          backgroundColor: palette.surface,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={{ color: palette.text, fontWeight: '700' }}>{cell.toolName}</Text>
        <Paragraph size="$2" style={{ color: palette.mutedText }}>
          status: {cell.status}
        </Paragraph>
        {cell.title ? (
          <Paragraph size="$2" style={{ color: palette.mutedText }}>
            {cell.title}
          </Paragraph>
        ) : null}
        {cell.output ? <Text style={{ color: palette.text }}>{cell.output}</Text> : null}
      </YStack>
    );
  }

  if (cell.type === 'error') {
    return (
      <YStack
        style={{
          borderWidth: 1,
          borderColor: palette.danger,
          borderRadius: 12,
          backgroundColor: palette.surface,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: palette.danger }}>{cell.text}</Text>
      </YStack>
    );
  }

  return (
    <YStack
      style={{
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: 12,
        backgroundColor: palette.surface,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Paragraph size="$2" style={{ color: palette.mutedText }}>
        {cell.text}
      </Paragraph>
    </YStack>
  );
}

function getMarkdownStyle(palette: ChatGptPalette) {
  return {
    body: {
      color: palette.text,
      marginTop: 0,
      marginBottom: 0,
    },
    paragraph: {
      color: palette.text,
      lineHeight: 20,
      marginTop: 0,
      marginBottom: 8,
    },
    code_inline: {
      color: palette.text,
      backgroundColor: palette.surfaceAlt,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 6,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    code_block: {
      color: palette.text,
      backgroundColor: palette.surfaceAlt,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    fence: {
      color: palette.text,
      backgroundColor: palette.surfaceAlt,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    bullet_list: {
      marginTop: 0,
      marginBottom: 8,
    },
    ordered_list: {
      marginTop: 0,
      marginBottom: 8,
    },
    heading1: {
      color: palette.text,
      marginTop: 0,
      marginBottom: 8,
    },
    heading2: {
      color: palette.text,
      marginTop: 0,
      marginBottom: 8,
    },
    heading3: {
      color: palette.text,
      marginTop: 0,
      marginBottom: 8,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: palette.border,
      paddingLeft: 10,
      marginLeft: 0,
      color: palette.mutedText,
    },
    link: {
      color: palette.accent,
    },
  };
}
