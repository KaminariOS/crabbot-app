import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [initialPositionPhase, setInitialPositionPhase] = useState(true);
  const [scrollMetrics, setScrollMetrics] = useState({
    contentHeight: 1,
    viewportHeight: 1,
    offsetY: 0,
  });

  const listRef = useRef<FlatList<TranscriptCell> | null>(null);
  const visibleCellsRef = useRef<TranscriptCell[]>([]);
  const pendingInitialPositionRef = useRef(true);
  const initialSeekIssuedRef = useRef(false);
  const measuredHeightsRef = useRef<Record<number, number>>({});

  const session = state.sessions.find((item) => item.id === sessionId);
  const runtime = state.runtimes[sessionId] ?? { turnId: null, cells: [] };
  const visibleCells = useMemo(() => coalesceAssistantCells(runtime.cells), [runtime.cells]);
  const initialTargetIndex = useMemo(() => findLatestAgentResponseStartIndex(visibleCells), [visibleCells]);
  useEffect(() => {
    visibleCellsRef.current = visibleCells;
  }, [visibleCells]);
  useEffect(() => {
    if (!STREAM_DEBUG) return;
    const targetCell = initialTargetIndex >= 0 ? visibleCells[initialTargetIndex] : undefined;
    console.log('[initial-position] target computed', {
      sessionId,
      initialTargetIndex,
      targetType: targetCell?.type,
      targetPreview: targetCell?.text?.slice(0, 80),
      visibleCount: visibleCells.length,
    });
  }, [initialTargetIndex, sessionId, visibleCells]);
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
    pendingInitialPositionRef.current = true;
    initialSeekIssuedRef.current = false;
    measuredHeightsRef.current = {};
    setInitialPositionPhase(true);
    setScrollMetrics({ contentHeight: 1, viewportHeight: 1, offsetY: 0 });
  }, [sessionId]);

  const applyInitialPosition = useCallback(() => {
    if (!pendingInitialPositionRef.current) {
      if (STREAM_DEBUG) {
        console.log('[initial-position] skip: pending=false', { sessionId });
      }
      return;
    }
    const currentCells = visibleCellsRef.current;
    if (currentCells.length === 0) {
      if (STREAM_DEBUG) {
        console.log('[initial-position] wait: no cells yet', { sessionId });
      }
      return;
    }
    if (initialTargetIndex < 0 || initialTargetIndex >= visibleCellsRef.current.length) {
      if (STREAM_DEBUG) {
        console.log('[initial-position] wait: invalid target', {
          sessionId,
          initialTargetIndex,
          visibleCount: visibleCellsRef.current.length,
        });
      }
      return;
    }
    const measuredOffset = getMeasuredOffset(measuredHeightsRef.current, initialTargetIndex);
    if (measuredOffset !== null) {
      if (STREAM_DEBUG) {
        const targetCell = visibleCellsRef.current[initialTargetIndex];
        console.log('[initial-position] apply measured scrollToOffset', {
          sessionId,
          initialTargetIndex,
          measuredOffset,
          targetType: targetCell?.type,
          targetPreview: targetCell?.text?.slice(0, 80),
        });
      }
      pendingInitialPositionRef.current = false;
      setInitialPositionPhase(false);
      listRef.current?.scrollToOffset({
        offset: Math.max(0, measuredOffset),
        animated: false,
      });
      return;
    }
    if (initialSeekIssuedRef.current) {
      if (STREAM_DEBUG) {
        console.log('[initial-position] waiting for target layout', { sessionId, initialTargetIndex });
      }
      return;
    }
    initialSeekIssuedRef.current = true;
    if (STREAM_DEBUG) {
      console.log('[initial-position] seek near end to materialize target row', {
        sessionId,
        initialTargetIndex,
        visibleCount: visibleCellsRef.current.length,
      });
    }
    listRef.current?.scrollToEnd({ animated: false });
  }, [initialTargetIndex, sessionId]);

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
  const showHistoryProgress = scrollMetrics.contentHeight > scrollMetrics.viewportHeight + 4;
  const thumbHeight = showHistoryProgress
    ? Math.max(24, (scrollMetrics.viewportHeight * scrollMetrics.viewportHeight) / scrollMetrics.contentHeight)
    : 0;
  const maxOffset = Math.max(0, scrollMetrics.contentHeight - scrollMetrics.viewportHeight);
  const thumbTravel = Math.max(0, scrollMetrics.viewportHeight - thumbHeight);
  const thumbTop =
    showHistoryProgress && maxOffset > 0
      ? Math.min(thumbTravel, Math.max(0, (scrollMetrics.offsetY / maxOffset) * thumbTravel))
      : 0;

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

      <View
        style={{ flex: 1, position: 'relative' }}
        onLayout={(event) => {
          const viewportHeight = Math.max(1, event.nativeEvent.layout.height);
          setScrollMetrics((previous) => ({ ...previous, viewportHeight }));
        }}
      >
        <FlatList
          ref={listRef}
          data={visibleCells}
          initialNumToRender={initialPositionPhase ? Math.max(1, visibleCells.length) : 12}
          maxToRenderPerBatch={initialPositionPhase ? Math.max(1, visibleCells.length) : 12}
          windowSize={initialPositionPhase ? 100 : 21}
          removeClippedSubviews={!initialPositionPhase}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(event) => {
            const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
            setScrollMetrics((previous) => ({ ...previous, offsetY }));
          }}
          onContentSizeChange={(_, contentHeight) => {
            setScrollMetrics((previous) => ({ ...previous, contentHeight: Math.max(1, contentHeight) }));
            if (STREAM_DEBUG) {
              console.log('[initial-position] onContentSizeChange', {
                sessionId,
                contentHeight,
                visibleCount: visibleCellsRef.current.length,
                initialTargetIndex,
              });
            }
            applyInitialPosition();
          }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 8, flexGrow: 1 }}
          renderItem={({ item, index }) => (
            <View
              onLayout={(event) => {
                const rowHeight = Math.max(0, event.nativeEvent.layout.height);
                measuredHeightsRef.current[index] = rowHeight;
                if (STREAM_DEBUG) {
                  console.log('[initial-position] row measured', {
                    sessionId,
                    index,
                    rowHeight,
                    isTarget: index === initialTargetIndex,
                  });
                }
                if (index === initialTargetIndex) {
                  applyInitialPosition();
                }
              }}
            >
              <CellRow cell={item} palette={palette} sessionId={session.id} onApproval={respondApproval} />
            </View>
          )}
          ListEmptyComponent={
            <YStack style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: palette.mutedText }}>Start the conversation.</Text>
            </YStack>
          }
        />
        {showHistoryProgress ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 4,
              top: 0,
              bottom: 0,
              width: 4,
              borderRadius: 999,
              backgroundColor: palette.border,
              opacity: 0.75,
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: thumbHeight,
                top: thumbTop,
                borderRadius: 999,
                backgroundColor: palette.accent,
              }}
            />
          </View>
        ) : null}
      </View>

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
  const merged: TranscriptCell[] = [];
  let brokeByHiddenStatus = false;
  for (const cell of cells) {
    if (cell.type === 'status') {
      // Hidden status rows must still break assistant coalescing so responses remain distinct.
      brokeByHiddenStatus = true;
      continue;
    }
    const prev = merged[merged.length - 1];
    if (cell.type === 'assistant' && prev?.type === 'assistant' && !brokeByHiddenStatus) {
      prev.text = `${prev.text}${cell.text}`;
      if (!prev.turnId && cell.turnId) {
        prev.turnId = cell.turnId;
      }
      brokeByHiddenStatus = false;
      continue;
    }
    merged.push({ ...cell });
    brokeByHiddenStatus = false;
  }
  return merged;
}

function getMeasuredOffset(heightsByIndex: Record<number, number>, targetIndex: number): number | null {
  const TOP_PADDING = 14;
  const ROW_GAP = 8;
  let total = TOP_PADDING;
  for (let index = 0; index < targetIndex; index += 1) {
    const height = heightsByIndex[index];
    if (typeof height !== 'number') {
      return null;
    }
    total += height + ROW_GAP;
  }
  return total;
}

function findLatestAgentResponseStartIndex(cells: TranscriptCell[]): number {
  let endIndex = -1;
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (cells[index]?.type === 'assistant') {
      endIndex = index;
      break;
    }
  }
  if (endIndex < 0) {
    return -1;
  }
  let startIndex = endIndex;
  for (let index = endIndex - 1; index >= 0; index -= 1) {
    if (cells[index]?.type === 'assistant') {
      startIndex = index;
    } else {
      break;
    }
  }
  return startIndex;
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
