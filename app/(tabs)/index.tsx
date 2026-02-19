import { Image } from 'expo-image';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { openBrowserAsync } from 'expo-web-browser';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isHandlingScan, setIsHandlingScan] = useState(false);
  const [lastScannedValue, setLastScannedValue] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('No active WebSocket connection.');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  const connectWebSocket = (url: string) => {
    try {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      setConnectionStatus(`Connecting to ${url}...`);
      const socket = new WebSocket(url);

      socket.onopen = () => {
        setConnectionStatus(`Connected to ${url}`);
      };

      socket.onerror = () => {
        setConnectionStatus(`Failed to connect to ${url}`);
      };

      socket.onclose = () => {
        setConnectionStatus(`Disconnected from ${url}`);
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };

      socketRef.current = socket;
    } catch {
      setConnectionStatus(`Failed to connect to ${url}`);
      Alert.alert('WebSocket error', `Could not start a WebSocket connection to ${url}.`);
    }
  };

  const handleScannedValue = async (rawValue: string) => {
    const value = rawValue.trim();
    setLastScannedValue(value);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value);
    } catch {
      Alert.alert('Invalid QR code', 'The scanned value is not a valid URL.');
      return;
    }

    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      try {
        await openBrowserAsync(value);
      } catch {
        Alert.alert('Open URL failed', `Could not open ${value}.`);
      }
      return;
    }

    if (parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:') {
      connectWebSocket(value);
      return;
    }

    Alert.alert(
      'Unsupported QR code',
      'Only http/https URLs and ws/wss WebSocket URLs are supported.',
    );
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to scan QR codes.');
        return;
      }
    }

    setIsHandlingScan(false);
    setIsScannerOpen(true);
  };

  const onBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (isHandlingScan) {
      return;
    }

    setIsHandlingScan(true);
    setIsScannerOpen(false);
    try {
      await handleScannedValue(result.data);
    } catch {
      Alert.alert('Scan failed', 'An unexpected error happened while handling this QR code.');
    } finally {
      setIsHandlingScan(false);
    }
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Pressable style={styles.scanButton} onPress={openScanner}>
          <ThemedText type="defaultSemiBold" style={styles.scanButtonText}>
            Scan QR Code
          </ThemedText>
        </Pressable>
        <ThemedText>{connectionStatus}</ThemedText>
        {lastScannedValue ? (
          <ThemedText numberOfLines={2}>Last scan: {lastScannedValue}</ThemedText>
        ) : null}
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Link href="/modal">
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
      <Modal visible={isScannerOpen} animationType="slide" onRequestClose={() => setIsScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <CameraView style={styles.camera} facing="back" onBarcodeScanned={onBarcodeScanned} />
          <Pressable style={styles.closeButton} onPress={() => setIsScannerOpen(false)}>
            <ThemedText type="defaultSemiBold" style={styles.closeButtonText}>
              Close
            </ThemedText>
          </Pressable>
        </View>
      </Modal>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  scanButton: {
    backgroundColor: '#0D7EA2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  scanButtonText: {
    color: '#FFFFFF',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: '#000000CC',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeButtonText: {
    color: '#FFFFFF',
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
