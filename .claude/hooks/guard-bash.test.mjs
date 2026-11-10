import { describe, expect, it } from 'vitest';
import { check } from './guard-bash.mjs';

const onDev = { branchOf: () => 'dev' };
const onMain = { branchOf: () => 'main' };

// Commands an agent really ran or was nudged towards in this repo (CLAUDE.md
// §Git, §Commands), plus the bypasses the first code review found.
const blocked = [
  ['git add -A', 'blanket add'],
  ['cd /repo && git add .', 'blanket add after cd'],
  ['git add --all', 'blanket add'],
  ['git add -Av', 'blanket add in a flag cluster'],
  ['git add "."', 'quoted blanket add'],
  ['git add ./', 'blanket add as ./'],
  ['git commit -am "x"', 'commit -a stages everything'],
  ['git push --all origin', 'push --all includes main'],
  ['git commit -m "feat: x" -m "Co-Authored-By: Claude <a@b>"', 'trailer in a second -m'],
  ['git commit --trailer "Co-authored-by: C <a>" -m x', 'trailer by --trailer'],
  ['git -C /repo add -A', 'blanket add with -C'],
  ['git -c x=y add -A', 'blanket add behind -c'],
  [`git commit -m "don't" && git add -A && echo 'x'`, 'apostrophe hiding a command'],
  ['git commit --no-verify -m "x"', 'no-verify'],
  ['git commit -nm "x"', 'commit -n'],
  ['git -c core.hooksPath=/dev/null commit -m x', 'hooks switched off'],
  ['git push origin main', 'push to main'],
  ['git push origin dev:main', 'push to main by refspec'],
  ['git push --force origin dev', 'force push'],
  ['git push -f', 'force push'],
  ['git push -fu origin dev', 'force push in a flag cluster'],
  ['git push origin +dev', 'force push by refspec'],
  ['cd ../..', 'relative cd'],
  ['(cd ../.. && pnpm i)', 'relative cd in a subshell'],
  ['pushd ..', 'relative pushd'],
  [
    "git commit -q -F - <<'EOF'\nfeat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF",
    'trailer',
  ],
];

const allowed = [
  ['git add apps/mobile/src/ui/theme.ts README.md', 'explicit paths'],
  ['git push -q origin dev', 'push to dev'],
  ['git commit -q -m "docs: never git add -A"', 'rule named inside a message'],
  [
    "git commit -q -F - <<'EOF'\nfix: stop --no-verify and git push origin main\nEOF",
    'rules named in a heredoc',
  ],
  [
    "git commit -q -F - <<'EOF'\nci: reject lines such as Generated with Claude Code\nEOF",
    'attribution named in a sentence',
  ],
  ['cd /Users/bogdanmatei/Code/gameplan-pocket && pnpm test', 'absolute cd'],
  ['cd "$ROOT" && pnpm test', 'cd to a variable'],
  ['git log --oneline -5 | grep main', 'main in a log search'],
];

describe('guard-bash', () => {
  it.each(blocked)('blocks %j (%s)', (command) => {
    expect(check(command, onDev)).not.toBeNull();
  });

  it.each(allowed)('allows %j (%s)', (command) => {
    expect(check(command, onDev)).toBeNull();
  });

  it.each(['git push', 'git push origin HEAD', 'git push origin @'])(
    'blocks %j only while on main',
    (command) => {
      expect(check(command, onMain)).not.toBeNull();
      expect(check(command, onDev)).toBeNull();
    },
  );
});
