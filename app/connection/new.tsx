import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, Input, Paragraph, Text, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';
import { useThemeSettings } from '@/src/state/ThemeContext';
import { getChatGptPalette } from '@/src/ui/chatgpt';

export default function AddConnectionScreen() {
  const router = useRouter();
  const { addConnection } = useAppState();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const { resolvedTheme } = useThemeSettings();
  const palette = getChatGptPalette(resolvedTheme);

  const normalizedUrl = useMemo(() => normalizeWsUrl(url), [url]);

  const onSave = () => {
    if (!normalizedUrl) {
      Alert.alert('Invalid URL', 'Enter a valid ws:// or wss:// URL.');
      return;
    }
    const fallbackName = safeHostFromUrl(normalizedUrl) ?? 'Connection';
    addConnection(name.trim() || fallbackName, normalizedUrl);
    router.replace('/');
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission denied', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setShowScanner(true);
  };

  if (showScanner) {
    return (
      <YStack style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text fontWeight="700" style={{ color: palette.text }}>
          Scan Connection QR
        </Text>
        <View style={styles.scannerWrap}>
          <CameraView
            style={styles.scanner}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] as never[] }}
            onBarcodeScanned={(event) => {
              const scanned = event.data?.trim();
              if (scanned) {
                setUrl(scanned);
                setShowScanner(false);
              }
            }}
          />
        </View>
        <Button
          onPress={() => setShowScanner(false)}
          style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
        >
          Close Scanner
        </Button>
      </YStack>
    );
  }

  return (
    <YStack style={{ flex: 1, padding: 16 }}>
      <Card style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }}>
        <Card.Header style={{ gap: 10 }}>
          <Text fontWeight="700" style={{ color: palette.text }}>
            Connection Name
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Office daemon"
            style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
          />

          <Text fontWeight="700" style={{ color: palette.text }}>
            WebSocket URL
          </Text>
          <Input
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="wss://host.example/rpc"
            style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
          />
          <Paragraph size="$2" style={{ color: palette.mutedText }}>
            {normalizedUrl ? `Normalized: ${normalizedUrl}` : 'Provide ws:// or wss:// URL'}
          </Paragraph>
        </Card.Header>
        <Card.Footer>
          <YStack style={{ gap: 8, width: '100%' }}>
            <Button
              onPress={() => void openScanner()}
              style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, color: palette.text }}
            >
              Scan QR
            </Button>
            <Button style={{ backgroundColor: palette.accent, color: '#ffffff' }} onPress={onSave}>
              Save Connection
            </Button>
          </YStack>
        </Card.Footer>
      </Card>
    </YStack>
  );
}

function normalizeWsUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  scannerWrap: {
    flex: 1,
    minHeight: 320,
  },
  scanner: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
