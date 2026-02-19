export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export type Connection = {
  id: string;
  name: string;
  websocketUrl: string;
  createdAt: number;
  updatedAt: number;
  lastConnectedAt: number | null;
  status: ConnectionStatus;
  errorMessage?: string;
};

export type SessionState = 'idle' | 'running' | 'waiting_approval' | 'error';

export type SessionRef = {
  id: string;
  connectionId: string;
  threadId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  state: SessionState;
};

export type TranscriptCell =
  | {
      id: string;
      type: 'user';
      text: string;
      createdAt: number;
    }
  | {
      id: string;
      type: 'assistant';
      text: string;
      createdAt: number;
      turnId?: string;
    }
  | {
      id: string;
      type: 'tool';
      callId: string;
      toolName: string;
      title?: string;
      status: 'running' | 'completed' | 'error';
      output?: string;
      createdAt: number;
    }
  | {
      id: string;
      type: 'approval';
      requestKey: string;
      requestId: unknown;
      method: string;
      reason?: string;
      status: 'pending' | 'approved' | 'denied';
      createdAt: number;
    }
  | {
      id: string;
      type: 'status';
      text: string;
      createdAt: number;
    }
  | {
      id: string;
      type: 'error';
      text: string;
      createdAt: number;
    };

export type SessionRuntime = {
  turnId: string | null;
  cells: TranscriptCell[];
};

export type AppState = {
  connections: Connection[];
  sessions: SessionRef[];
  runtimes: Record<string, SessionRuntime>;
  activeSessionByConnection: Record<string, string | undefined>;
};
