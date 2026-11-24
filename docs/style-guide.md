# Style guide

The mobile app's design system: the patterns every screen and future feature reuses. Read it before building or changing a screen, and update it in the same commit when a pattern changes. Values live in `theme.ts` and `palette.ts`; this guide says which to use and when. Written for module 15 (`visual-design`, approved 2026-10-23, finished 2026-11-10), formerly the local `MOBILE-DESIGN.md`; it replaces "Arcade Night" (2026-09-30).

## App Read

An offline-first game logbook, made of a cover-grid library, search, a per-game editor, and playthrough notes. Cover art carries the colour, and the chrome is soft, rounded and frosted.

- **Direction:** image-led and atmospheric, after two reference screenshots ("Day Transits", "Daily Horoscope").
  - Cover art carries cards and the game screen, always under a dark gradient.
  - Serif headlines are Fraunces; everything else uses the system font.
  - Small uppercase labels sit above big titles.
  - There is one warm gold accent.
- **Themes:** both ship. Dark is the reference: a near-black navy ground, translucent raised surfaces and gold. Light has a warm off-white ground, white cards and a deep gold accent. Image cards keep their dark gradient and white text in both themes, because they are pictures, not surfaces.
- **Theme switch:** in the Account header. It cycles **Auto → Light → Dark**, where Auto follows the phone.
  - The choice is stored in `sync_state.theme` and is never synced.
  - It is applied with `Appearance.setColorScheme`, so alerts, the keyboard and blur follow it.
  - Sign-out or erase resets it to Auto.
- **Posture:** iOS first-class; Android builds but has not been checked. Headers stay native, while the tab bar is custom.
- **Offline:** local-first. Screens read SQLite, and there is no pull-to-refresh until sync gives it something to fetch.

## Tokens: `apps/mobile/src/ui/theme.ts` and `palette.ts`

Screens use tokens only. `literals.test.ts` fails on a hex colour or a font name anywhere else, and on a `BlurView` outside `frosted.tsx`. `theme.test.ts` asserts WCAG AA for every text and background pair in both themes, including text over a white cover through the gradient. Run it whenever a colour changes.

