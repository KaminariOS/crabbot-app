# Crabbot Expo App

React Native + Expo client for Codex daemon sessions over WebSocket, targeting Android and Web parity.

This app is the step-by-step port of the `crabbot` TUI into a mobile/web UX.

## What It Does

- Manages multiple daemon connections (`ws://` / `wss://`)
- Auto-connects and auto-reconnects with backoff
- Discovers threads periodically and maps them to local sessions
- Resumes threads and hydrates transcript history
- Sends user turns and renders streaming assistant deltas
- Renders tool execution blocks and approval requests
- Supports approve/deny actions for server requests
- Shows in-app banners for approvals / turn completion
- Schedules native local notifications when available
- Supports deep links for `crabbot://thread/<thread-id>` and `/thread/<thread-id>`
- Persists app state and theme preference with AsyncStorage

## Tech Stack

- Expo SDK 54 + Expo Router
- React Native 0.81 / React 19
- Tamagui for UI primitives
- `expo-notifications` for local notification delivery
- `expo-camera` for QR-based connection setup
- `react-native-markdown-display` for assistant markdown rendering

## Project Structure

- `app/_layout.tsx`: Root providers, stack routes, top-right settings button, in-app notification overlay
- `app/index.tsx`: Main Terminals screen (connections + sessions list, resume/refresh/connect/disconnect actions)
- `app/connection/new.tsx`: Add connection (manual URL + QR scan)
- `app/connection/edit/[connectionId].tsx`: Edit connection details
- `app/connection/[connectionId].tsx`: Per-connection session management
- `app/session/[sessionId].tsx`: Chat runtime UI (streaming, approvals, tool output)
- `app/thread/[threadId].tsx`: Thread deep-link resolution + redirect into session
- `app/+native-intent.tsx`: Native intent path normalization for thread links
- `src/state/AppContext.tsx`: Core state machine, transport orchestration, reconnect/session lifecycle
- `src/transport/daemonRpcClient.ts`: JSON-RPC over WebSocket client + initialization handshake
- `src/transport/eventParser.ts`: Parses daemon notifications/server-requests into UI events
- `src/notifications/pushNotifications.ts`: Native notification init + delivery helpers

## Daemon RPC Methods Used

The app currently uses these request methods against the Codex app-server:

- `initialize`
- `thread/start`
- `thread/list`
- `thread/read`
- `thread/resume`
- `thread/fork`
- `turn/start`
- `turn/interrupt`

It also handles streaming notifications and server approval requests across both modern and legacy event formats.

## Requirements

- Node.js + npm
- Expo CLI (`npx expo ...`)
- A reachable Codex daemon WebSocket endpoint

For Android device testing, use a development build when you need full native notification behavior.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start Expo (normal):

```bash
npm run start
```

3. Start Expo with tunnel (useful on device/network issues):

```bash
npm run start -- --tunnel
# or
npx expo start --tunnel
```

4. Start Expo with cache clear (when Metro/Expo cache is stale):

```bash
npm run start -- --clear
# or
npx expo start --clear
```

5. Open targets from the running dev server:

```bash
npm run android
npm run web
```

## Usage Flow

1. Open **Terminals**.
2. Add a connection via:
- manual `ws://` or `wss://` URL, or
- QR code scan.
3. Connect and either:
- Resume latest session, or
- Create / discover sessions from daemon threads.
4. Open a session and send messages.
5. Handle approval cards (Approve/Deny) when daemon requests input.

## Configuration Notes

- Android cleartext traffic is enabled via `plugins/withAndroidCleartext.js`.
- App scheme is `crabbot` (see `app.json`).
- Push token registration endpoint is derived from WebSocket origin as:
  - `ws://...` -> `http://.../v1/notifications/register`
  - `wss://...` -> `https://.../v1/notifications/register`

## Current State

This repository still contains some Expo template files (for example `app/(tabs)/*`, `app/modal.tsx`) that are not part of the primary stack flow used by the current Crabbot experience.

## Scripts

- `npm run start`: Start Expo dev server
- `npm run start -- --tunnel`: Start Expo with tunnel mode
- `npm run start -- --clear`: Start Expo and clear Metro/Expo cache
- `npm run android`: Launch Android target
- `npm run ios`: Launch iOS target
- `npm run web`: Launch web target
- `npm run lint`: Run Expo lint

## EAS Build (Android Preview)

```bash
npx eas-cli@latest build:configure
npx eas-cli@latest build -p android --profile preview
```

## Migration Goal

Keep Android and Web feature parity while iteratively porting TUI behaviors from `~/repos/crabbot` into this Expo app.
