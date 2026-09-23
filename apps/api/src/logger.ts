/**
 * What the API logs through. A seam rather than a library for now: tests
 * capture every line (to prove no secret reaches a log), and a structured
 * logger replaces the console one when observability work arrives.
 */
export type Logger = { warn: (message: string) => void };

export const consoleLogger: Logger = {
  warn: (message) => console.warn(message),
};
