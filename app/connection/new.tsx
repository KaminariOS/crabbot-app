import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Input, Paragraph, Text, YStack } from 'tamagui';

import { useAppState } from '@/src/state/AppContext';

export default function AddConnectionScreen() {
  const router = useRouter();
  const { addConnection } = useAppState();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

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
        <Text fontWeight="700">Scan Connection QR</Text>
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
        <Button onPress={() => setShowScanner(false)}>Close Scanner</Button>
      </YStack>
    );
  }

  return (
    <YStack style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text fontWeight="700">Connection Name</Text>
      <Input value={name} onChangeText={setName} placeholder="Office daemon" />

      <Text fontWeight="700">WebSocket URL</Text>
      <Input
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="wss://host.example/rpc"
      />
      <Paragraph size="$2" color="$gray10">
        {normalizedUrl ? `Normalized: ${normalizedUrl}` : 'Provide ws:// or wss:// URL'}
      </Paragraph>

      <Button onPress={() => void openScanner()}>Scan QR</Button>
      <Button theme="blue" onPress={onSave}>
        Save Connection
      </Button>
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
