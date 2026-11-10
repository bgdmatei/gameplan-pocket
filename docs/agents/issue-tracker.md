# Issue tracker

Work is tracked in GitHub Issues on `bgdmatei/gameplan-pocket`, through the `gh` CLI. Issues replace `tasks/todo.md` from module 8 (`sync-transport`) on.

## How a module flows

1. **Spec.** `SPEC-<module-id>.md` (local) is written and approved. Nothing below starts without it.
2. **Milestone.** One per module, named after it: `8 sync-transport`.
3. **Issues.** The plan's tasks become issues in that milestone, one vertical slice each, small enough for one PR-sized commit series. Every issue states:
   - **What** it delivers, in a sentence.
   - **Acceptance**: what must be true, including the attack criteria the spec requires.
   - **Verify**: the commands or checks that prove it.
   - **Depends on**: issue numbers, if any.
4. **Work.** Pick the lowest-numbered `ready-for-agent` issue whose dependencies are closed. Commits still happen only when the owner asks (CLAUDE.md, Git); they go on `dev` with `Refs #<n>` in the body, and the last one says `Closes #<n>`.
5. **Close-out.** When the milestone is empty, the module's PR (`dev` → `main`) lists the closed issues.

## Commands

```sh
gh issue list --milestone "8 sync-transport" --state open
gh issue view <n>
gh issue create --title "..." --body-file <file> --milestone "..." --label needs-triage
gh issue edit <n> --add-label ... --remove-label ...
gh issue comment <n> --body-file <file>
gh issue close <n> --comment "..."
```

## Rules

- Issue titles and bodies are public: no note text, emails, tokens or secrets, same as commits.
- No AI attribution in issues, comments or PRs (CLAUDE.md, Git).
- New issues start as `needs-triage`; only the owner moves one to `ready-for-agent`. Create, comment on or close issues as part of the work; creating a milestone or a new label needs the owner's OK first.
- A finding that is real but out of scope becomes an issue labelled `needs-triage`, not a drive-by fix.
