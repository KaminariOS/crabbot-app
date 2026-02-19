import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import type { AppState, Connection, SessionRef, TranscriptCell } from '@/src/domain/types';
import { DaemonRpcClient } from '@/src/transport/daemonRpcClient';
import { parseNotification, parseServerRequest, type ParsedEvent } from '@/src/transport/eventParser';

const STORAGE_KEY = 'crabbot_android_state_v1';
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

const initialState: AppState = {
  connections: [],
  sessions: [],
  runtimes: {},
  activeSessionByConnection: {},
};

type AppAction =
  | { type: 'hydrate'; payload: AppState }
  | { type: 'add-connection'; payload: Connection }
  | {
      type: 'update-connection';
      payload: { connectionId: string; name: string; websocketUrl: string; resetStatus: boolean };
    }
  | { type: 'remove-connection'; payload: { connectionId: string } }
  | { type: 'set-connection-status'; payload: { connectionId: string; status: Connection['status']; errorMessage?: string } }
  | { type: 'upsert-session'; payload: SessionRef }
  | { type: 'set-active-session'; payload: { connectionId: string; sessionId: string } }
  | { type: 'append-cell'; payload: { sessionId: string; cell: TranscriptCell } }
  | { type: 'patch-cell'; payload: { sessionId: string; cellId: string; patch: Partial<TranscriptCell> } }
  | { type: 'set-turn'; payload: { sessionId: string; turnId: string | null } };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.payload;
    case 'add-connection':
      return { ...state, connections: [action.payload, ...state.connections] };
    case 'update-connection':
      return {
        ...state,
        connections: state.connections.map((connection) =>
          connection.id === action.payload.connectionId
            ? {
                ...connection,
                name: action.payload.name.trim() || 'Connection',
                websocketUrl: action.payload.websocketUrl,
                updatedAt: Date.now(),
                status: action.payload.resetStatus ? 'disconnected' : connection.status,
                errorMessage: action.payload.resetStatus ? undefined : connection.errorMessage,
              }
            : connection,
        ),
      };
    case 'remove-connection': {
      const { connectionId } = action.payload;
      const sessions = state.sessions.filter((s) => s.connectionId !== connectionId);
      const runtimes = { ...state.runtimes };
      for (const session of state.sessions) {
        if (session.connectionId === connectionId) {
          delete runtimes[session.id];
        }
      }
      return {
        ...state,
        connections: state.connections.filter((c) => c.id !== connectionId),
        sessions,
        runtimes,
      };
    }
    case 'set-connection-status':
      return {
        ...state,
        connections: state.connections.map((connection) =>
          connection.id === action.payload.connectionId
            ? {
                ...connection,
                status: action.payload.status,
                updatedAt: Date.now(),
                lastConnectedAt: action.payload.status === 'connected' ? Date.now() : connection.lastConnectedAt,
                errorMessage: action.payload.errorMessage,
              }
            : connection,
        ),
      };
    case 'upsert-session': {
      const existing = state.sessions.find((s) => s.id === action.payload.id);
      if (existing) {
        return {
          ...state,
          sessions: state.sessions.map((s) => (s.id === action.payload.id ? action.payload : s)),
        };
      }
      return {
        ...state,
        sessions: [action.payload, ...state.sessions],
        runtimes: {
          ...state.runtimes,
          [action.payload.id]: state.runtimes[action.payload.id] ?? { turnId: null, cells: [] },
        },
      };
    }
    case 'set-active-session':
      return {
        ...state,
        activeSessionByConnection: {
          ...state.activeSessionByConnection,
          [action.payload.connectionId]: action.payload.sessionId,
        },
      };
    case 'append-cell': {
      const runtime = state.runtimes[action.payload.sessionId] ?? { turnId: null, cells: [] };
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.payload.sessionId]: {
            ...runtime,
            cells: [...runtime.cells, action.payload.cell],
          },
        },
      };
    }
    case 'patch-cell': {
      const runtime = state.runtimes[action.payload.sessionId] ?? { turnId: null, cells: [] };
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.payload.sessionId]: {
            ...runtime,
            cells: runtime.cells.map((cell) =>
              cell.id === action.payload.cellId ? ({ ...cell, ...action.payload.patch } as TranscriptCell) : cell,
            ),
          },
        },
      };
    }
    case 'set-turn': {
      const runtime = state.runtimes[action.payload.sessionId] ?? { turnId: null, cells: [] };
      return {
        ...state,
        runtimes: {
          ...state.runtimes,
          [action.payload.sessionId]: { ...runtime, turnId: action.payload.turnId },
        },
      };
    }
    default:
      return state;
  }
}

