# Mobile performance

The app's slice of the budget in plan §12.1, measured on a phone in a Release build against the 5,000-entry seed (T19, spec criterion 7).

## Snapshot (2026-10-06)

- **Device:** iPhone 15 Pro (iOS 27.0.1), Release build from `02f9073`, catalog on staging.
- **Data:** Debug → Erase, then Seed 5,000 real games (1,000 titles, 660-odd set to Playing).
- **How:** the in-app marks in `src/data/perf.ts`, read from Debug → Performance after a scripted session: five cold launches, "zelda", "witcher" and "hades" typed letter by letter, every status chip twice, about ten edits on one game, five full scrolls of the grid.

| Measurement                       | Budget   | Median     | Worst  | Runs | Result                        |
| --------------------------------- | -------- | ---------- | ------ | ---- | ----------------------------- |
| Cold start, JS part               | < 2 s    | **79 ms**  | 79 ms  | 1    | met (JS part only, see below) |
| Keystroke → local results         | < 50 ms  | **16 ms**  | 26 ms  | 20   | met                           |
| Status filter → grid              | < 100 ms | **44 ms**  | 56 ms  | 10   | met                           |
| Edit → database's copy on screen  | < 16 ms  | **64 ms**  | 79 ms  | 6    | **missed**, see below         |
| Grid scroll, JS frames per second | ~60 fps  | **60 fps** | 58 fps | 5    | met (~60), see below          |
| JS heap over 5 full scrolls       | stable   | —          | —      | —    | met: 32.0 MB before and after |

Every timing stops on the frame after the change renders, so it includes getting it onto the screen.

## Notes on each result

**Cold start: only the JS part, and one run.** The mark runs from the moment the bundle starts to the library's first page of covers. What happens before the bundle runs (process launch, loading native modules) is invisible to JS; it needs Instruments' App Launch template, not recorded yet. Timings live in memory, so each force-quit clears them: the five launches left only the last one on screen. 79 ms leaves the 2 s budget with a very wide margin either way.

**Edit → database's copy on screen: missed, with a reason.** The budget is "a local write visible in < 16 ms". By design (spec §Rendering and startup), the editor shows the value the user just set from React state, in the same render as the tap, and the database confirms it afterwards through `useQuery`. This mark measures the second, slower path: the transaction that writes the row and its op, the reactive re-query of the game, and the render of its result, 64 ms at the median. What the user sees is the first path, which was not measured separately; it is a state update in the tap's own render. If the confirmed path ever needs to be faster, the re-query is the likely place to look (it re-reads the whole game detail after every edit).

**Grid scroll: ~60 fps, flagged by a rounding hair.** The screen marked it missed because the worst one-second window was just under 58 fps (shown rounded as 58). The budget is "~60 fps", and the median is 60. This counts frames on the JS thread while the grid moves; dropped frames on the UI thread (hitches) need Instruments' Animation Hitches template, not recorded yet.

**Heap: no growth.** 32.0 MB before five scrolls through all 5,000 covers and 32.0 MB after.

## Deviations

- **Android:** not measured. The Android toolchain isn't set up on this machine (spec decision 14). Flashlight, the planned scroll score, is Android-only, so it waits with it.
- **Native launch and UI-thread hitches:** not measured, as above. Both are an optional Instruments session on the Mac.

## How to reproduce

1. Release build on the phone: `pnpm --filter mobile ios --configuration Release --device <udid>`.
2. Debug → Erase all data, then Seed 5,000 real games.
3. Run the session above; Debug → Reset heap baseline before the scrolls, Refresh numbers after.
4. Read Debug → Performance.

The marks record numbers only: no game names, notes or queries.
