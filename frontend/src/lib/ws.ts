import { useEffect, useRef, useState } from 'react';
import type { StreamEvent, WsMessage } from './types';

export interface LiveEvent {
  seq: number;
  runId: string;
  event: StreamEvent;
}

export interface SessionSocketState {
  connected: boolean;
  /** live events observed since the socket opened (capped) */
  events: LiveEvent[];
  sessionStatus: 'running' | 'idle' | null;
  claudeSessionId: string | null;
  clear: () => void;
}

const MAX_EVENTS = 4000;

/**
 * Subscribe to /ws/sessions/:id. Streams live Claude events + run/session
 * lifecycle. `onMessage` fires for every envelope (used by the parent to
 * invalidate findings/report/runs queries on run completion). Auto-reconnects.
 */
export function useSessionSocket(
  sessionId: string | undefined,
  onMessage?: (m: WsMessage) => void,
): SessionSocketState {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'running' | 'idle' | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const seqRef = useRef(0);
  const onMsgRef = useRef(onMessage);
  onMsgRef.current = onMessage;

  useEffect(() => {
    if (!sessionId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/sessions/${sessionId}`);

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 500 * retry);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(ev.data) as WsMessage;
        } catch {
          return;
        }
        onMsgRef.current?.(msg);
        if (msg.kind === 'event') {
          setEvents((prev) => {
            const next = prev.concat({ seq: seqRef.current++, runId: msg.runId, event: msg.event });
            return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
          });
        } else if (msg.kind === 'session') {
          if (msg.status) setSessionStatus(msg.status);
          if (msg.claude_session_id) setClaudeSessionId(msg.claude_session_id);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [sessionId]);

  return {
    connected,
    events,
    sessionStatus,
    claudeSessionId,
    clear: () => setEvents([]),
  };
}
