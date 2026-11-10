#!/usr/bin/env node
// PreToolUse guard for Bash: turns CLAUDE.md's git and workspace rules into
// checks, so they hold even when an instruction is missed. Claude Code passes
// the tool call as JSON on stdin; exit code 2 blocks it and stderr tells
// Claude why. Git's own hooks (.githooks/) cover commits made without Claude,
// but `--no-verify` skips those, which is why that flag is refused here.
//
// Test: pnpm exec vitest run .claude/hooks (also run by .githooks/pre-commit
// whenever this folder changes).

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';

/**
 * Heredoc bodies and quoted text are data (commit messages), not commands.
 * One pass over both quote kinds, so an apostrophe inside double quotes can't
 * swallow the commands after it. A quoted single word ("." or "$ROOT") keeps
 * its value: it is a path or ref, and hiding it would hide `git add "."`.
 */
const stripData = (command) =>
  command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, ' ')
    .replace(/'([^']*)'|"((?:\\.|[^"\\])*)"/g, (_, single, double) => {
      const inner = single ?? double;
      return /\s/.test(inner) || inner === '' ? '""' : inner;
    });

/** Each simple command in a chain: split on ;, &&, ||, |, parentheses and newlines. */
const segments = (command) =>
  stripData(command)
    .split(/&&|\|\||[;|\n()]/)
    .map((segment) => segment.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);

/** Global options that take a value, before git's subcommand. */
const VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/** A `git ...` command split into its global options, subcommand and arguments. */
const parseGit = (words) => {
  const at = words.indexOf('git');
  if (at === -1) return null;
  const config = [];
  let dir;
  let i = at + 1;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-c') config.push(words[i + 1] ?? '');
    if (words[i] === '-C') dir = words[i + 1];
    i += VALUED.has(words[i]) ? 2 : 1;
  }
  return { sub: words[i], args: words.slice(i + 1), config, dir };
};

/** A short-flag cluster (`-Av`, `-fu`) that contains `letter`. */
const hasShort = (args, letter) =>
  args.some((arg) => /^-[a-zA-Z]+$/.test(arg) && arg.includes(letter));

/**
 * A trailer at the start of a line or of a quoted argument (a second `-m`,
 * `--trailer`), not a sentence that mentions one.
 */
const ATTRIBUTION = /(^|['"])[^a-zA-Z\n'"]*(co-authored-by:|generated with \[?claude)/im;

/**
 * Why this command breaks a rule, or null when it may run. `branchOf(dir)`
 * returns the current branch of the repo at `dir` (the cwd when undefined),
 * for a push that names no branch.
 */
export const check = (command, { branchOf = () => undefined } = {}) => {
  if (/\bgit\b[\s\S]*\bcommit\b/.test(command) && ATTRIBUTION.test(command)) {
    return 'No Co-Authored-By trailer or AI attribution in commits (CLAUDE.md, Git).';
  }

  for (const words of segments(command)) {
    if (words.includes('--no-verify')) {
      return 'Never use --no-verify: it skips the git hooks (CLAUDE.md, Git).';
    }

    if ((words[0] === 'cd' || words[0] === 'pushd') && words[1] !== undefined) {
      if (!/^[/$]/.test(words[1])) {
        return 'cd by absolute path into the repo, never a relative path (CLAUDE.md, Commands).';
      }
    }

    const git = parseGit(words);
    if (git === null) continue;
    const { sub, args, config, dir } = git;

    if (config.some((setting) => /^core\.hookspath=/i.test(setting))) {
      return 'Overriding core.hooksPath skips the git hooks, like --no-verify (CLAUDE.md, Git).';
    }

    if (
      sub === 'add' &&
      (args.some((arg) => ['--all', '.', './', '*', ':/', '--update'].includes(arg)) ||
        hasShort(args, 'A') ||
        hasShort(args, 'u'))
    ) {
      return 'Stage explicit paths, never a blanket `git add` (CLAUDE.md, Git).';
    }

    if (sub === 'commit' && hasShort(args, 'n')) {
      return '`git commit -n` is --no-verify; it skips the git hooks (CLAUDE.md, Git).';
    }

    if (sub === 'commit' && (hasShort(args, 'a') || args.includes('--all'))) {
      return '`git commit -a` stages every tracked change; stage explicit paths (CLAUDE.md, Git).';
    }

    if (sub === 'push') {
      const refs = args.filter((arg) => !arg.startsWith('-')).slice(1);
      if (
        hasShort(args, 'f') ||
        args.some((arg) => arg.startsWith('--force')) ||
        refs.some((ref) => ref.startsWith('+'))
      ) {
        return 'No force pushes: dev is shared history and main is protected.';
      }
      // HEAD and @ name the current branch, as does a push with no ref at all.
      const current = refs.length === 0 || refs.some((ref) => /^(HEAD|@)(:|$)/.test(ref));
      // --all and --mirror push every branch, main included.
      const toMain =
        args.includes('--all') ||
        args.includes('--mirror') ||
        refs.some((ref) => /(^|:|\/)main$/.test(ref)) ||
        (current && branchOf(dir) === 'main');
      if (toMain) {
        return 'Never push to main; it advances only through a pull request (CLAUDE.md, Git).';
      }
    }
  }
  return null;
};

const branchOf = (dir) => {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  } catch {
    return undefined;
  }
};

/** Run as a script, not imported by the test. Real paths, so a symlinked checkout still runs it. */
const isMain = () => {
  try {
    return realpathSync(new URL(import.meta.url)) === realpathSync(process.argv[1] ?? '');
  } catch {
    return false;
  }
};

if (isMain()) {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input?.tool_input?.command;
  if (typeof command === 'string') {
    const reason = check(command, { branchOf });
    if (reason !== null) {
      process.stderr.write(`Blocked by .claude/hooks/guard-bash.mjs: ${reason}\n`);
      process.exit(2);
    }
  }
}
