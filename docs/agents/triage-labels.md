# Triage labels

Every open issue carries exactly one of the first four; `wontfix` marks a closed one. They say who acts next. An issue being worked on keeps `ready-for-agent` until it closes.

| Label             | Meaning                                                            | Who moves it on        |
| ----------------- | ------------------------------------------------------------------ | ---------------------- |
| `needs-triage`    | New; not yet judged in or out of scope                             | Owner                  |
| `needs-info`      | Can't start: a question is open (ask it in a comment)              | Whoever has the answer |
| `ready-for-agent` | Specified well enough for Claude to build without asking           | Claude picks it up     |
| `ready-for-human` | Needs the owner: a device check, a dashboard, a decision, a secret | Owner                  |
| `wontfix`         | Closed on purpose; the closing comment says why                    | —                      |

An issue moves to `ready-for-agent` only when its acceptance criteria and verification are written down. Claude never relabels its own issue `ready-for-agent`: the owner does, which is the review gate between plan and implementation.
