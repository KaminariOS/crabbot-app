export type DaemonRpcNotification = {
  id?: unknown;
  method: string;
  params?: Record<string, unknown>;
};

export type DaemonRpcServerRequest = {
  request_id: unknown;
  method: string;
  params?: Record<string, unknown>;
};

export type DaemonRpcDecodeError = {
  raw: string;
  message: string;
};

export type DaemonRpcStreamEnvelope = {
  schema_version?: number;
  sequence?: number;
  event?:
    | { type: 'notification'; payload: DaemonRpcNotification }
    | { type: 'server_request'; payload: DaemonRpcServerRequest }
    | { type: 'decode_error'; payload: DaemonRpcDecodeError };
};

export type JsonRpcResponse = {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};
