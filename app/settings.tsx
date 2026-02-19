import React from 'react';
import { Button, Card, Paragraph, Text, YStack } from 'tamagui';

import { type ThemePreference, useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export default function SettingsScreen() {
  const { preference, resolvedTheme, setPreference } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);

  return (
    <YStack style={{ flex: 1, padding: 16, gap: 12 }}>
      <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
        <Card.Header style={{ gap: 6 }}>
          <Text fontWeight="700" style={{ color: palette.text }}>
            Theme
          </Text>
          <Paragraph size="$2" style={{ color: palette.mutedText }}>
            Current: {preference} (resolved: {resolvedTheme})
          </Paragraph>
        </Card.Header>
        <Card.Footer>
          <YStack style={{ gap: 8, width: '100%' }}>
            {OPTIONS.map((option) => (
              <Button
                key={option}
                style={
                  preference === option
                    ? { backgroundColor: palette.accent, color: '#ffffff' }
                    : {
                        borderWidth: 1,
                        borderColor: palette.border,
                        backgroundColor: palette.surfaceAlt,
                        color: palette.text,
                      }
                }
                onPress={() => setPreference(option)}
              >
                {capitalize(option)}
              </Button>
            ))}
          </YStack>
        </Card.Footer>
      </Card>
    </YStack>
  );
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
