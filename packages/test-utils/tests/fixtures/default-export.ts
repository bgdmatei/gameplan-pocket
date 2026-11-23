// Lint fixture: a default export through the alias form. MUST fail
// `no-restricted-syntax` (named exports only). Used by
// scripts/check-boundaries.mjs and outside `eslint src`.
const value = 1;
export { value as default };
