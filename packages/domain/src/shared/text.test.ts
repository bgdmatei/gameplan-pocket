import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { optionalTrimmedText, trimmedText, zodIssuesToErrors } from './text';

describe('trimmedText', () => {
  const schema = trimmedText(1, 5);

  it('trims before measuring', () => {
    expect(schema.parse('  ab  ')).toBe('ab');
    expect(schema.parse(' abcde ')).toBe('abcde');
  });

  it('rejects whitespace-only and over-long input', () => {
    expect(schema.safeParse('   ').success).toBe(false);
    expect(schema.safeParse('abcdef').success).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(schema.safeParse(7).success).toBe(false);
  });
});

describe('optionalTrimmedText', () => {
  const schema = optionalTrimmedText(5);

  it('keeps trimmed text', () => {
    expect(schema.parse('  ab  ')).toBe('ab');
  });

  it.each([null, '', '   '])('stores %o as null', (value) => {
    expect(schema.parse(value)).toBeNull();
  });

  it('rejects text over the limit', () => {
    expect(schema.safeParse('abcdef').success).toBe(false);
  });
});

describe('zodIssuesToErrors', () => {
  it('maps each issue to an invalid_field error with a dotted path', () => {
    const schema = z.object({
      rating: z.number().int(),
      progress: z.object({ value: z.string() }),
    });
    const result = schema.safeParse({ rating: 1.5, progress: { value: 3 } });

    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = zodIssuesToErrors(result.error.issues);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({
      code: 'invalid_field',
      field: 'rating',
      message: expect.any(String),
    });
    expect(errors[1]).toMatchObject({ code: 'invalid_field', field: 'progress.value' });
  });

  it('names the root when the issue has no path', () => {
    const result = z.string().safeParse(1);
    if (result.success) return;
    expect(zodIssuesToErrors(result.error.issues)[0]).toMatchObject({ field: '(root)' });
  });

  it('prefixes a path when asked', () => {
    const result = z.object({ text: z.string() }).safeParse({ text: 1 });
    if (result.success) return;
    expect(zodIssuesToErrors(result.error.issues, 'patch')[0]).toMatchObject({
      field: 'patch.text',
    });
  });
});