type AppContextType = {
  state: AppState;
  addConnection: (name: string, websocketUrl: string) => string;
  updateConnection: (connectionId: string, name: string, websocketUrl: string) => boolean;
  removeConnection: (connectionId: string) => void;
  connectConnection: (connectionId: string) => Promise<void>;
  disconnectConnection: (connectionId: string) => void;
  createSession: (connectionId: string) => Promise<SessionRef>;
  resumeLatestSession: (connectionId: string) => Promise<SessionRef>;
  discoverSessions: (connectionId: string) => Promise<void>;
  forkSession: (sessionId: string) => Promise<SessionRef | null>;
  resumeSession: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, text: string) => Promise<void>;
  interruptSession: (sessionId: string) => Promise<void>;
  respondApproval: (sessionId: string, requestKey: string, approve: boolean) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider(props: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const stateRef = useRef(state);
  const clientsRef = useRef(new Map<string, DaemonRpcClient>());
  const approvalRequestIdRef = useRef(new Map<string, unknown>());
  const reconnectTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reconnectAttemptsRef = useRef(new Map<string, number>());
  const autoReconnectEnabledRef = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as AppState;
        dispatch({ type: 'hydrate', payload: parsed });
      } catch {
        // Ignore corrupted persisted state.
      }
    })();
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const clearReconnectTimer = useCallback((connectionId: string) => {
    const timer = reconnectTimersRef.current.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimersRef.current.delete(connectionId);
    }
  }, []);

  const resetReconnectState = useCallback(
    (connectionId: string) => {
      clearReconnectTimer(connectionId);
      reconnectAttemptsRef.current.delete(connectionId);
    },
    [clearReconnectTimer],
  );

  const applyParsedEvent = useCallback((connectionId: string, event: ParsedEvent) => {
    const currentState = stateRef.current;
    const activeSessionId = currentState.activeSessionByConnection[connectionId];
    const session = activeSessionId ? currentState.sessions.find((s) => s.id === activeSessionId) : undefined;
    if (!session) {
      return;
    }

    if (event.type === 'thread-started') {
      dispatch({ type: 'upsert-session', payload: { ...session, threadId: event.threadId, updatedAt: Date.now() } });
      return;
    }

    if (event.type === 'turn-started') {
      dispatch({ type: 'set-turn', payload: { sessionId: session.id, turnId: event.turnId } });
      return;
    }

    if (event.type === 'assistant-delta') {
      const runtime = currentState.runtimes[session.id] ?? { turnId: null, cells: [] };
      const lastCell = runtime.cells[runtime.cells.length - 1];
      if (lastCell?.type === 'assistant') {
        dispatch({
          type: 'patch-cell',
          payload: {
            sessionId: session.id,
            cellId: lastCell.id,
            patch: { text: `${lastCell.text}${event.delta}` },
          },
        });
      } else {
        dispatch({
          type: 'append-cell',
          payload: {
            sessionId: session.id,
            cell: {
              id: makeId(),
              type: 'assistant',
              text: event.delta,
              createdAt: Date.now(),
              turnId: event.turnId,
            },
          },
        });
      }
      return;
    }

    if (event.type === 'turn-completed') {
      dispatch({ type: 'set-turn', payload: { sessionId: session.id, turnId: null } });
      dispatch({
        type: 'append-cell',
        payload: {
          sessionId: session.id,
          cell: {
            id: makeId(),
            type: 'status',
            text: `Turn ${event.status}`,
            createdAt: Date.now(),
          },
        },
      });
      return;
    }

    if (event.type === 'turn-aborted') {
      dispatch({ type: 'set-turn', payload: { sessionId: session.id, turnId: null } });
      dispatch({
        type: 'append-cell',
        payload: {
          sessionId: session.id,
          cell: {
            id: makeId(),
            type: 'status',
            text: event.reason ? `Turn aborted: ${event.reason}` : 'Turn aborted',
            createdAt: Date.now(),
          },
        },
      });
      return;
    }

    if (event.type === 'tool-begin') {
      dispatch({
        type: 'append-cell',
        payload: {
          sessionId: session.id,
          cell: {
            id: event.callId,
            type: 'tool',
            callId: event.callId,
            toolName: event.toolName,
            title: event.title,
            status: 'running',
            createdAt: Date.now(),
          },
        },
      });
      return;
    }

    if (event.type === 'tool-output') {
      const runtime = currentState.runtimes[session.id] ?? { turnId: null, cells: [] };
      const target = runtime.cells.find((cell) => cell.type === 'tool' && cell.callId === event.callId);
      if (!target || target.type !== 'tool') {
        return;
      }
      dispatch({
        type: 'patch-cell',
        payload: {
          sessionId: session.id,
          cellId: target.id,
          patch: { output: `${target.output ?? ''}${event.delta}` },
        },
      });
      return;
    }

    if (event.type === 'tool-end') {
      const runtime = currentState.runtimes[session.id] ?? { turnId: null, cells: [] };
      const target = runtime.cells.find((cell) => cell.type === 'tool' && cell.callId === event.callId);
      if (!target || target.type !== 'tool') {
        return;
      }
      dispatch({
        type: 'patch-cell',
        payload: {
          sessionId: session.id,
          cellId: target.id,
          patch: {
            status: event.success ? 'completed' : 'error',
            output: event.output ?? target.output,
          },
        },
      });
      return;
    }

    if (event.type === 'status') {
      dispatch({
        type: 'append-cell',
        payload: {
          sessionId: session.id,
          cell: { id: makeId(), type: 'status', text: event.text, createdAt: Date.now() },
        },
      });
      return;
    }

    if (event.type === 'approval') {
      approvalRequestIdRef.current.set(event.requestKey, event.requestId);
      dispatch({
        type: 'append-cell',
        payload: {
          sessionId: session.id,
          cell: {
            id: makeId(),
            type: 'approval',
            requestKey: event.requestKey,
            requestId: event.requestId,
            method: event.method,
            reason: event.reason,
            status: 'pending',
            createdAt: Date.now(),
          },
        },
      });
    }
  }, []);

  const ensureClient = useCallback(
    async (connectionId: string): Promise<DaemonRpcClient> => {
      const existing = clientsRef.current.get(connectionId);
      if (existing) {
        const connection = stateRef.current.connections.find((item) => item.id === connectionId);
        const url = connection?.websocketUrl;
        const status = existing.getStatus();
        if (url && (status === 'disconnected' || status === 'error')) {
          console.log('[connection] reconnect existing client', { connectionId, status, url });
          existing.connect(url);
        } else {
          console.log('[connection] reuse client', { connectionId, status });
        }
        return existing;
      }

      const connection = stateRef.current.connections.find((item) => item.id === connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const client = new DaemonRpcClient(`conn:${connectionId.slice(0, 8)}`);
      client.onConnectionState = (status, err) => {
        console.log('[connection] state', { connectionId, status, err });
        dispatch({ type: 'set-connection-status', payload: { connectionId, status, errorMessage: err } });

        if (status === 'connected') {
          resetReconnectState(connectionId);
          return;
        }

        if (status === 'error' || status === 'disconnected') {
          if (!autoReconnectEnabledRef.current.has(connectionId)) {
            return;
          }

          const connection = stateRef.current.connections.find((item) => item.id === connectionId);
          if (!connection) {
            return;
          }

          if (reconnectTimersRef.current.has(connectionId)) {
            return;
          }

          const attempt = reconnectAttemptsRef.current.get(connectionId) ?? 0;
          const exponentialDelay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
          const jitteredDelay = Math.round(exponentialDelay * (0.85 + Math.random() * 0.3));
          console.log('[connection] schedule reconnect', { connectionId, attempt: attempt + 1, delayMs: jitteredDelay });

          const timer = setTimeout(() => {
            reconnectTimersRef.current.delete(connectionId);

            if (!autoReconnectEnabledRef.current.has(connectionId)) {
              return;
            }

            const currentConnection = stateRef.current.connections.find((item) => item.id === connectionId);
            if (!currentConnection) {
              return;
            }

            reconnectAttemptsRef.current.set(connectionId, attempt + 1);
            void ensureClient(connectionId).catch((error) => {
              console.log('[connection] reconnect timer connect failed', { connectionId, error });
            });
          }, jitteredDelay);

          reconnectTimersRef.current.set(connectionId, timer);
        }
      };
      client.onRawMessage = (raw) => {
        console.log('[connection] raw message', {
          connectionId,
          size: raw.length,
          preview: raw.slice(0, 300),
        });
      };
      client.onNotification = (notification) => {
        console.log('[connection] notification', { connectionId, method: notification.method });
        for (const parsed of parseNotification(notification)) {
          applyParsedEvent(connectionId, parsed);
        }
      };
      client.onServerRequest = (request) => {
        console.log('[connection] server request', { connectionId, method: request.method });
        for (const parsed of parseServerRequest(request)) {
          applyParsedEvent(connectionId, parsed);
        }
      };
      client.onDecodeError = (decodeError) => {
        console.log('[connection] decode error', { connectionId, decodeError });
        applyParsedEvent(connectionId, {
          type: 'status',
          text: `[decode error] ${decodeError.message}`,
        });
      };

      client.connect(connection.websocketUrl);
      clientsRef.current.set(connectionId, client);
      return client;
    },
    [applyParsedEvent, resetReconnectState],
  );

  const connectConnection = useCallback(
    async (connectionId: string) => {
      autoReconnectEnabledRef.current.add(connectionId);
      clearReconnectTimer(connectionId);
      try {
        await ensureClient(connectionId);
      } catch (error) {
        console.log('[connection] connect failed', { connectionId, error });
        dispatch({
          type: 'set-connection-status',
          payload: {
            connectionId,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown connect error',
          },
        });

        const attempt = reconnectAttemptsRef.current.get(connectionId) ?? 0;
        const exponentialDelay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
        const jitteredDelay = Math.round(exponentialDelay * (0.85 + Math.random() * 0.3));
        if (!reconnectTimersRef.current.has(connectionId)) {
          const timer = setTimeout(() => {
            reconnectTimersRef.current.delete(connectionId);
            reconnectAttemptsRef.current.set(connectionId, attempt + 1);
            void connectConnection(connectionId);
          }, jitteredDelay);
          reconnectTimersRef.current.set(connectionId, timer);
        }
      }
    },
    [clearReconnectTimer, ensureClient],
  );

  const addConnection = useCallback((name: string, websocketUrl: string) => {
    const now = Date.now();
    const connection: Connection = {
      id: makeId(),
      name: name.trim() || 'Connection',
      websocketUrl,
      createdAt: now,
      updatedAt: now,
      lastConnectedAt: null,
      status: 'disconnected',
    };
    dispatch({ type: 'add-connection', payload: connection });
    autoReconnectEnabledRef.current.add(connection.id);
    setTimeout(() => {
      void connectConnection(connection.id);
    }, 0);
    return connection.id;
  }, [connectConnection]);

  const updateConnection = useCallback((connectionId: string, name: string, websocketUrl: string) => {
    const existing = stateRef.current.connections.find((connection) => connection.id === connectionId);
    if (!existing) {
      return false;
    }

    const didUrlChange = existing.websocketUrl !== websocketUrl;
    if (didUrlChange) {
      resetReconnectState(connectionId);
      clientsRef.current.get(connectionId)?.disconnect();
      clientsRef.current.delete(connectionId);
    }

    dispatch({
      type: 'update-connection',
      payload: { connectionId, name, websocketUrl, resetStatus: didUrlChange },
    });
    return true;
  }, [resetReconnectState]);

  const removeConnection = useCallback((connectionId: string) => {
    autoReconnectEnabledRef.current.delete(connectionId);
    resetReconnectState(connectionId);
    clientsRef.current.get(connectionId)?.disconnect();
    clientsRef.current.delete(connectionId);
    dispatch({ type: 'remove-connection', payload: { connectionId } });
  }, [resetReconnectState]);

  const disconnectConnection = useCallback((connectionId: string) => {
    autoReconnectEnabledRef.current.delete(connectionId);
    resetReconnectState(connectionId);
    clientsRef.current.get(connectionId)?.disconnect();
    clientsRef.current.delete(connectionId);
    dispatch({ type: 'set-connection-status', payload: { connectionId, status: 'disconnected' } });
  }, [resetReconnectState]);

  useEffect(() => {
    const reconnectTimers = reconnectTimersRef.current;
    const reconnectAttempts = reconnectAttemptsRef.current;
    const autoReconnectEnabled = autoReconnectEnabledRef.current;
    const clients = clientsRef.current;

    return () => {
      for (const timer of reconnectTimers.values()) {
        clearTimeout(timer);
      }
      reconnectTimers.clear();
      reconnectAttempts.clear();
      autoReconnectEnabled.clear();
      for (const client of clients.values()) {
        client.disconnect('provider-unmount');
      }
      clients.clear();
    };
  }, []);

  const createSession = useCallback(
    async (connectionId: string): Promise<SessionRef> => {
      const client = await ensureClient(connectionId);
      const attempts: { method: string; params: Record<string, unknown> }[] = [
        { method: 'thread/start', params: { approvalPolicy: 'on-request' } },
        { method: 'thread/start', params: {} },
      ];

      const attemptErrors: string[] = [];
      let raw: unknown = null;
      let threadId: string | null = null;

      for (const attempt of attempts) {
        try {
          raw = await client.sendRequest(attempt.method, attempt.params);
          threadId = extractThreadId(raw);
          if (threadId) {
            break;
          }
          attemptErrors.push(`${attempt.method}: response had no thread id`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          attemptErrors.push(`${attempt.method}: ${message}`);
        }
      }

      if (!threadId) {
        throw new Error(`Failed to create session. ${attemptErrors.join(' | ')}`);
      }

      const now = Date.now();
      const session: SessionRef = {
        id: makeId(),
        connectionId,
        threadId,
        title: `Session ${new Date(now).toLocaleTimeString()}`,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        state: 'idle',
      };
      dispatch({ type: 'upsert-session', payload: session });
      dispatch({ type: 'set-active-session', payload: { connectionId, sessionId: session.id } });
      return session;
    },
    [ensureClient],
  );

  const discoverSessions = useCallback(
    async (connectionId: string) => {
      const client = await ensureClient(connectionId);
      let raw: { data?: { id?: string; title?: string; updatedAt?: number; createdAt?: number }[] };
      try {
        raw = (await client.sendRequest('thread/list', {
          limit: 50,
          archived: false,
        })) as { data?: { id?: string; title?: string; updatedAt?: number; createdAt?: number }[] };
      } catch (error) {
        console.log('[rpc] thread/list failed', { connectionId, error });
        throw error;
      }

      const data = raw?.data ?? [];
      for (const item of data) {
        if (!item.id) {
          continue;
        }
        const existing = stateRef.current.sessions.find(
          (session) => session.connectionId === connectionId && session.threadId === item.id,
        );
        const now = Date.now();
        const session: SessionRef = {
          id: existing?.id ?? makeId(),
          connectionId,
          threadId: item.id,
          title: item.title ?? `Thread ${item.id.slice(0, 8)}`,
          createdAt: item.createdAt ?? existing?.createdAt ?? now,
          updatedAt: item.updatedAt ?? now,
          lastActivityAt: item.updatedAt ?? now,
          state: existing?.state ?? 'idle',
        };
        dispatch({ type: 'upsert-session', payload: session });
      }
    },
    [ensureClient],
  );

  const forkSession = useCallback(
    async (sessionId: string): Promise<SessionRef | null> => {
      const session = stateRef.current.sessions.find((s) => s.id === sessionId);
      if (!session) {
        return null;
      }
      const client = await ensureClient(session.connectionId);
      const raw = await client.sendRequest('thread/fork', { threadId: session.threadId });
      const newThreadId = extractThreadId(raw);
      if (!newThreadId) {
        throw new Error('thread/fork returned no thread id');
      }
      const now = Date.now();
      const forked: SessionRef = {
        id: makeId(),
        connectionId: session.connectionId,
        threadId: newThreadId,
        title: `${session.title} (fork)`,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        state: 'idle',
      };
      dispatch({ type: 'upsert-session', payload: forked });
      dispatch({ type: 'set-active-session', payload: { connectionId: session.connectionId, sessionId: forked.id } });
      return forked;
    },
    [ensureClient],
  );

  const resumeSession = useCallback(
    async (sessionId: string) => {
      const session = stateRef.current.sessions.find((s) => s.id === sessionId);
      if (!session) {
        return;
      }
      const client = await ensureClient(session.connectionId);
      await client.sendRequest('thread/resume', { threadId: session.threadId });
      dispatch({
        type: 'append-cell',
        payload: {
          sessionId: session.id,
          cell: {
            id: makeId(),
            type: 'status',
            text: `Resumed thread ${session.threadId}`,
            createdAt: Date.now(),
          },
        },
      });
    },
    [ensureClient],
  );

  const resumeLatestSession = useCallback(
    async (connectionId: string): Promise<SessionRef> => {
      const latestForConnection = (): SessionRef | null => {
        const candidates = stateRef.current.sessions
          .filter((session) => session.connectionId === connectionId)
          .sort((a, b) => {
            const aTs = Math.max(a.updatedAt, a.lastActivityAt);
            const bTs = Math.max(b.updatedAt, b.lastActivityAt);
            return bTs - aTs;
          });
        return candidates[0] ?? null;
      };

      let target = latestForConnection();
      if (!target) {
        await discoverSessions(connectionId);
        target = latestForConnection();
      }

      if (!target) {
        throw new Error('No sessions to resume for this connection');
      }

      await resumeSession(target.id);
      dispatch({ type: 'set-active-session', payload: { connectionId, sessionId: target.id } });
      return target;
    },
    [discoverSessions, resumeSession],
  );

  const sendMessage = useCallback(
    async (sessionId: string, text: string) => {
      const session = stateRef.current.sessions.find((s) => s.id === sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      const client = await ensureClient(session.connectionId);

      dispatch({
        type: 'append-cell',
        payload: {
          sessionId,
          cell: {
            id: makeId(),
            type: 'user',
            text,
            createdAt: Date.now(),
          },
        },
      });

      let result: { turn?: { id?: string } };
      try {
        result = (await client.sendRequest('turn/start', {
          threadId: session.threadId,
          input: [{ type: 'text', text, text_elements: [] }],
        })) as { turn?: { id?: string } };
      } catch (error) {
        console.log('[rpc] turn/start failed', { sessionId, threadId: session.threadId, error });
        dispatch({
          type: 'append-cell',
          payload: {
            sessionId,
            cell: {
              id: makeId(),
              type: 'error',
              text: `turn/start failed: ${error instanceof Error ? error.message : 'unknown error'}`,
              createdAt: Date.now(),
            },
          },
        });
        return;
      }

      const turnId = result?.turn?.id;
      if (turnId) {
        dispatch({ type: 'set-turn', payload: { sessionId, turnId } });
      }
    },
    [ensureClient],
  );

  const interruptSession = useCallback(
    async (sessionId: string) => {
      const runtime = stateRef.current.runtimes[sessionId];
      const session = stateRef.current.sessions.find((s) => s.id === sessionId);
      if (!session || !runtime?.turnId) {
        return;
      }
      const client = await ensureClient(session.connectionId);
      await client.sendRequest('turn/interrupt', {
        threadId: session.threadId,
        turnId: runtime.turnId,
      });
    },
    [ensureClient],
  );

  const respondApproval = useCallback(
    async (sessionId: string, requestKey: string, approve: boolean) => {
      const session = stateRef.current.sessions.find((s) => s.id === sessionId);
      if (!session) {
        return;
      }
      const client = await ensureClient(session.connectionId);
      const requestId = approvalRequestIdRef.current.get(requestKey);
      if (requestId === undefined) {
        return;
      }
      client.sendResponse(requestId, { decision: approve ? 'approved' : 'denied' });

      const runtime = stateRef.current.runtimes[sessionId] ?? { turnId: null, cells: [] };
      const approvalCell = runtime.cells.find(
        (cell) => cell.type === 'approval' && cell.requestKey === requestKey,
      );
      if (approvalCell?.type === 'approval') {
        dispatch({
          type: 'patch-cell',
          payload: {
            sessionId,
            cellId: approvalCell.id,
            patch: { status: approve ? 'approved' : 'denied' },
          },
        });
      }
    },
    [ensureClient],
  );

  const setActiveSession = useCallback((sessionId: string) => {
    const session = stateRef.current.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return;
    }
    dispatch({ type: 'set-active-session', payload: { connectionId: session.connectionId, sessionId } });
  }, []);

  const contextValue = useMemo<AppContextType>(
    () => ({
      state,
      addConnection,
      updateConnection,
      removeConnection,
      connectConnection,
      disconnectConnection,
      createSession,
      resumeLatestSession,
      discoverSessions,
      forkSession,
      resumeSession,
      sendMessage,
      interruptSession,
      respondApproval,
      setActiveSession,
    }),
    [
      state,
      addConnection,
      updateConnection,
      removeConnection,
      connectConnection,
      disconnectConnection,
      createSession,
      resumeLatestSession,
      discoverSessions,
      forkSession,
      resumeSession,
      sendMessage,
      interruptSession,
      respondApproval,
      setActiveSession,
    ],
  );

  return <AppContext.Provider value={contextValue}>{props.children}</AppContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside AppProvider');
  }
  return ctx;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractThreadId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const threadId =
    asString(record.threadId) ??
    asString(record.thread_id) ??
    asString(record.id) ??
    asString((record.thread as Record<string, unknown> | undefined)?.id);
  return threadId ?? null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