| Group                  | Tokens                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour (`palette.ts`)  | `background`, `surface`, `raised`, `frostedFill`, `frostedTint`, `text`, `muted`, `line`, `accent`, `accentFill`, `onAccent`, `selectedFill`, `noteFill`, `noteLabel`, `danger`, `onImage`, `onImageMuted`, `heroFadeFrom`, plus `status[EntryStatus]` and `gradients` |
| Space                  | `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32`. Screen edges are `lg` and the grid gutter is `sm`                                                                                                                                                                      |
| Radius                 | `cover 16 · small 16 · card 24 · sheet 28 · pill 999`. Covers use `cover`; image cards, list rows, inputs and small controls `small`; soft cards and notes `card`                                                                                                      |
| Type, serif (Fraunces) | `display 34` (screen titles, a hero's game name) · `displaySmall 24` (section and sheet titles, image cards) · `displayCaption 16` (Now Playing cards)                                                                                                                 |
| Type, system           | `largeTitle · title · headline · body · callout · subhead · caption · label` (11/700, tracked, for uppercase eyebrows)                                                                                                                                                 |
| Numbers                | `tabularNumbers` (`ui-monospace` / `monospace`, tabular). Use it for every figure: playtime, counts, dates, years                                                                                                                                                      |
| Motion                 | `press.scale 0.96`, `press.spring`                                                                                                                                                                                                                                     |
| Misc                   | `minTouchTarget 44`, `displayMaxScale 1.5`                                                                                                                                                                                                                             |

The rules that go with them:

- **Fraunces is embedded at build time** by the expo-font plugin, so there is no flash of the system font. Refer to it only through `fonts.serif` and `fonts.serifRegular`. Never set `fontWeight` on it: the weight is the file itself, and iOS falls back to the system font when the weight doesn't match.
- **Every serif display `Text` sets `maxFontSizeMultiplier={displayMaxScale}`.** Uncapped, "Library" wrapped mid-word at the largest Dynamic Type size and pushed the header buttons off screen. Body text scales fully.
- **`raised`** sits one step above `surface`: inputs inside a card, or a pressed row. **`selectedFill`** is the gold tint behind the tab bar's active pill; a chosen chip is a solid `accentFill` with `onAccent` text.

## Components: `apps/mobile/src/ui/components/`

- **`Frosted`:** the app's only `BlurView`. It has a near-opaque `frostedTint` over the blur and becomes a solid `frostedFill` when iOS Reduce Transparency is on. It is used for chrome only (the tab bar, round header buttons, sheet heads, toasts and dropdowns), never inside a list or grid cell. Allow one per screen region.
- **`FloatingTabBar` and `useTabBarSpace()`:** a frosted, rounded bar inset from the screen edges, with the active tab as a gold-tinted pill. Content scrolls beneath it.
- **`ImageCard`:** a cover with a gradient, an uppercase label and a serif title, at `radius.small`. It is used for the Now Playing row.
- **`Hero`:** a cover behind the top of a screen, fading into the ground. Two variants: `backdrop`, used by Game detail, is a blurred copy behind a sharp cover at 60% width (`radius.cover`); `full` shows the cover itself at full width, top-aligned.
- **`PillButton` and `RoundButton`:** `RoundButton` is a frosted circle holding an icon, used for header actions (Library's Account, Archive and Debug, and Archive on the game screen). In iOS 26 headers, put it in `unstable_headerRightItems` with `hidesSharedBackground: true` so the system's glass doesn't draw a second background around it.
- **`Sheet`:** a bottom sheet with a frosted head and a serif title.
  - It opens empty, then shows its content after the Modal's `onShow`.
  - For long content, pass `list` (a FlashList) and a skeleton `placeholder` rather than a ScrollView. Before this, See all on Now Playing took a visible pause to lay out about 660 rows.
- **`Dropdown` and `Toast`:** frosted, `radius.sheet`, with a hairline `line` border. A toast shows a tone icon, in `accent` for info and `danger` for an error.
- **`Chip`, `StatusChips` and `FilterBar`:**
  - Chips are pills on `surface` with a `line` border; the selected one is a solid `accentFill` with `onAccent` text.
  - `StatusIcon` gives each status its own icon (heart, layers, game controller, pause, trophy, ban), outlined normally and filled when the status is chosen. It replaced the status dot, and the status colours are unchanged.
  - The filter bar starts with a Favourites chip.
- **`CoverCell`:** a cover with a platform chip at the top left and the open-note count at the top right. A favourite shows a gold `accentFill` banner along the cover's bottom edge with a star in it. There is no status text under the title; VoiceOver still reads the status.
- **`EmptyState`:** an icon, serif copy, and the action that fills the screen.
- **`LoadFailed`:** a failed read with "Try again". It never renders the error, because the error could quote a note (CLAUDE.md, Privacy).
- **`SkeletonBlock`, `CoverGridSkeleton` and `GameRowsSkeleton`:** still placeholders in the shape of the final layout. There is no shimmer, because local reads finish in milliseconds.
- **`PressableScale`:** every tappable, springing on the UI thread and still respecting Reduce Motion. Full-width rows (`GameRow`) highlight on `raised` instead, inset with `radius.small`.
- **`PrimaryButton`:** the screen's one main action, in the accent fill; disabled while it runs, so a double tap can't repeat it.
- **`HeaderButton` and `HeaderIconButton`:** a text action (Cancel, Done) and an icon action (add, archive, delete) in a native header. `ThemeButton` is a `HeaderIconButton` that cycles the theme.
- **`StarRating`:** five stars in half steps; tapping the current rating clears it. VoiceOver reads it as one adjustable control.
- **`SortDropdown` and `GenreFilter`** (`library-options.tsx`): the library's sort (choosing the current one again reverses it) and genre filter.
- **`LibraryGrid`:** the paged cover grid shared by Library and Archive.
- **`KeyboardDismiss`:** hides the keyboard on a tap outside the field, never on a drag or scroll.
- **One icon family:** `@expo/vector-icons/Ionicons`. Never use text glyphs as icons.

## Screens

| Screen             | Look                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library            | A serif title and round frosted header buttons. Now Playing is a horizontal row of image cards, with See all opening a sheet. Then the filter chips and a 3-column cover grid                                             |
| Game detail        | A `backdrop` hero (blurred cover behind a sharp one) fading into the ground, the serif game name, facts and editor controls as pills and soft cards, and Notes as a pill button. Archive is a round frosted header button |
| Search             | A pill search field on a frosted bar, with results as `GameRow`s                                                                                                                                                          |
| Notes, note editor | A serif count. Notes are soft rounded cards, and the form has uppercase labels with rounded fields                                                                                                                        |
| Archive, Account   | A serif title in the content and an empty native header. The signed-in card is a soft card, and the buttons are outlined pills                                                                                            |
| Debug              | Out of scope: it uses whatever tokens it inherits                                                                                                                                                                         |

## States (every data screen)

`useQuery` returns `loading | ready | failed` (with `retry`). Loading shows a skeleton, a failure shows `LoadFailed`, and an empty result shows `EmptyState` with copy written for that screen. The note editor keeps rendering nothing for its one-row read.

**A screen keeps one layout in every state:** loaded, loading, failed, empty, offline. Same padding, header placement and background. A state never gets its own container (a card or panel the loaded screen doesn't have). A library error state once lost the list's side padding and sat in a white card; that is the failure this rule prevents.

## Always and never

- **Always:** take every colour, font, radius and gradient from `theme.ts`; keep every control's accessibility role and label; give a frosted surface a solid fallback for Reduce Transparency; run the contrast test after a colour changes; check both themes.
- **Never:** put text on cover art without the gradient; use blur inside a list or grid cell; hard-code a colour or font name in a component; add a visible element, container or state UI that wasn't asked for.

## Nav Read

```
platforms: iOS first-class · Android builds, not yet checked · web none
tabs (2): Library · Search      (floating frosted bar; stats-and-portability adds a third)
app/
  _layout            Stack, unstable_settings.initialRouteName '(tabs)'
  (tabs)/index       Library → push game/[id]; header buttons → account, archive, debug
  (tabs)/search      Search  → push game/[id]
  game/[id]          push, transparent header over the hero; Archive in the header
  game/[id]/notes    push → note/new, note/[id]
  note/new           Cancel; confirms discard when text is typed
  note/[id]          Done; edits autosave
  archive            push → game/[id]
  account            push; theme switch in the header
  debug/*            push (ships until EAS)
sheets: Now Playing "See all" (Sheet + FlashList)
deep links: mobile:///game/:id, /game/:id/notes, /note/:id, /archive
android back: default pop; note/new confirms discard (usePreventRemove)
max taps to any core screen: 3 (Library → game → Notes → note)
```

## Rules learned here

- **Tab screens pad for the floating bar:** add `useTabBarSpace()` (the bar's height, the gap below it and the bottom inset) to the list's bottom padding. Pushed screens add `insets.bottom`.
- **Never key a list on its filters.** `key={JSON.stringify(filters)}` remounted the grid's header and made the Now Playing row flicker on every chip tap. Keep the list mounted and `scrollToOffset({ offset: 0 })` when the filter changes.
- **Decide on scroll position by thresholds.** A screen that decides something from the scroll position updates state only when a threshold is crossed, never on every frame.
- **Don't trust taps near the right edge in a dev build.** Expo's dev-menu button has an invisible hit area of about 72 pt at the right edge, and it swallows taps there. A control that "doesn't work" only in a dev build may be under it, so check on a Release build.
- **Verify UI on a Metro that watches files.** Metro started with `CI=1` doesn't watch them.
