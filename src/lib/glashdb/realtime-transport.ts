type Listener = (event: Event) => void;

const USER_BROADCAST_PUSH = 3;
const JSON_ENCODING = 1;

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function arrayBufferFrom(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy.buffer;
  }
  return null;
}

function normalizeOutgoingString(data: string) {
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return data;
    const [join_ref, ref, topic, event, payload] = parsed;
    return JSON.stringify({ join_ref, ref, topic, event, payload });
  } catch {
    return data;
  }
}

function normalizeOutgoingBroadcast(data: ArrayBuffer) {
  const view = new DataView(data);
  if (view.byteLength < 7 || view.getUint8(0) !== USER_BROADCAST_PUSH) return data;

  const joinRefLength = view.getUint8(1);
  const refLength = view.getUint8(2);
  const topicLength = view.getUint8(3);
  const userEventLength = view.getUint8(4);
  const metadataLength = view.getUint8(5);
  const encoding = view.getUint8(6);

  let offset = 7;
  const join_ref = readAscii(view, offset, joinRefLength);
  offset += joinRefLength;
  const ref = readAscii(view, offset, refLength);
  offset += refLength;
  const topic = readAscii(view, offset, topicLength);
  offset += topicLength;
  const userEvent = readAscii(view, offset, userEventLength);
  offset += userEventLength;
  const metadata = readAscii(view, offset, metadataLength);
  offset += metadataLength;

  const rawPayload = data.slice(offset);
  const payload =
    encoding === JSON_ENCODING
      ? JSON.parse(new TextDecoder().decode(rawPayload))
      : rawPayload;
  const meta = metadata ? JSON.parse(metadata) : {};

  return JSON.stringify({
    join_ref,
    ref,
    topic,
    event: "broadcast",
    payload: {
      type: "broadcast",
      event: userEvent,
      payload,
      ...meta,
    },
  });
}

function normalizeOutgoing(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
  if (typeof data === "string") return normalizeOutgoingString(data);
  const buffer = arrayBufferFrom(data);
  if (!buffer) return data;
  return normalizeOutgoingBroadcast(buffer);
}

function normalizeIncoming(data: unknown) {
  if (typeof data !== "string") return data;
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return data;
    if (parsed && typeof parsed === "object" && "event" in parsed && "topic" in parsed) {
      const message = parsed as {
        join_ref?: string | null;
        ref?: string | null;
        topic?: string;
        event?: string;
        payload?: unknown;
      };
      return JSON.stringify([
        message.join_ref ?? null,
        message.ref ?? null,
        message.topic,
        message.event,
        message.payload ?? {},
      ]);
    }
    return data;
  } catch {
    return data;
  }
}

function makeMessageEvent(source: MessageEvent, data: unknown): MessageEvent {
  if (typeof MessageEvent !== "undefined") {
    return new MessageEvent("message", {
      data,
      origin: source.origin,
      lastEventId: source.lastEventId,
      source: source.source,
      ports: [...source.ports],
    });
  }
  return { ...source, data } as MessageEvent;
}

export class GlashRealtimeWebSocket implements WebSocket {
  private readonly socket: WebSocket;
  private readonly listeners = new Map<string, Set<Listener>>();

  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;

  constructor(url: string | URL, protocols?: string | string[]) {
    const WebSocketCtor = globalThis.WebSocket;
    if (!WebSocketCtor) throw new Error("WebSocket is not available in this runtime.");

    this.socket = protocols ? new WebSocketCtor(url, protocols) : new WebSocketCtor(url);
    this.socket.binaryType = "arraybuffer";
    this.socket.onopen = (event) => this.dispatch("open", event);
    this.socket.onerror = (event) => this.dispatch("error", event);
    this.socket.onclose = (event) => this.dispatch("close", event);
    this.socket.onmessage = (event) => {
      this.dispatch("message", makeMessageEvent(event, normalizeIncoming(event.data)));
    };
  }

  get CONNECTING() { return WebSocket.CONNECTING; }
  get OPEN() { return WebSocket.OPEN; }
  get CLOSING() { return WebSocket.CLOSING; }
  get CLOSED() { return WebSocket.CLOSED; }
  get binaryType() { return this.socket.binaryType; }
  set binaryType(value: BinaryType) { this.socket.binaryType = value; }
  get bufferedAmount() { return this.socket.bufferedAmount; }
  get extensions() { return this.socket.extensions; }
  get protocol() { return this.socket.protocol; }
  get readyState() { return this.socket.readyState; }
  get url() { return this.socket.url; }

  close(code?: number, reason?: string) {
    this.socket.close(code, reason);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.socket.send(normalizeOutgoing(data));
  }

  addEventListener(type: string, listener: EventListener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener as Listener);
  }

  dispatchEvent(event: Event) {
    this.dispatch(event.type, event);
    return true;
  }

  private dispatch(type: string, event: Event) {
    if (type === "open") this.onopen?.call(this, event);
    if (type === "error") this.onerror?.call(this, event);
    if (type === "close") this.onclose?.call(this, event as CloseEvent);
    if (type === "message") this.onmessage?.call(this, event as MessageEvent);
    this.listeners.get(type)?.forEach((listener) => listener.call(this, event));
  }
}

export function getGlashRealtimeOptions() {
  return { transport: GlashRealtimeWebSocket };
}
