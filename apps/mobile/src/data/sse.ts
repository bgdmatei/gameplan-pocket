export type SseMessage =
  { type: 'event'; event: string; data: string } | { type: 'comment'; text: string };

export type SseParser = {
  /** Every message the chunk completes; a partial line waits for the next chunk. */
  push: (chunk: Uint8Array) => SseMessage[];
};

/**
 * Server-Sent Events, the subset our server sends: `event`, `data` and
 * comment lines, ending in LF or CRLF. `id` and `retry` are ignored.
 */
export const createSseParser = (): SseParser => {
  // stream: true keeps a multi-byte character cut by the chunk boundary
  // until its remaining bytes arrive.
  const decoder = new TextDecoder();
  let pending = '';
  let event = '';
  let data: string[] = [];

  const line = (text: string): SseMessage | null => {
    if (text === '') {
      // A blank line ends an event; one without data is dropped.
      const message: SseMessage | null =
        data.length === 0
          ? null
          : { type: 'event', event: event || 'message', data: data.join('\n') };
      event = '';
      data = [];
      return message;
    }
    if (text.startsWith(':')) return { type: 'comment', text: text.slice(1) };
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    const raw = colon === -1 ? '' : text.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    return null;
  };

  return {
    push: (chunk) => {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      const messages: SseMessage[] = [];
      for (const text of lines) {
        const message = line(text.endsWith('\r') ? text.slice(0, -1) : text);
        if (message !== null) messages.push(message);
      }
      return messages;
    },
  };
};
