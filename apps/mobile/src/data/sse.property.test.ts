import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createSseParser, type SseMessage } from './sse';

// Multi-byte characters included, so a cut can land inside one.
const text = (minLength = 0) =>
  fc.string({ unit: 'grapheme', minLength }).filter((s) => !s.includes('\n') && !s.includes('\r'));

const message: fc.Arbitrary<SseMessage> = fc.oneof(
  fc
    .record({ event: text(1), lines: fc.array(text(), { minLength: 1, maxLength: 3 }) })
    .map(({ event, lines }) => ({ type: 'event' as const, event, data: lines.join('\n') })),
  text().map((t) => ({ type: 'comment' as const, text: t })),
);

const encode = (messages: SseMessage[], eol: string) =>
  messages
    .map((m) =>
      m.type === 'comment'
        ? `:${m.text}${eol}`
        : [`event: ${m.event}`, ...m.data.split('\n').map((d) => `data: ${d}`), '']
            .map((l) => l + eol)
            .join(''),
    )
    .join('');

describe('SSE parser', () => {
  it('parses any stream the same, however the bytes are chunked', () => {
    fc.assert(
      fc.property(
        fc.array(message, { maxLength: 8 }),
        fc.constantFrom('\n', '\r\n'),
        fc.array(fc.nat(), { maxLength: 12 }),
        (messages, eol, rawCuts) => {
          const bytes = new TextEncoder().encode(encode(messages, eol));
          const cuts = [...new Set(rawCuts.map((c) => c % (bytes.length + 1)))].sort(
            (a, b) => a - b,
          );
          const parser = createSseParser();
          const parsed = [0, ...cuts, bytes.length]
            .slice(1)
            .flatMap((end, i, ends) => parser.push(bytes.subarray(ends[i - 1] ?? 0, end)));
          expect(parsed).toEqual(messages);
        },
      ),
    );
  });
});
