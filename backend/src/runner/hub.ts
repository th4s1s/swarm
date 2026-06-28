import type { WebSocket } from '@fastify/websocket';

/** Per-app-session pub/sub for streaming run events to connected browsers. */
class Hub {
  private subs = new Map<string, Set<WebSocket>>();

  subscribe(sessionId: string, ws: WebSocket): void {
    let set = this.subs.get(sessionId);
    if (!set) {
      set = new Set();
      this.subs.set(sessionId, set);
    }
    set.add(ws);
  }

  unsubscribe(sessionId: string, ws: WebSocket): void {
    const set = this.subs.get(sessionId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subs.delete(sessionId);
  }

  broadcast(sessionId: string, message: unknown): void {
    const set = this.subs.get(sessionId);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(message);
    for (const ws of set) {
      try {
        ws.send(payload);
      } catch {
        /* drop broken socket on next cycle */
      }
    }
  }

  count(sessionId: string): number {
    return this.subs.get(sessionId)?.size ?? 0;
  }
}

export const hub = new Hub();
