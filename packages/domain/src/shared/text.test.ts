import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { optionalTrimmedText, trimmedText, zodIssuesToErrors } from './text';

describe('trimmedText', () => {
  it('trims before measuring, so whitespace is not a value', () => {
    expect(trimmedText(1, 5).parse('  ab  ')).toBe('ab');
    expect(trimmedText(1, 5).safeParse('   ').success).toBe(false);
  });
});

describe('optionalTrimmedText', () => {
  it('stores blank as null, so empty and missing cannot both appear', () => {
    const schema = optionalTrimmedText(5);

    expect(schema.parse('  ab ')).toBe('ab');
    expect(schema.parse('   ')).toBeNull();
    expect(schema.parse(null)).toBeNull();
  });
});

describe('zodIssuesToErrors', () => {
  it('keeps the field path, so a screen can mark the right input', () => {
    const result = z
      .object({ progress: z.object({ value: z.string() }) })
      .safeParse({ progress: { value: 3 } });

    if (result.success) throw new Error('expected a failure');
    expect(zodIssuesToErrors(result.error.issues)[0]).toMatchObject({
      code: 'invalid_field',
      field: 'progress.value',
    });
  });
});
