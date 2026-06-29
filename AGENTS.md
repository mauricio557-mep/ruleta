# AGENTS.md — Ruleta Live

Single-file React + TypeScript + Vite roulette. All game logic lives in `src/App.tsx`. There is no backend, no tests, and no CI yet.

## Commands

```bash
npm install            # one-time
npm run dev            # vite dev server on http://localhost:5173
npm run build          # tsc -b && vite build — typecheck then bundle
npm run lint           # oxlint (no type-aware rules configured)
npm run preview        # serve the built output
```

Build runs `tsc -b` first; a TS error blocks the bundle. Lint and build are independent — run lint separately.

## Architecture (do not refactor without intent)

- `src/App.tsx` is the whole game (~1250+ lines). Contains: `CONFIG`, types, `WHEEL` order, `betDef`, RNG, `useRouletteAudio`, the `reducer`, `WheelContents` SVG, the betting table, and controls (incl. Rebet / Double / Pause).
- `src/index.css` holds Tailwind directives plus a hardcoded `.win-modal` animation (4s). Do not move that animation into Tailwind config — the inline `style={{ animationDuration }}` approach previously used kept the modal stuck at `opacity: 0`.
- No router, no context, no store. All state via `useReducer` in `App`. Transitions driven by `useEffect([phase, paused])` with a shared `timersRef` for cleanup.

## State machine

`BETTING → NO_MORE_BETS → SPINNING → PAYOUT → BETTING`. Pausing is a flag, not a phase — it gates the `useEffect` schedulers but does not change `phase`. The wheel angle is stored as an absolute counter (no modulo) and the delta to the next winner is computed from the current visual angle modulo 360.

## Tailwind — pinned to v3

The project intentionally uses `tailwindcss@3` and the classic `tailwind.config.js` + `postcss.config.js` setup. **Do not upgrade to v4** — v4 requires `@tailwindcss/postcss` and a different config style, and the `npx tailwindcss init -p` scaffold from the prompt broke the build. If you need new utilities, just use them — `content: ["./index.html", "./src/**/*.{ts,tsx}"]` already covers the source.

## TypeScript strictness (these bite)

`tsconfig.app.json` enables: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`. Consequences:

- Unused imports or vars fail the build. Remove them.
- `import type` is required for type-only imports (verbatimModuleSyntax).
- TS ~6.0 from the scaffold; expect modern syntax support.

## Browser-only APIs

`window.crypto`, `AudioContext`, `speechSynthesis` are referenced. The build typechecks because they're under `lib: ["ES2023", "DOM"]`, but they are not defined in Node. Audio and voice require a real browser and **a user gesture first** — `useRouletteAudio.ensure()` is called from `placeBet` so the context is created on the first chip click, not at app start.

## Single source of truth for the wheel order

`const WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]`. The `triggerSpinAnimation` math relies on this exact clockwise order starting at 0 at the top. Do not reorder.

## Animation gotcha

For consecutive spins the wheel `transform` must be reset to the previous angle with `transition: none`, a forced reflow (`getBoundingClientRect`), then the target inside **double** `requestAnimationFrame` before reapplying the transition. Skipping the double RAF makes the second spin skip without animating.

## Conventions

- Spanish copy throughout the UI; `index.html` lang is still `en` (template default — leave or fix as a separate change).
- Money formatted via `Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })`.
- Chip denominations are AR$ 250 / 500 / 1k / 5k; chip color classes live in `chipClasses(value)` in `App.tsx`.
- Outside-bet chips render in the top-right corner of the button (`chipSpotCorner`) so the label stays readable; in-board bet chips render centered.

## Rebet / Double

Implemented as reducer actions (`REBET`, `DOUBLE`):

- `lastBets` is snapshotted into state when bets are confirmed (`NO_MORE_BETS`).
- Rebet places every bet from `lastBets`, adding to existing bets and skipping any that would exceed current saldo. Never negative.
- Double doubles each current bet atomically; if saldo is insufficient for the full new total, the action is a no-op.
- Both are disabled unless `phase === "BETTING"`.

## Hard constraints

- `saldo` can never go negative. Every financial action validates against available balance.
- Bets can only be modified in `BETTING` phase.

## What to verify before declaring done

1. `npm run build` passes (covers typecheck).
2. `npm run lint` passes.
3. Manual smoke in browser: place a dozen bet, hit Girar ya, confirm the modal shows the winning amount, then a new BETTING round starts and chips clear.
