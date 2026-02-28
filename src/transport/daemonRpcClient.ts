import type {
  DaemonRpcDecodeError,
  DaemonRpcNotification,
  DaemonRpcServerRequest,
  DaemonRpcStreamEnvelope,
  JsonRpcResponse,
} from './types';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const LEGACY_NOTIFICATIONS_TO_OPT_OUT = [
  'codex/event',
  'codex/event/session_configured',
  'codex/event/task_started',
  'codex/event/task_complete',
  'codex/event/turn_started',
  'codex/event/turn_complete',
  'codex/event/raw_response_item',
  'codex/event/agent_message_content_delta',
  'codex/event/agent_message_delta',
  'codex/event/agent_reasoning_delta',
  'codex/event/reasoning_content_delta',
  'codex/event/reasoning_raw_content_delta',
  'codex/event/exec_command_output_delta',
  'codex/event/exec_approval_request',
  'codex/event/exec_command_begin',
  'codex/event/exec_command_end',
  'codex/event/exec_output',
  'codex/event/item_started',
  'codex/event/item_completed',
] as const;
const RPC_DEBUG = false;

export class DaemonRpcClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private openWaiters: { resolve: () => void; reject: (reason?: unknown) => void }[] = [];
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private status: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
  private readonly debugLabel: string;

  onNotification?: (notification: DaemonRpcNotification) => void;
  onServerRequest?: (request: DaemonRpcServerRequest) => void;
  onDecodeError?: (decodeError: DaemonRpcDecodeError) => void;
  onConnectionState?: (status: 'connected' | 'connecting' | 'disconnected' | 'error', err?: string) => void;
  onRawMessage?: (raw: string) => void;

  constructor(debugLabel = 'daemon-rpc') {
    this.debugLabel = debugLabel;
  }

  getStatus() {
    return this.status;
  }

  connect(url: string) {
    this.disconnect('reconnect');
    this.setStatus('connecting');
    this.debug('connect', { url });
    this.initialized = false;
    this.initializing = null;

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) {
        return;
      }
      this.setStatus('connected');
      for (const waiter of this.openWaiters) {
        waiter.resolve();
      }
      this.openWaiters = [];
      this.debug('open');
    };
    ws.onerror = (event) => {
      if (this.ws !== ws) {
        return;
      }
      this.setStatus('error', 'WebSocket error');
      this.debug('error', sanitizeEvent(event));
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) {
        return;
      }
      if (!event.wasClean || event.code !== 1000) {
        this.setStatus(
          'error',
          `WebSocket closed abnormally (code=${event.code}${event.reason ? `, reason=${event.reason}` : ''})`,
        );
      } else {
        this.setStatus('disconnected');
      }
      this.debug('close', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      for (const waiter of this.openWaiters) {
        waiter.reject(new Error('Connection closed before open'));
      }
      this.openWaiters = [];
      for (const request of this.pending.values()) {
        request.reject(new Error('Disconnected'));
      }
      this.pending.clear();
      this.ws = null;
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) {
        return;
      }
      if (typeof event.data !== 'string') {
        this.debug('recv-non-text', { dataType: typeof event.data });
        return;
      }
      this.onRawMessage?.(event.data);
      this.debug('recv', {
        size: event.data.length,
        preview: event.data.slice(0, 300),
      });
      this.handleMessage(event.data);
    };
  }

  disconnect(reason = 'manual') {
    this.debug('disconnect', { reason });
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const request of this.pending.values()) {
      request.reject(new Error('Disconnected'));
    }
    this.pending.clear();
    for (const waiter of this.openWaiters) {
      waiter.reject(new Error('Disconnected'));
    }
    this.openWaiters = [];
    this.initialized = false;
    this.initializing = null;
    this.setStatus('disconnected');
  }

  async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws) {
      throw new Error('Connection is not open');
    }

    await this.waitUntilOpen(10_000);

    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Connection is not open');
    }

    if (method !== 'initialize') {
      await this.ensureInitialized();
    }

    return this.sendRequestInternal(method, params);
  }

  private waitUntilOpen(timeoutMs: number): Promise<void> {
    if (!this.ws) {
      return Promise.reject(new Error('Connection is not open'));
    }
    if (this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.ws.readyState !== WebSocket.CONNECTING) {
      return Promise.reject(new Error('Connection is not open'));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for connection to open'));
      }, timeoutMs);

      this.openWaiters.push({
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = (async () => {
      await this.sendRequestInternal('initialize', {
        clientInfo: {
          name: 'crabbot_android',
          title: 'Crabbot Android',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: LEGACY_NOTIFICATIONS_TO_OPT_OUT,
        },
      });
      this.sendNotification('initialized', {});
      this.initialized = true;
      this.debug('initialized');
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private sendNotification(method: string, params: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Connection is not open');
    }
    const json = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });
    this.debug('send-notification', {
      method,
      size: json.length,
      preview: json.slice(0, 300),
    });
    this.ws.send(json);
  }

  private sendRequestInternal(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Connection is not open');
    }

    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const json = JSON.stringify(payload);
    this.debug('send-request', {
      method,
      id,
      size: json.length,
      preview: json.slice(0, 300),
    });
    this.ws.send(json);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  sendResponse(requestId: unknown, result: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Connection is not open');
    }

    const json = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      result,
    });
    this.debug('send-response', {
      id: requestId,
      size: json.length,
      preview: json.slice(0, 300),
    });
    this.ws.send(json);
  }

  private handleMessage(raw: string) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const stream = this.asStreamEnvelope(parsed);
    if (stream?.event) {
      if (stream.event.type === 'notification') {
        this.onNotification?.(stream.event.payload);
      } else if (stream.event.type === 'server_request') {
        this.onServerRequest?.(stream.event.payload);
      } else if (stream.event.type === 'decode_error') {
        this.onDecodeError?.(stream.event.payload);
      }
      return;
    }

    const response = this.asJsonRpcResponse(parsed);
    if (response) {
      const numericId = Number(response.id);
      const pending = this.pending.get(numericId);
      if (!pending) {
        return;
      }
      this.pending.delete(numericId);
      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
      return;
    }

    const maybeNotification = parsed as { id?: unknown; method?: string; params?: Record<string, unknown> };
    if (typeof maybeNotification.method === 'string') {
      this.onNotification?.({
        id: maybeNotification.id,
        method: maybeNotification.method,
        params: maybeNotification.params,
      });
    }
  }

  private setStatus(status: 'connected' | 'connecting' | 'disconnected' | 'error', err?: string) {
    this.status = status;
    this.onConnectionState?.(status, err);
  }

  private debug(event: string, data?: unknown) {
    if (!RPC_DEBUG) {
      return;
    }
    if (data === undefined) {
      console.log(`[${this.debugLabel}] ${event}`);
      return;
    }
    console.log(`[${this.debugLabel}] ${event}`, data);
  }

  private asStreamEnvelope(value: unknown): DaemonRpcStreamEnvelope | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const envelope = value as DaemonRpcStreamEnvelope;
    return envelope.event ? envelope : null;
  }

  private asJsonRpcResponse(value: unknown): JsonRpcResponse | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const maybe = value as JsonRpcResponse;
    if ((typeof maybe.id === 'number' || typeof maybe.id === 'string') && ('result' in maybe || 'error' in maybe)) {
      return maybe;
    }
    return null;
  }
}

function sanitizeEvent(event: unknown) {
  if (!event || typeof event !== 'object') {
    return event;
  }
  const out: Record<string, unknown> = {};
  for (const key of ['type', 'message', 'code', 'reason']) {
    const value = (event as Record<string, unknown>)[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
