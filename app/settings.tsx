import React from 'react';
import { Button, Card, Paragraph, Text, YStack } from 'tamagui';

import { type ThemePreference, useThemeSettings } from '@/src/state/ThemeContext';

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export default function SettingsScreen() {
  const { preference, resolvedTheme, setPreference } = useThemeSettings();

  return (
    <YStack style={{ flex: 1, padding: 16, gap: 12 }}>
      <Card style={{ borderWidth: 1, borderColor: '#d1d5db' }}>
        <Card.Header style={{ gap: 6 }}>
          <Text fontWeight="700">Theme</Text>
          <Paragraph size="$2" color="$gray10">
            Current: {preference} (resolved: {resolvedTheme})
          </Paragraph>
        </Card.Header>
        <Card.Footer>
          <YStack style={{ gap: 8, width: '100%' }}>
            {OPTIONS.map((option) => (
              <Button
                key={option}
                theme={preference === option ? 'blue' : undefined}
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
