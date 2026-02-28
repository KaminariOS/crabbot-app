import type { DaemonRpcNotification, DaemonRpcServerRequest } from './types';

const STREAM_DEBUG = true;

export type ParsedEvent =
  | { type: 'turn-started'; turnId: string }
  | { type: 'thread-started'; threadId: string }
  | { type: 'user-message'; text: string }
  | { type: 'assistant-message'; text: string }
  | { type: 'assistant-delta'; turnId?: string; delta: string }
  | { type: 'turn-completed'; status: string }
  | { type: 'turn-aborted'; reason?: string }
  | { type: 'tool-begin'; callId: string; toolName: string; title?: string }
  | { type: 'tool-output'; callId: string; delta: string }
  | { type: 'tool-end'; callId: string; success: boolean; output?: string }
  | { type: 'status'; text: string }
  | {
      type: 'approval';
      requestKey: string;
      requestId: unknown;
      method: string;
      reason?: string;
    };

const APPROVAL_REQUEST_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'execCommandApproval',
  'applyPatchApproval',
  'item/tool/requestUserInput',
  'item/tool/elicit',
  'item/mcpToolCall/requestApproval',
]);

export function parseNotification(notification: DaemonRpcNotification): ParsedEvent[] {
  const params = notification.params ?? {};
  const method = notification.method;
  if (STREAM_DEBUG) {
    console.log('[stream-debug][parser] notification', {
      method,
      turnId: asString((params.turn as Record<string, unknown> | undefined)?.id) ?? asString(params.turnId),
      hasDelta: typeof params.delta === 'string' || typeof params.outputDelta === 'string',
    });
  }

  if (method === 'turn/started') {
    const turnId = asString((params.turn as Record<string, unknown> | undefined)?.id) ?? asString(params.turnId);
    return turnId ? [{ type: 'turn-started', turnId }] : [];
  }

  if (method === 'thread/started') {
    const threadId = asString((params.thread as Record<string, unknown> | undefined)?.id) ?? asString(params.threadId);
    return threadId ? [{ type: 'thread-started', threadId }] : [];
  }

  if (method === 'codex/event') {
    return parseCodexEvent(params);
  }

  if (APPROVAL_REQUEST_METHODS.has(method)) {
    return parseApprovalNotification(notification);
  }

  if (method === 'item/completed') {
    const item = asRecord(params.item);
    if (!item) {
      return [];
    }
    return parseCompletedItem(item);
  }

  if (
    method === 'item/agentMessage/delta' ||
    method === 'item/plan/delta' ||
    method === 'item/messageDelta' ||
    method === 'item/agent_message_delta'
  ) {
    const delta = asString(params.delta) ?? asString(params.outputDelta);
    const turnId = asString((params.turn as Record<string, unknown> | undefined)?.id) ?? asString(params.turnId);
    if (STREAM_DEBUG) {
      console.log('[stream-debug][parser] assistant-delta', {
        method,
        turnId,
        deltaLen: delta?.length ?? 0,
        deltaPreview: delta?.slice(0, 60),
      });
    }
    return delta ? [{ type: 'assistant-delta', delta, turnId }] : [];
  }

  if (method === 'turn/completed') {
    return [{ type: 'turn-completed', status: 'completed' }];
  }

  if (method === 'turn/failed') {
    return [{ type: 'turn-completed', status: 'failed' }];
  }

  if (method === 'turn/aborted') {
    return [{ type: 'turn-aborted', reason: asString(params.reason) }];
  }

  if (method === 'item/commandExecution/begin' || method === 'item/fileChange/begin' || method === 'item/mcpToolCall/begin') {
    const callId = asString(params.id) ?? asString(params.callId) ?? asString(params.itemId);
    if (!callId) {
      return [];
    }
    const toolName =
      asString(params.tool) ??
      asString(params.toolName) ??
      asString((params.rawCommand as string[] | undefined)?.[0]) ??
      (method.includes('commandExecution') ? 'exec' : method.includes('fileChange') ? 'patch' : 'mcp');
    return [{ type: 'tool-begin', callId, toolName, title: asString(params.title) }];
  }

  if (method === 'item/commandExecution/outputDelta' || method === 'item/fileChange/outputDelta') {
    const callId = asString(params.id) ?? asString(params.callId) ?? asString(params.itemId);
    const delta = asString(params.delta);
    if (!callId || !delta) {
      return [];
    }
    return [{ type: 'tool-output', callId, delta }];
  }

  if (method === 'item/commandExecution/end' || method === 'item/fileChange/end' || method === 'item/mcpToolCall/end') {
    const callId = asString(params.id) ?? asString(params.callId) ?? asString(params.itemId);
    if (!callId) {
      return [];
    }
    const success = !params.error;
    return [
      {
        type: 'tool-end',
        callId,
        success,
        output: asString(params.stderr) ?? asString(params.stdout),
      },
    ];
  }

  if (method === 'session/configured' || method === 'codex/event/session_configured') {
    return [{ type: 'status', text: 'Session configured' }];
  }

  if (method === 'error') {
    return [{ type: 'status', text: asString(params.message) ?? 'Error from daemon' }];
  }

  return [];
}

