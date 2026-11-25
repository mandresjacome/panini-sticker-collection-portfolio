import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import { beforeEach, vi } from "vitest";

export const request = vi.fn<typeof fetch>();
const client = createClient("http://supabase.test", "fake-public-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (...args) => request(...args) },
});

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
const listeners = new Set<AuthListener>();
let session: Session | null = null;

export function sessionChange(event: AuthChangeEvent, userId: string | null) {
  session = userId ? {
    access_token: "test-token",
    refresh_token: "test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: { id: userId, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" },
  } : null;
  for (const listener of listeners) listener(event, session);
}

class TestChannel {
  filter = "";
  change?: (payload: { eventType: "UPDATE"; new: unknown }) => void;
  status?: (value: string) => void;
  closed = false;

  on(_event: string, options: { filter: string }, callback: TestChannel["change"]) {
    this.filter = options.filter;
    this.change = callback;
    return this;
  }

  subscribe(callback: TestChannel["status"]) {
    this.status = callback;
    return this;
  }

  update(row: unknown) { this.change?.({ eventType: "UPDATE", new: row }); }
}

export const channels: TestChannel[] = [];

export const supabase = {
  from: client.from.bind(client),
  auth: {
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      queueMicrotask(() => {
        if (listeners.has(listener)) listener("INITIAL_SESSION", session);
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signOut() { sessionChange("SIGNED_OUT", null); return { error: null }; },
  },
  channel() {
    const channel = new TestChannel();
    channels.push(channel);
    return channel;
  },
  async removeChannel(channel: TestChannel) { channel.closed = true; },
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export function stickerRow(cantidad: number, fields = {}) {
  return {
    codigo: "MEX2", equipo: "MEX", tipo: "Selección", estado: "D",
    cantidad, observacion: null, categoria: null, precio: null, nombre: null,
    updated_at: "2026-01-01T00:00:00Z", updated_by: null, ...fields,
  };
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (input) => { throw new Error(`Solicitud de prueba imprevista: ${String(input)}`); });
  channels.length = 0;
  listeners.clear();
  session = null;
});
