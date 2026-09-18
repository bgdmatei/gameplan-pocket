import { z } from 'zod';
import type { $ZodIssue } from 'zod/v4/core';
import type { DomainError } from './errors';

/**
 * Free text that is trimmed before it is measured, so `'  '` fails a
 * `min(1)` rule rather than being stored as whitespace.
 */
export const trimmedText = (min: number, max: number): z.ZodString =>
  z.string().trim().min(min).max(max);

/**
 * Optional free text: blank or missing means "not set", stored as null rather
 * than an empty string, so `''` and `null` can't both appear in the data.
 */
export const optionalTrimmedText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => (value === null || value.trim().length === 0 ? null : value.trim()))
    .pipe(z.string().min(1).max(max).nullable());

/** Turns zod issues into `invalid_field` errors, keeping the field path. */
export const zodIssuesToErrors = (issues: readonly $ZodIssue[], prefix?: string): DomainError[] =>
  issues.map((issue) => {
    const path = issue.path.join('.');
    const field = [prefix, path].filter(Boolean).join('.') || '(root)';
    return { code: 'invalid_field', field, message: issue.message };
  });