export function parseServerRequest(request: DaemonRpcServerRequest): ParsedEvent[] {
  if (!APPROVAL_REQUEST_METHODS.has(request.method)) {
    if (STREAM_DEBUG) {
      console.log('[stream-debug][parser] ignore server request', {
        method: request.method,
        requestIdType: typeof request.request_id,
        paramKeys: Object.keys(request.params ?? {}),
      });
    }
    return [];
  }

  const requestKey = requestIdKeyForCli(request.request_id);
  const reason =
    asString(request.params?.reason) ?? asString(request.params?.prompt) ?? asString(request.params?.message);
  if (STREAM_DEBUG) {
    console.log('[stream-debug][parser] approval server request', {
      method: request.method,
      requestKey,
      requestIdType: typeof request.request_id,
      paramKeys: Object.keys(request.params ?? {}),
      reasonPreview: reason?.slice(0, 120),
    });
  }
  return [
    {
      type: 'approval',
      requestKey,
      requestId: request.request_id,
      method: request.method,
      reason,
    },
  ];
}

export function approvalDecisionForMethod(method: string, approve: boolean): 'approved' | 'denied' | 'accept' | 'decline' {
  if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
    return approve ? 'approved' : 'denied';
  }
  return approve ? 'accept' : 'decline';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseCodexEvent(params: Record<string, unknown>): ParsedEvent[] {
  const event = asRecord(params.event ?? params.payload);
  const msg = asRecord(event?.msg ?? event);
  const msgType = asString(msg?.type)?.toLowerCase();
  if (!msg || !msgType) {
    return [];
  }

  if (msgType === 'turn_started') {
    const turnId = asString(msg.turn_id) ?? asString(msg.turnId);
    return turnId ? [{ type: 'turn-started', turnId }] : [];
  }
  if (msgType === 'turn_complete' || msgType === 'task_complete') {
    return [{ type: 'turn-completed', status: asString(msg.status) ?? 'completed' }];
  }
  if (msgType === 'turn_aborted') {
    return [{ type: 'turn-aborted', reason: asString(msg.reason) }];
  }
  if (msgType === 'user_message') {
    const text = extractMessageText(msg);
    return text ? [{ type: 'user-message', text }] : [];
  }
  if (msgType === 'agent_message') {
    const text = extractMessageText(msg);
    return text ? [{ type: 'assistant-message', text }] : [];
  }
  if (msgType === 'agent_message_delta' || msgType === 'plan_delta') {
    const delta = asString(msg.delta);
    return delta ? [{ type: 'assistant-delta', delta }] : [];
  }
  return [];
}

function parseCompletedItem(item: Record<string, unknown>): ParsedEvent[] {
  const itemType = asString(item.type)?.toLowerCase();
  const role = asString(item.role)?.toLowerCase();
  const text = extractMessageText(item);
  if (!text) return [];

  if (
    itemType === 'usermessage' ||
    itemType === 'user_message' ||
    itemType === 'user-message' ||
    (itemType === 'message' && role === 'user')
  ) {
    return [{ type: 'user-message', text }];
  }

  if (
    itemType === 'agentmessage' ||
    itemType === 'agent_message' ||
    itemType === 'agent-message' ||
    (itemType === 'message' && role === 'assistant')
  ) {
    return [{ type: 'assistant-message', text }];
  }

  return [];
}

function extractMessageText(value: Record<string, unknown>): string | undefined {
  const direct = asString(value.text) ?? asString(value.message);
  if (direct && direct.trim()) return direct;

  const content = value.content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((part) => asString(asRecord(part)?.text))
    .filter((part): part is string => Boolean(part))
    .join('');
  return text.trim() ? text : undefined;
}

function requestIdKeyForCli(requestId: unknown): string {
  if (typeof requestId === 'string' || typeof requestId === 'number') {
    return String(requestId);
  }
  try {
    return JSON.stringify(requestId);
  } catch {
    return 'unknown-request';
  }
}
function parseApprovalNotification(notification: DaemonRpcNotification): ParsedEvent[] {
  const params = notification.params ?? {};
  const requestId =
    notification.id ??
    params.request_id ??
    params.requestId ??
    params.id ??
    params.itemId ??
    params.callId ??
    params.call_id;
  const requestKey = requestIdKeyForCli(requestId);
  const commandReason = asCommandReason(params.command ?? params.rawCommand);
  const reason =
    commandReason ?? asString(params.reason) ?? asString(params.prompt) ?? asString(params.message) ?? asString(params.title);
  if (STREAM_DEBUG) {
    console.log('[stream-debug][parser] approval notification', {
      method: notification.method,
      requestKey,
      hasTopLevelId: notification.id !== undefined,
      reasonPreview: reason?.slice(0, 120),
      paramKeys: Object.keys(params),
    });
  }
  return [
    {
      type: 'approval',
      requestKey,
      requestId,
      method: notification.method,
      reason,
    },
  ];
}

function asCommandReason(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parts = value.filter((part): part is string => typeof part === 'string');
  if (!parts.length) {
    return undefined;
  }
  return parts.join(' ');
}
