import type { DaemonRpcNotification, DaemonRpcServerRequest } from './types';

const STREAM_DEBUG = true;

export type ParsedEvent =
  | { type: 'turn-started'; turnId: string }
  | { type: 'thread-started'; threadId: string }
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
  if (
    request.method !== 'item/commandExecution/requestApproval' &&
    request.method !== 'item/fileChange/requestApproval' &&
    request.method !== 'execCommandApproval' &&
    request.method !== 'applyPatchApproval' &&
    request.method !== 'item/tool/requestUserInput' &&
    request.method !== 'item/tool/elicit' &&
    request.method !== 'item/mcpToolCall/requestApproval'
  ) {
    return [];
  }

  const requestKey = requestIdKeyForCli(request.request_id);
  const reason = asString(request.params?.reason);
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
