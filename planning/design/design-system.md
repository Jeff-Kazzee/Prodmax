# Prodmax Design System — "The Workshop, Not the Office"

**Doc owner:** design agent | **Date:** 2026-08-16 | **Status:** PHASE 2 CANON — binds all M0–M10 UI work
**Companions:** `planning/architecture.md` (module boundaries, perf budgets §9), `planning/research/feature-matrix.md` (FM-NNN), `planning/design/ux-spec.md` (§10 motion references the tokens in §8 here; this doc is the canonical token source).
**Stack contract:** Tailwind CSS + shadcn/ui (dither-kit requires `components.json` from M0 scaffold) · dither-kit (dithered charts/avatars/gradients/buttons) · canvasui (signature canvas effects) · icons0/Iconify (Lucide) · shieldcn (SVG badges).

---

## 0. Concept in one paragraph

Prodmax looks like a **bench instrument**, not a brochure: a high-contrast charcoal chassis, hairline engineering-grid structure, amber pilot-lamp accent that appears only where the machine is alive, phosphor-cyan reserved for AI, and **ordered-dither texture as the brand fingerprint** (a deliberate nod to dither-kit, tuned for a 2026 product, not a pastiche of 1989). Dark is the default because the workshop runs with the lights low. Nothing decorative survives unless it earns its keep — every glow means something (focus, activity, AI, sync). Where Linear is monochrome-violet minimal and Notion is paper-white openness, Prodmax is **industrial precision with CRT warmth**.

---

## 1. Brand Foundation

### 1.1 Name usage

| Rule | Example |
|---|---|
| Always "Prodmax" — one word, capital P, lowercase m | "Prodmax synced your workspace" |
| Never "ProdMax", "PRODmax", "prodmax" in prose | — |
| "PRODMAX" in mono caps **only** as the logotype wordmark | §1.2 |
| Abbreviation "PMX" never in UI copy; allowed only as the API key prefix `pmx_…`, CSS namespace `--pmx-*`, and internal identifiers | `pmx_abc1…` |
| Product reference style | "a Prodmax workspace", "the Prodmax AI engine" |
| Workspace generic term (avoid "org"/"company") | workspace |

### 1.2 Logotype

**Wordmark** — `PRODMAX` set in JetBrains Mono SemiBold (600), all caps, tracking `+0.12em`, color accent-500 on dark / accent-700 on light; never italicized, never gradient-filled. Sizes: 13px in-app header, 20px onboarding, 24–40px marketing.

**Mark — "the loaded bench"** — a 24×24 glyph of three progress bars at increasing fill, each bar's trailing edge dissolving into ordered-dither dots (Bayer 2×2). It reads simultaneously as stacked progress bars and a dither square — the two brand signatures in one shape. SVG sketch (density dots simplified; production asset renders dots from a Bayer threshold, not hand-placed circles):

```svg
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <!-- bar 1: 25% fill -->
  <rect x="3" y="5"  width="4.5" height="3" rx="1" fill="currentColor"/>
  <circle cx="9.5" cy="5.75" r="0.8" fill="currentColor" opacity="0.55"/>
  <circle cx="9.5" cy="7.25" r="0.8" fill="currentColor" opacity="0.55"/>
  <!-- bar 2: 55% fill + dither fade -->
  <rect x="3" y="10.5" width="9" height="3" rx="1" fill="currentColor"/>
  <circle cx="14" cy="11.25" r="0.8" fill="currentColor" opacity="0.55"/>
  <circle cx="14" cy="12.75" r="0.8" fill="currentColor" opacity="0.55"/>
  <circle cx="16.5" cy="12" r="0.8" fill="currentColor" opacity="0.3"/>
  <!-- bar 3: 85% fill + dither fade -->
  <rect x="3" y="16" width="13.5" height="3" rx="1" fill="currentColor"/>
  <circle cx="18.5" cy="16.75" r="0.8" fill="currentColor" opacity="0.55"/>
  <circle cx="18.5" cy="18.25" r="0.8" fill="currentColor" opacity="0.55"/>
  <circle cx="21" cy="17.5" r="0.8" fill="currentColor" opacity="0.3"/>
</svg>
```

**Usage:** 16px favicon/compact, 20px sidebar, 24px default, 48px+ marketing. Monochrome variant (text-primary color) for single-color contexts and shieldcn badges. Clear space = mark height × 0.5 on all sides. Mark + wordmark lockup: mark left, wordmark centered vertically, gap = mark height × 0.6. Never stretch, rotate, outline, or place on photography without a solid backing plate.

### 1.3 Positioning line (internal, not a consumer tagline)

> **Prodmax is the workshop for software teams — issues, docs, and a local AI engine that never leaves the bench.**

### 1.4 Personality traits (5)

1. **Precise** — measurements, not vibes: mono numerals, exact timestamps, "81% overlap", "p50 340 ms".
2. **Candid** — says exactly what it did: engine labels on every AI artifact, transactional undo receipts, "no confident match" instead of a guess.
3. **Swift** — latency is a feature: optimistic edits, sub-100 ms search, motion under 300 ms.
4. **Workmanlike** — no ornament without function: if it glows, it means something; if it dithers, it's a moment.
5. **Transparent** — the machine is visible: activity ledger, ai_runs browser, $0.00 local metering.

### 1.5 Voice rules

- Sentence case everywhere; title case only for proper nouns and the logotype.
- Toasts lead with the verb's result: "Moved 3 issues to Done — Undo". Always offer undo when an undo token exists.
- Numbers, IDs, durations are mono: `PRO-142`, `12 ms`, `81%`.
- AI copy always names the engine and offers "Why": "Suggested by local engine — Why?"
- Errors say what happened + what to do next: "Reconnecting — edits are saved locally and will sync."
- No exclamation marks outside warning/danger banners. No humor in error paths; dry warmth in empty states is fine ("The bench is clear.").
- Second person, present tense, active voice. Never "please" more than once per surface.

### 1.6 Do / Don't

**Do**
- Use dither texture as a *moment* (login, empty states, avatars, chart fills, AI hero) — never as wallpaper.
- Build hierarchy with background layers + 1px hairlines; shadows only under floating layers.
- Set identifiers, counts, and keyboard hints in mono.
- Keep amber scarce — "pilot lamps, not headlights" (≤5% of any screen's pixels).
- Show engine labels (⚡/◈) on every AI artifact.
- Default to dark; make light a first-class equal, never an afterthought.

**Don't**
- No purple, no blue-purple gradients, no glassmorphism on working surfaces (nothing may look like Linear or a 2023 landing page).
- No drop shadows for static hierarchy; no double borders; no 2px+ borders.
- No dither or canvas on dense working lists, inputs, tooltips, code blocks, or the docs editor canvas area.
- No color-only meaning anywhere (see §10.4).
- No AI cyan on non-AI affordances; no amber on AI affordances.
- No skeletons older than 400 ms without progress copy; no spinner-only waits over 2 s.
- No emoji in UI chrome (emoji allowed as page icons and in user content only).

### 1.7 Tagline candidates

1. **"Ship from the bench."** ← **PICKED** — workshop-native, verb-first, 4 words, works in a README badge row and a login screen.
2. "The workshop, not the office." — strong positioning, but it's the internal concept line (§0), kept off-consumer.
3. "Issues, docs, and an AI that never leaves your machine." — feature-dense, better for the README sub-line.
4. "Built for the build." — punchy, slightly generic.
5. "Where software gets made." — warm, risks factory nostalgia.

**Usage:** picked tagline appears on login hero, README header, and marketing; never inside the app shell.

---

## 2. Color System

All colors canonical in **OKLCH**, hex fallback sRGB. Dark is default. Every text pair in §2.9 verified ≥ 4.5:1 (normal) or ≥ 3:1 (large text / UI components). Alpha tints are defined as `rgb(<token> / <alpha>)` over the stated base layer.

### 2.1 Semantic primitives — dark theme (default)

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `bg-0` | `oklch(0.15 0.015 260)` | `#14171c` | app canvas, working views, behind everything |
| `bg-1` | `oklch(0.17 0.015 260)` | `#191d23` | sidebar, topbar |
| `bg-2` | `oklch(0.20 0.015 260)` | `#1f242b` | cards, panels, popovers, palette, dialogs |
| `bg-3` | `oklch(0.23 0.015 260)` | `#262c34` | raised rows, hover fill, inputs on bg-2 |
| `surface` | `oklch(0.20 0.015 260)` | `#1f242b` | alias bg-2 (kept separate for future divergence) |
| `overlay` | `oklch(0.17 0.015 260 / 0.92)` + 8px blur | `#14171ce6` | dialog/sheet scrim |
| `border-weak` | `oklch(0.24 0.015 260)` | `#2a3038` | row separators, internal card dividers |
| `border` | `oklch(0.28 0.018 260)` | `#343b45` | card/panel/input outline (default hairline) |
| `border-strong` | `oklch(0.35 0.020 260)` | `#454e5b` | hover outlines, drag edges, active tabs |
| `text-primary` | `oklch(0.93 0.006 250)` | `#e9edf2` | titles, values, active labels |
| `text-secondary` | `oklch(0.71 0.015 250)` | `#a6b0bc` | descriptions, meta, inactive labels |
| `text-tertiary` | `oklch(0.61 0.020 250)` | `#8794a2` | placeholders, empty labels, timestamps |
| `interactive-hover` | `oklch(0.23 0.015 260)` | `#262c34` | hover fill (= bg-3) |
| `interactive-active` | `oklch(0.26 0.018 260)` | `#2b333d` | pressed fill |
| `interactive-selected` | `oklch(0.71 0.15 85 / 0.14)` over base | `#d4a83624` | selected rows/cells + 2px accent inset bar (lists) |
| `ring` (focus) | `oklch(0.71 0.15 85)` | `#d4a836` | focus-visible ring (§10.1) |

### 2.2 Semantic primitives — light theme

Warm "spec-sheet bone" — deliberately not Notion's stark white.

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `bg-0` | `oklch(0.945 0.010 90)` | `#f4f1ea` | app canvas |
| `bg-1` | `oklch(0.915 0.012 90)` | `#eae6da` | sidebar, topbar |
| `bg-2` | `oklch(0.985 0.004 90)` | `#fdfcf9` | cards, panels, popovers, dialogs |
| `bg-3` | `oklch(0.93 0.010 90)` | `#efebe0` | raised rows, hover fill |
| `surface` | `oklch(0.985 0.004 90)` | `#fdfcf9` | alias bg-2 |
| `overlay` | `oklch(0.985 0.004 90 / 0.92)` + 8px blur | `#fdfcf9eb` | scrim |
| `border-weak` | `oklch(0.87 0.012 90)` | `#ddd7c7` | row separators |
| `border` | `oklch(0.83 0.014 90)` | `#d0c9b6` | default hairline |
| `border-strong` | `oklch(0.70 0.016 90)` | `#a89f87` | hover outlines, drag edges |
| `text-primary` | `oklch(0.25 0.010 260)` | `#22262c` | titles, values |
| `text-secondary` | `oklch(0.46 0.015 260)` | `#525a64` | descriptions, meta |
| `text-tertiary` | `oklch(0.53 0.015 260)` | `#666e79` | placeholders, timestamps |
| `interactive-hover` | `oklch(0.91 0.012 90)` | `#e9e4d6` | hover fill |
| `interactive-active` | `oklch(0.87 0.015 90)` | `#ded7c3` | pressed fill |
| `interactive-selected` | `oklch(0.55 0.13 80 / 0.12)` over base | `#a07c1a1f` | selected rows/cells + accent inset bar |
| `ring` (focus) | `oklch(0.55 0.13 80)` | `#a07c1a` | focus ring |

**Naming trap (binding):** shadcn's `--accent` CSS slot is the *hover* slot. Prodmax brand accent maps to shadcn `--primary`; `--accent` maps to `interactive-hover`. Never use Tailwind's `accent-*` utility color for brand amber — use `primary`. See §9.3.

### 2.3 Accent ramp — "Signal Amber" (theme-invariant 9 steps + on-accent)

| Step | OKLCH | Hex | Role |
|---|---|---|---|
| `accent-50` | `oklch(0.97 0.030 95)` | `#f8f3df` | on-accent hover wash (light) |
| `accent-100` | `oklch(0.93 0.060 90)` | `#f0e2b6` | selected tint edge (light) |
| `accent-200` | `oklch(0.89 0.090 87)` | `#e9d18e` | chart accent bright (light) |
| `accent-300` | `oklch(0.81 0.120 85)` | `#e8c766` | links on dark, hover accent text |
| `accent-400` | `oklch(0.73 0.140 83)` | `#dcae47` | dark accent-text, interactive accent glyphs |
| `accent-500` | `oklch(0.71 0.150 85)` | `#d4a836` | **dark primary** (buttons, ring, active states) |
| `accent-600` | `oklch(0.55 0.130 80)` | `#a07c1a` | **light primary** |
| `accent-700` | `oklch(0.45 0.120 80)` | `#7d6112` | light accent-text / links |
| `accent-800` | `oklch(0.37 0.090 78)` | `#5c4a15` | light chart accent |
| `accent-900` | `oklch(0.28 0.060 75)` | `#3f320e` | deep chart accent / dark-on-amber text in badges |
| `on-accent` (dark theme) | `oklch(0.20 0.030 85)` | `#241f0d` | text/icon on accent-500 — dark-on-amber "etched plate" |
| `on-accent` (light theme) | `oklch(0.16 0.030 85)` | `#171204` | text on accent-600 |

Amber is **not** a status color. Started-state borrows accent deliberately (§2.6). Warning is orange, not amber (§2.4).

### 2.4 Status colors (each: subtle / solid / text)

**Dark theme**

| Status | subtle (bg tint on bg-2) | solid (+ `on-*` text) | text |
|---|---|---|---|
| success | `#3fb95024` (14%) | `#3fb950` `oklch(0.67 0.16 150)` · on `#0c1a10` | `#4cc38a` `oklch(0.72 0.14 155)` |
| warning | `#f0883e24` | `#f0883e` `oklch(0.71 0.16 60)` · on `#2a1c07` | `#ffab70` `oklch(0.77 0.13 55)` |
| danger | `#e5534b24` | `#e5534b` `oklch(0.56 0.19 25)` · on `#2a0f0e` | `#f27972` `oklch(0.64 0.16 25)` |
| info | `#4c8dff24` | `#4c8dff` `oklch(0.63 0.17 262)` · on `#0a1524` | `#6cb2ff` `oklch(0.75 0.12 262)` |

**Light theme**

| Status | subtle (bg tint on bg-2) | solid (+ white text) | text |
|---|---|---|---|
| success | `#1f7a3d1a` | `#1f7a3d` `oklch(0.46 0.12 150)` | `#175f31` `oklch(0.37 0.10 150)` |
| warning | `#b3591b1a` | `#b3591b` `oklch(0.49 0.14 55)` | `#8f4715` `oklch(0.42 0.12 55)` |
| danger | `#cf222e1a` | `#cf222e` `oklch(0.51 0.19 27)` | `#a61e2a` `oklch(0.44 0.17 27)` |
| info | `#1f6feb1a` | `#1f6feb` `oklch(0.51 0.17 262)` | `#1a5fc4` `oklch(0.47 0.15 262)` |

Usage: `subtle` for banners/tinted rows/toast chrome, `solid` for buttons/badges/dots, `text` for inline colored copy on theme background. Warning is **orange (hue ~55)**, intentionally distinct from amber accent (hue ~85); warnings always carry icon + label (§10.4).

### 2.5 Priority scale (glyph color — always paired with bars glyph + text, §5.3)

| Priority | Dark OKLCH / hex | Light OKLCH / hex |
|---|---|---|
| Urgent | `oklch(0.66 0.17 25)` `#ff7b72` | `oklch(0.50 0.18 27)` `#bc2c3c` |
| High | `oklch(0.77 0.13 55)` `#ffab70` | `oklch(0.48 0.14 50)` `#a8521a` |
| Medium | `oklch(0.71 0.15 85)` `#d4a836` (= accent-500) | `oklch(0.45 0.12 80)` `#8a6a14` |
| Low | `oklch(0.68 0.05 250)` `#8fa8c9` | `oklch(0.47 0.06 260)` `#46618a` |
| None | = text-tertiary `#8794a2` / `#666e79` | — |

Medium reusing accent is deliberate: "medium heat" borrows the pilot-lamp; urgent/high get their own hotter/cooler families. Urgent additionally renders a cap line on the bars glyph (§5.3) so it never relies on hue.

### 2.6 State-category colors (custom statuses inherit their category color)

| Category | Dark / hex | Light / hex | Rationale |
|---|---|---|---|
| `backlog` | `oklch(0.68 0.05 260)` `#93a1c4` | `oklch(0.47 0.06 260)` `#4f5f87` | cold storage — slate |
| `triage` | `oklch(0.67 0.12 300)` `#b08cf2` | `oklch(0.46 0.14 300)` `#7443c9` | unsorted incoming — violet (the only violet in the system) |
| `unstarted` | = text-tertiary | — | neutral gray |
| `started` | = accent-400 `#dcae47` | = accent-700 `#7d6112` | **active work glows the brand color** |
| `completed` | = success-text `#4cc38a` | `#175f31` | machine healthy |
| `canceled` | = text-tertiary @ 70% + strikethrough on label | — | de-powered |

Custom per-status `color` overrides (states.color in DB) are allowed from a curated 12-hue picker; category color remains the fallback and board-column tint.

### 2.7 AI-signal color — "Phosphor Teal" (restricted use)

Used **only** for: AI affordances (suggest buttons, NL filter chips, AI panel chrome) and engine badges. Never for links, focus, selection, or decoration. AI never uses amber; amber things are never AI.

| Token | Dark / hex | Light / hex | Use |
|---|---|---|---|
| `ai-subtle` | `#45d6e81f` (12%) | `#0f7d8c1a` | AI card/panel tint |
| `ai-solid` | `oklch(0.79 0.11 215)` `#45d6e8` | `oklch(0.49 0.08 220)` `#0f7d8c` | engine badge fill, AI button variant |
| `ai-text` | `oklch(0.79 0.11 215)` `#45d6e8` | `oklch(0.45 0.08 220)` `#0d6a77` | "generated by" copy |
| `ai-on` | `#06232a` | white | text on ai-solid |
| `ai-100` / `ai-300` | `#d9f6fa` / `#a7ebf4` | — | diff-context wash, chart AI overlay |

### 2.8 Chart categorical palette (8 series, dither-kit tuned)

Series identity = **(hue, lightness)**. Lightness is strictly stepped so ordered-dither density alone separates series even in duotone/CSV-print scenarios; dither-kit fills also vary cell size 2px/3px per series. Series 1 is always amber (brand), series 2 always teal (AI overlay conventions in ask/summarize charts).

| # | Dark OKLCH / hex | Light OKLCH / hex | Name |
|---|---|---|---|
| 1 | `oklch(0.88 0.11 85)` `#edd67f` | `oklch(0.42 0.09 80)` `#8a6a25` | brass |
| 2 | `oklch(0.79 0.11 205)` `#4fd8e6` | `oklch(0.48 0.09 210)` `#1f7f96` | teal |
| 3 | `oklch(0.71 0.14 155)` `#46b46e` | `oklch(0.52 0.11 155)` `#2e8a4e` | green |
| 4 | `oklch(0.64 0.14 55)` `#d98343` | `oklch(0.55 0.13 40)` `#b05a2a` | rust |
| 5 | `oklch(0.57 0.14 300)` `#9d7be8` | `oklch(0.48 0.13 300)` `#7a4fd0` | violet |
| 6 | `oklch(0.50 0.13 355)` `#d8618a` | `oklch(0.55 0.14 355)` `#c04a6e` | rose |
| 7 | `oklch(0.44 0.05 255)` `#7186ab` | `oklch(0.38 0.08 260)` `#4054a0` | navy |
| 8 | `oklch(0.38 0.07 120)` `#6c8a4f` | `oklch(0.45 0.07 120)` `#5c7a3a` | olive |

Grid/axis chrome: `border-weak` lines, `text-tertiary` labels, mono numerals, tabular. Threshold/percentile lines (p50/p95): dashed 1px `text-secondary`. All series ≥ 3:1 against their theme's `bg-2` (§2.9). Implementation may shift any step ±0.02 L to improve adjacent-series dither separation; hue steps are fixed.

### 2.9 Contrast verification (WCAG 2.x relative-luminance ratios, computed)

**Dark theme (base = bg-2 `#1f242b` unless noted)**

| Pair | Ratio | Verdict |
|---|---|---|
| text-primary / bg-2 · bg-0 | 13.3 · 15.3 | AA+ |
| text-secondary / bg-2 | 7.1 | AA+ |
| text-tertiary / bg-2 · bg-3 | 4.9 · 4.5 | AA (use secondary on bg-3 small text if borderline) |
| accent-500 / bg-2 (links, UI) | 7.0 | AA |
| on-accent / accent-500 | 7.4 | AA |
| success-text · warning-text · danger-text · info-text / bg-2 | 7.0 · 8.4 · 5.8 · 7.0 | AA |
| ai-solid / bg-2 | 9.0 | AA |
| on-success · on-warning · on-danger · on-info / their solids | 7.1 · 7.4 · 4.6 · 6.0 | AA |
| ring accent-500 / bg-2 (UI 3:1) | 7.0 | AAA-UI |
| priority urgent/high/medium/low / bg-2 | 6.2 · 8.4 · 7.0 · 6.4 | AA |
| state backlog/triage/started/completed / bg-2 | 6.0 · 5.9 · 7.4 · 7.0 | AA |
| chart series min (olive #6c8a4f) / bg-2 | 4.0 | AA-UI (3:1) |

**Light theme (base = bg-2 `#fdfcf9` unless noted)**

| Pair | Ratio | Verdict |
|---|---|---|
| text-primary / bg-2 | 14.8 | AA+ |
| text-secondary / bg-2 | 6.8 | AA+ |
| text-tertiary / bg-2 · bg-0 | 5.0 · 4.6 | AA |
| accent-700 (text) / bg-2 · bg-0 | 4.9 · 4.5 | AA |
| on-accent / accent-600 | 4.7 | AA |
| success/warning/danger/info text / bg-2 | 7.5 · 6.7 · 7.2 · 5.9 | AA |
| ai-600 (text+solid) / bg-2 | 4.6 | AA |
| white / success · danger · warning · info solids | 5.4 · 5.4 · 4.8 · 4.6 | AA |
| ring accent-600 / bg-2 (UI 3:1) | 3.8 | AA-UI |
| priority urgent/high/medium/low / bg-2 | 5.7 · 5.3 · 4.9 · 6.1 | AA |
| chart series min (brass #8a6a25) / bg-2 | 3.8 | AA-UI |

**Hairline-borders disclosure:** default hairlines measure ~1.4:1 (dark) / ~1.5:1 (light) — intentionally below 3:1. No interactive state relies on a hairline alone: hover adds fill (bg-3 / hover), selection adds accent tint + inset bar, focus adds the ring (≥ 3.8:1 both themes). This is the documented WCAG 1.4.11 compliance strategy, not an oversight.

---

## 3. Typography

### 3.1 Families (fontsource, self-hosted woff2)

| Role | Family (fontsource package) | Why |
|---|---|---|
| UI sans | **Inter Variable** (`@fontsource-variable/inter`) | Engineered neutrality with high x-height that survives 11–13px dense rows; best-in-class hinting on Windows (the owner's platform); full tabular-numeral + `ss/cv` feature set; variable = one file, instant optical weights. Distinctiveness comes from usage (see mono), not from a novelty face. |
| Mono | **JetBrains Mono Variable** (`@fontsource-variable/jetbrains-mono`) | Taller x-height than most monos so `PRO-123` reads at 11px; slashed-zero and unambiguous `1lI O0` (identifier safety); true italic for code comments; variable weight for badges vs code. |

Fallback stacks:
- `--font-sans`: `Inter Variable, Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif`
- `--font-mono`: `"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`
- Emoji (appended globally): `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol"` — emoji render in color only in user content and page icons, never in chrome (§1.6).

### 3.2 Scale (12 tokens)

| Token | px / line-height | tracking | Weight norm | Primary use |
|---|---|---|---|---|
| `text-2xs` | 10 / 14 | +0.02em | 500 | kbd keys, badge micro-labels, shield value text |
| `text-xs` | 11 / 16 | +0.01em | 400/500 | dense table cells, meta rows, mono IDs in rows |
| `text-sm` | 12 / 16 | +0.005em | 400 | row secondary text, chips, tooltips |
| `text-base` | 13 / 20 | 0 | 400 | **app default**: issue rows, sidebar, menus |
| `text-md` | 14 / 20 | 0 | 400/500 | inputs, buttons, issue modal body, settings |
| `text-lg` | 15 / 22 | −0.0025em | 400 | doc body auxiliary, popovers |
| `text-xl` | 16 / 24 | −0.005em | 400/600 | doc body, dialog titles |
| `text-2xl` | 18 / 26 | −0.01em | 600 | section headers, sheet titles |
| `text-3xl` | 20 / 28 | −0.015em | 600 | view titles, dialog headings |
| `text-4xl` | 24 / 32 | −0.02em | 650 | page H1, empty-state titles |
| `text-5xl` | 30 / 38 | −0.02em | 650 | onboarding step titles |
| `text-6xl` | 38 / 46 | −0.025em | 700 | login/marketing hero |

`text-5xl`/`text-6xl` exist only on login, onboarding, and marketing surfaces; app chrome never exceeds `text-4xl`.

### 3.3 Usage rules — where mono appears

Mono (JetBrains Mono) is mandatory for: issue identifiers (`PRO-123`), keyboard hints/`kbd`, table data cells (counts, dates, durations, estimates), code blocks and inline code, filter operator chips (`is`, `before`), version numbers (`v3`), API key prefixes (`pmx_abc1…`), webhook status codes (`200`, `429`), timestamps in activity/history, latency/cost figures (`12 ms`, `$0.00`), chart axes. Everything else is Inter.

Rules: mono never above `text-base` in app chrome (marketing wordmark excepted); mono numerals always `font-variant-numeric: tabular-nums`; sans numerals in any table/list context also `tabular-nums` (Inter supports it). All tables, counters, group-header counts, usage meters: tabular numerals so digits never jitter during SSE updates.

---

## 4. Spacing, Radius, Elevation, Z-Index

### 4.1 Spacing (4px base; working views on 8px baseline)

`0 · 1(4) · 2(8) · 3(12) · 4(16) · 5(20) · 6(24) · 8(32) · 10(40) · 12(48) · 16(64) · 20(80) · 24(96)` px. Component-internal nudges may use 2px (`0.5`) for icon optical alignment only. Working views (list/board/table/docs) align block starts, row gutters, and panel widths to the **8px baseline**; 4px steps are legal only inside components.

### 4.2 Density modes (user toggle, persisted; default comfortable)

Applied via `data-density="compact|comfortable"` on `<html>` (§9.4). CSS variables consumed by all list/table/board components:

| Var | compact | comfortable |
|---|---|---|
| `--row-h` | 28px | 36px |
| `--cell-py` | 3px | 7px |
| `--card-py` | 6px | 10px |
| `--card-px` | 10px | 12px |
| `--ctrl-h` (buttons/inputs sm) | 24px | 28px |
| `--ctrl-h-md` (default controls) | 28px | 32px |
| `--hit` (min hit target) | 32px | 40px |
| `--list-gap` | 0px (hairline-ruled) | 2px |

Row height 28px never shrinks hit area: interactive cells use padded pseudo-element hitboxes reaching `--hit` (§10.2).

### 4.3 Radii

| Token | px | Use |
|---|---|---|
| `radius-sm` | 4 | chips, badges, inline inputs, row-hover fill corners |
| `radius-md` | 6 | buttons, inputs, select, combobox, kbd |
| `radius-lg` | 8 | cards, board cards, popovers, menus, palette items |
| `radius-xl` | 12 | dialogs, sheets, command palette shell, callout blocks |
| `radius-full` | 9999 | avatars, dots, pills, presence stack |

Lists/rows themselves are square (radius 0) — ruled by hairlines, flush with the grid (industrial). Maps to shadcn `--radius: 6px` (components derive sm/lg/xl from it).

### 4.4 Borders (hairline aesthetic)

`1px` everywhere — the system has exactly one border width. Hierarchy comes from the three border color tokens (§2.1/2.2). Focus rings are the only 2px stroke (§10.1). Drag/drop indicators use `2px` accent fill lines (stateful, not structural). Disabled controls: border `border-weak`, text `text-tertiary`, no shadow.

### 4.5 Elevation (×5, subtle — flat industrial UI)

| Token | Dark | Light | Use |
|---|---|---|---|
| `shadow-0` | none | none | in-flow everything |
| `shadow-1` | `0 1px 0 rgba(0,0,0,0.24)` | `0 1px 2px rgba(20,23,28,0.06)` | raised cards on scroll, sticky headers |
| `shadow-2` | `0 4px 16px rgba(0,0,0,0.32)` | `0 4px 16px rgba(20,23,28,0.10)` | popovers, menus, dropdowns, tooltips |
| `shadow-3` | `0 8px 32px rgba(0,0,0,0.40)` | `0 8px 32px rgba(20,23,28,0.14)` | dialogs, sheets, command palette |
| `shadow-4` | `0 12px 40px rgba(0,0,0,0.48)` | `0 12px 40px rgba(20,23,28,0.18)` | toasts, drag ghosts |

Shadows appear **only on floating layers**. Static hierarchy = bg layers + hairlines (§1.6).

### 4.6 Z-index map

| Token | z | Owners |
|---|---|---|
| `z-base` | 0 | document flow |
| `z-sticky` | 10 | sticky group headers, table frozen columns, filter bar |
| `z-sidebar` | 20 | sidebar overlays when floating (tablet), SSE banner |
| `z-panel` | 30 | sheets (issue modal), side panels |
| `z-palette` | 40 | command palette |
| `z-dialog` | 50 | dialogs, context menus draw at 50+ via Radix portal |
| `z-toast` | 60 | toasts |
| `z-tooltip` | 70 | tooltips (always top) |

---

## 5. Iconography

### 5.1 Set & usage (icons0 / Iconify, Lucide)

- Primary set: **Lucide** (via Iconify/shadcn CLI — dither-kit requires `components.json`; icons installed through it). Secondary allowlist (only if Lucide lacks the glyph): `ph:` (Phosphor brand logos), `simple-icons:` (tech logos in integrations/README shields). No other sets.
- Naming: components `Icon[Name]` (`IconPlus`, `IconCircleDot`); props typed `icon: IconName`; kebab `lucide` ids in data (`"arrow-up-right"`).
- Sizes: **16px** in dense rows/menus/chips · **18px** nav & topbar · **20px** section headers & empty states · **24px** marketing only. Never below 14px.
- Stroke: **1.5** everywhere (Lucide default 2 is too heavy at 16px on our contrast); no fills except status/state dots and the custom glyphs below.
- Color: inherit `currentColor`; status-colored icons take their token (§2.4); icon+text pairs always share one token.
- Optical alignment: 16px icons in 20px rows use 2px nudge allowance (§4.1).

### 5.2 Custom glyphs (owned SVGs, `src/components/icons/prodmax`)

All on a 16×16 viewBox, `stroke-width: 1.5`, `stroke: currentColor` unless noted. Sketches below are binding direction; production paths may be refined ±0.25px for pixel-snapping.

**Priority bars** (glyph IS the meaning; hue is reinforcement — §10.4):
```
low:    M3 10h2.5v3H3z                                              (1 filled bar)
medium: M3 10h2.5v3H3z  M6.75 6.5h2.5V13h-2.5z                       (2 filled)
high:   M3 10h2.5v3H3z  M6.75 6.5h2.5V13h-2.5z  M10.5 3h2.5v10h-2.5z (3 filled)
urgent: high + cap line M2.5 1.25h11v1.5h-11z                        (stress cap)
none:   M3 10h2.5v3H3z  M6.75 6.5h2.5V13h-2.5z  M10.5 3h2.5v10h-2.5z (all stroke, fill none)
```
Bars ascend 4→8→11px heights; glyph width fixed 13.5px so columns align in rows.

**State dot**: `<circle cx="8" cy="8" r="4.5" fill="currentColor"/>`; completed variant overlays a check `M5.6 8.2l1.7 1.7 3.1-3.6` stroked in `bg-2`; triage variant renders at 60% with a pulsing outer ring (motion §8.2 `row-pulse` reuse, 2s).

**Estimate dots**: filled circles r=1.75 at x = 2.75 + i×4.25 (i<8); values >8 render 8 dots + outer ring on the 8th. T-shirt scale maps XS1→XL8 before render.

**AI engine badges**:
- `⚡ local` — rounded-square 16 `M2.5 2.5h11a1 1 0 011 1v9a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9a1 1 0 011-1z` filled `ai-solid`, bolt `M9.2 2.8 4.9 9h2.8L6.7 13.4 11.1 7H8.3z` filled `ai-on`.
- `◈ provider` — same square stroked `ai-solid`, diamond `M8 4.8 11.2 8 8 11.2 4.8 8z` filled `ai-solid`, inner `M8 6.6 9.4 8 8 9.4 6.6 8z` filled theme bg.

**Relation arrows**:
- related: `M3.5 8h9M10 5l3 3-3 3M6 5L3 8l3 3`
- blocked by: `M13.5 8h-9M7 5L4 8l3 3` + slash circle `M8 8m-5.25 0a5.25 5.25 0 1010.5 0 5.25 5.25 0 10-10.5 0M4.6 4.6l6.8 6.8` (danger stroke)
- blocking: mirrored blocked-by (arrow right)
- duplicate: two offset rounded squares `M5.5 5.5h7v7h-7z M3.5 3.5h7` (back square 40% opacity)

### 5.3 Priority/state rendering rule (anti color-only, §10.4)

Priority = bars glyph + hue + text label in menus/tooltips/toasts (dense rows may omit the word but the tooltip always carries it). State = dot + category hue + name (board column headers and group headers always show the word; rows show dot + word in the state cell).

---

## 6. Component Inventory (51 components)

Conventions applying to **every** component below (stated once, never repeated):
- **Focus:** all interactive elements use `:focus-visible` ring = `ring` token, 2px, 2px outer offset (§10.1); nothing else changes on focus.
- **Density:** all consume §4.2 vars; "compact/comfortable" behavior noted only where non-obvious.
- **Disabled:** text `text-tertiary`, icon 50% opacity, cursor not-allowed, hit target retained, `aria-disabled="true"`.
- **Loading:** inline controls keep layout; async buttons show 14px spinner-in-label, never width change.
- Base column = shadcn/ui component wrapped in `src/components/**` with Prodmax tokens; never import shadcn primitives directly in features.

### 6.1 Actions

**01 Button** (`button`) — Primary (accent-500/600 + on-accent, radius-md, h = `--ctrl-h`/`--ctrl-h-md`, px-3/px-4, text-md 500; subtle 1-bit 8%-density dither overlay allowed ONLY on marketing/onboarding primaries, never app chrome) · Secondary (bg-3 + border, text-primary) · Ghost (transparent, hover interactive-hover) · Danger (danger-solid + on-danger; also `danger-ghost` for row actions) · **AI** (ai-subtle bg + ai-text + 16px ⚡ leading glyph, hover ai-solid 12%; announces "AI" in name — never ambiguous with primary). Sizes sm/md/lg = 24·28·32/36 comfortable. States: hover (accent-300 dark lift / accent-50 light wash), active (interactive-active), loading (spinner replaces leading icon, label persists). Screens: everywhere; AI variant on triage inbox, issue modal AI actions, AI center.
**02 IconButton** — square `--hit` min hit, 16/18px icon, variants as Button; icon-only always carries SR name (§10.6). Screens: topbar, row kebabs, palette trigger, theme toggle.
**03 Kbd** — mono `text-2xs` 500, px-1.5 py-0.5, radius-sm, bg-3, border, text-secondary; `⌘`/`Ctrl` auto-detected per platform; multi-key sequences join with `+` at 4px gap. Screens: tooltips, palette footer, onboarding tour, shortcut help (`?`).

### 6.2 Inputs

**04 Input** — bg-0 on bg-2 surfaces (inset feel) or bg-3 on bg-0; border hairline; radius-md; h `--ctrl-h-md`; text-md; placeholder text-tertiary; focus ring; error = danger border + danger-text message `text-sm` below (icon + text, never red-only). Mono modifier for ID/numeric fields (tabular). Screens: all forms, settings, quick-create.
**05 Textarea / markdown editor chrome** — Input styling, min-h 96px, mono optional per field; issue descriptions get toolbar row (B/I/S/code/link/attach, 16px ghost IconButtons) + preview toggle; local draft indicator = mono `text-2xs` "Draft saved" in secondary. Screens: issue editor, comments, project updates.
**06 Select** (`select`) — Input chrome + chevron 16; menu = popover list; selected = interactive-selected + check 16; mono option variant for statuses/scales. Screens: settings, filters, workflow editor.
**07 Combobox** (`command` in popover) — Input with chip tokens (multi) or single value; filtering fuzzy, 150ms debounce; option rows 32px: leading 16px icon/avatar, label, trailing meta mono (e.g., open issue count for label picker); empty → "No match — clear filter". `aria:` combobox + listbox (§10.5). Screens: assignee (A), labels (L), projects, members, palette-adjacent pickers, issue-view block binding.
**08 FilterBar + FilterChip** (`FM-021/022`) — sticky row (z-sticky) h-40: leading funnel icon, chip row horizontally scrollable, trailing "Display" popover + count mono. Chip anatomy: property label (text-secondary) + operator mono (`is`, `is not`, `before`) + value(s) pill(s) + remove ×; AI-parsed chips (FM-062) render ai-subtle with ⚡ and always show full parse before apply. Advanced mode: nested group chrome with and/or toggles, max 3 depth. NL input mode toggle. Screens: issues list/board/table, triage, insights drilldowns, cycles.
**09 DatePicker** — popover calendar; month grid 7×6 cells 32px; today = ring hairline; selected = interactive-selected; range pick = accent-300 endpoints + 14% band; due presets row (Today / Tomorrow / Next week) ghost buttons; footer cleared-by-week. Screens: due dates, project targets, cycle surgery, insights ranges.
**10 SearchInput** — Input + trailing `Esc` Kbd + leading search icon; as-you-type shows mono result count "42 issues · 7 pages"; zero state swaps to **EmptySearch** (below). Screens: global search (`/`), inbox filter, palette.

### 6.3 Overlays

**11 DropdownMenu** (`dropdown-menu`) — bg-2, radius-lg, border, shadow-2, p-1; item h-32: icon 16 + label text-base + shortcut Kbd right; destructive items danger-text; section labels text-2xs tertiary caps +0.05em; mix mouse + arrows; `aria:` menu (§10.5). Screens: everywhere (row kebabs, topbar, view menus).
**12 ContextMenu** (`context-menu`) — same chrome as DropdownMenu; opens on right-click (rows, cards, board columns, sidebar nodes, blocks); touch long-press opens a bottom **Sheet** instead (FM-026 touch-safety); bulk context menu shows mono selection count "3 selected". Screens: issues/board/table, docs blocks, sidebar, triage.
**13 CommandPalette** (`command-dialog`) — Cmd/Ctrl+K; centered 640px, max-h 70vh, radius-xl, bg-2, shadow-3, `palette-in` motion; input row 48px text-md sans + trailing Kbd hints; grouped sections (Actions · Navigation · Issues · Pages · Projects · AI) with text-2xs caps headers; item rows 40px both densities (transient surface): leading icon/avatar, title, trailing mono meta + Kbd; AI group header carries EngineBadge; recents pinned with "Recent" label; footer: ↑↓ navigate · ↵ run · ⇥ filter type. `aria:` dialog + combobox + listbox, focus trap, restore on close. Screens: global.
**14 Dialog** (`dialog`) — centered, max-w 560px default, radius-xl, bg-2, shadow-3, overlay scrim + blur; header (text-2xl 600 + optional description text-sm secondary) / body / footer (actions right-aligned, Cancel ghost); close IconButton SR-named; Enter=primary, Esc=cancel. Screens: confirmations (delete workspace type-to-confirm uses mono input matching slug), invite create, template picker (Alt+C), cycle surgery.
**15 Sheet — issue modal** (`sheet`) — right side, w 480 comfortable / 640 wide-flag; bg-2, border-left hairline, shadow-3, `panel-slide` motion; anatomy: header (mono ID + copy-link + presence + more) / title (text-xl editable inline) / property strip (state · assignee · priority · labels · project · cycle inline editors, §31) / description markdown / relations & sub-issues / activity & comments tabs (Tabs 20) / footer (subscribe, AI actions). Full editor `V` opens centered Dialog 880px variant. Touch: full-screen. `aria:` dialog, focus trap. Screens: issue detail, bulk-edit preview, move-to-team warning.
**16 Popover** (`popover`) — bg-2, radius-lg, border, shadow-2, p-3; non-modal (no scrim), Esc/outer-click close; anchored flip. Screens: "why" popovers (AI), display options, date picker host, breakdown hovers.
**17 HoverCard** (`hover-card`) — 280px card: avatar 32 + name + role + mono email + teams; issue hover: ID mono + title + state badge + meta; delay 300ms open / 150ms close; suppressed on touch. Screens: mentions, assignee avatars, presence stack, relation lists.
**18 Tooltip** (`tooltip`) — bg-2 with border-strong edge (perceptible against both bg-0 and bg-2 hosts), radius-sm, px-2 py-1, text-sm; content = label + optional Kbd hint row ("Assign to… A"); delay 400ms; max-w 240px; never the only source of an icon's meaning (pairs with §10.6 names). Screens: global.
**19 Toast** (`sonner` wrapper) — bottom-right stack, max 3 + collapse; w 360, bg-2, border, radius-lg, shadow-4, `toast-in`; anatomy: status icon 16 (colored §2.4) + text-base message + optional mono meta + action ghost button (Undo); danger variant persists 8s, others 4.5s; `aria-live` per §10.5. Screens: global (mutations, undo receipts, SSE conflicts FM-090).

### 6.4 Navigation

**20 Tabs** (`tabs`) — underline style: item text-md 500 text-secondary, active text-primary + 2px accent underline (offset 4px above border); trigger list = pill group bg-3 radius-full; keyboard arrows per APG; count badges mono. Screens: issue detail (Activity/Comments), settings sections, insights, project tabs.
**21 TreeNode** (sidebar pages; `collapsible` base) — row h-28: expander chevron 14 + emoji/page icon 16 + title text-base truncate + kebab on hover; indent 16px/level, depth cap visual scroll at 8; drag-over parent = accent-50% 2px inset; active = interactive-selected; collapsed-count mono badge. `aria:` tree (§10.5). Screens: sidebar pages tree, docs outliner, label groups editor.
**22 SectionHeader** — sidebar/panel group header: text-2xs caps 600 tertiary +0.05em, h-24, optional trailing "+" ghost IconButton 16px; sticky variant in settings with border-b hairline. Screens: sidebar (Workspace/Teams/Pages/Favorites), settings nav, palette groups, insights sections.
**23 Breadcrumb** — topbar: crumbs text-sm secondary separated by `/` 8px gap, last = text-primary; issue crumb = mono ID; overflow collapses to "…"; each crumb a link with hover underline. Screens: topbar all routes.
**24 SettingsNav** — left column 200px in settings layout: item rows h-32 icon 16 + label; active = interactive-selected + 2px accent left bar; sections via SectionHeader. Screens: /settings/**.

### 6.5 Issue domain

**25 IssueRow** — h `--row-h`, grid cols: 20 checkbox-gutter / 24 priority / 56 mono ID / 1fr title (+ relation arrows + blocking banner inline) / 120 labels / 96 assignee+estimate / 112 updated mono; hover = bg-3 full-bleed + kebab reveal; selected = interactive-selected + inset bar; SSE delta = `row-pulse`; column visibility per view display options; drag handle appears on hover-left for manual reorder; double-click title = inline edit (Input borderless variant). Screens: list view, triage, cycle scope, embeds, search results.
**26 BoardCard** — w 260, radius-lg, bg-2, border, px `--card-px` py `--card-py`: ID mono 2xs + estimate dots right / title text-sm 2-line clamp / footer: priority bars + labels (max 2 +n) + avatar 20; hover = `card-lift` + border-strong + shadow-1; drag ghost = 80% opacity + shadow-4; drop target column = accent-50% edge; touch drag = confirm move-sheet (FM-026). Screens: board view, project board, cycle board.
**27 BoardColumn** — w 280, transparent body with border-l hairline (columns read as bays, not boxes): header sticky (z-sticky) = state dot + name + mono count⇄points toggle + kebab; body scroll; empty = text-tertiary "Drop issues here" at 24px pad; WIP overflow (optional) = warning dot on header. Screens: board view.
**28 PriorityIndicator** — bars glyph 16 (§5.2) + hue §2.5; in menus renders with text label; tooltip = label; click opens the priority Select (no silent cycling). Screens: rows, cards, issue modal, triage gate.
**29 StateBadge** — dot 8 + label text-xs 500, pill bg category-subtle (14%) + category text color, radius-full, h-20; compact row variant = dot-only + tooltip. Screens: rows, cards, issue modal, workflow editor, activity verbs.
**30 LabelChip / Badge** — text-xs, radius-full, h-20, px-2; label variant: 6px dot in label color + name; neutral variant: bg-3 + text-secondary; AI-suggestion variant: dashed border + ⚡; counts variant mono. Screens: rows, cards, filter chips, combobox options.
**31 TableCellEditors** (table view) — frozen ID col mono; cell focus (click/Tab) = border-strong inset + popover editor per type: Select (state), Combobox (assignee/labels), PriorityIndicator grid, DatePicker, estimate stepper mono; Enter commits · Esc reverts · Tab commits+right; dirty cell = accent-300 2px bottom bar until reconciled (optimistic FM-090). `aria:` grid pattern. Screens: table view, CSV import mapping preview.
**32 EstimateDots** — dots glyph (§5.2) + mono value tooltip; scale legend in team settings; unestimated renders outline ghost dot. Screens: rows, cards, cycle scope, capacity.
**33 PresenceStack** — overlapping avatars 20px, −6px margins, 1.5px bg ring; "you" last with accent ring; max 3 + "+n" mono chip; hover → HoverCard roster; join/leave = 150ms scale-in/out; never shows ghost entries (15s TTL, FM-089). Screens: topbar, issue modal, pages, boards.

### 6.6 AI

**34 EngineBadge** — pill h-20 px-1.5 radius-full ai-subtle: ⚡ + "Local engine" or ◈ + provider·model mono text-2xs ai-text; tooltip = engine label + feature + duration mono ("12 ms"); static, never animated (motion budget spent elsewhere). Appears on: every AI suggestion card, summary block, chat answer, activity AI row, ai_runs browser, AI settings, usage meters. Screens: triage, issues, AI center, activity, settings.
**35 AISuggestionCard** — ai-subtle bg-2 card, radius-lg, border, `card-lift` mount; header: EngineBadge + feature label text-2xs caps + as-of mono timestamp; body per type: property suggestions = chip rows with arrows (`bug → label`), text suggestions = **diff layout**: removed lines bg danger-subtle text danger-text mono, added bg success-subtle, context text-tertiary, unified diff with −/+ gutters; footer: Accept (primary sm) · Reject (ghost sm) · Why (ghost, opens Popover with matched-rule/similar-issues/citations list, each item linked). Screens: triage (FM-064), dedup banner (FM-063), drafting (FM-067), hygiene (FM-069), meeting extraction (FM-070), ask (FM-066) — ask uses sentence cards each with citation link + confidence mono.

### 6.7 Docs

**36 SlashMenu** — popover at caret 240px: filter Input 28 top; grouped items (Basic/Advanced/Prodmax): icon 16 + name text-base + type hint text-2xs mono; arrow navigation inserts at block; `issue_view` item opens inline view-picker sub-row; recent-used pinning. Screens: docs editor.
**37 BlockHandles** — left gutter pair on hover/focus-within-block: "+" (insert menu) + ⋮⋮ grip 16px ghost; drag ghost = block preview card 80% + shadow-4; drop indicator = 2px accent line full block width; keyboard Alt+↑/↓ moves block; handle SR-name "Block actions". Screens: docs editor.

### 6.8 Data display & viz (dither-kit wrappers — stable internal API, `src/components/charts`)

All wrappers isolate dither-kit's actual exports behind `<PmxArea|PmxBar|PmxScatter|PmxRadar|PmxSpark>` so a library API change never touches feature code. Shared: theme-aware series from §2.8, grid hairlines, mono tabular axes, empty → EmptyState, loading → Skeleton, click/hover → breakdown popover + click-through to filtered view (FM-061), CSV export button (ghost sm) top-right.

**38 AreaChart** — burn-up (FM-059): 2–3 series (scope, completed, ideal), dither fills 20/40% density by series, 1.5px strokes, weekly/monthly toggle. Colors: dark `#46b46e`(completed)/`#7186ab`(scope)/dashed ideal; light `#2e8a4e`/`#4054a0`.
**39 BarChart** — velocity + created-vs-completed (FM-058/060): grouped bars, dither density per series (2px/3px cells), hover = value mono + breakdown, negative net-trend line rose. Colors: series 3/1 dark.
**40 ScatterChart** — cycle/lead/triage time (FM-058): dots 4px series-1 at 60%, p25/50/75/95 dashed percentile lines text-secondary with mono labels; point click → issue Sheet. (Not dither-filled — dots stay crisp for click accuracy; dither reserved for fills.)
**41 RadarChart** — capacity/breakdown (FM-033/061): axes mono labels, polygon fill series-1 dither 15%, second polygon stroke-only. Dark `#edd67f`; light `#8a6a25`.
**42 Sparkline** — 80×24 (40×16 dense): 1.5px stroke series-1, area dither 12%, end-dot 3px accent, hover = min/max mono tooltip; tabular. Screens: project rows, cycle header, usage meters, insights cards.
**43 ProgressBar** (project/cycle) — h-4 track bg-3 radius-full; fill = solid accent-500/600 at 90% with 10%-width dither fade edge (the logotype made real); overdue = fill switches danger with label; label row: mono percent + count "12/31"; determinate only. Screens: projects list/detail, milestones, cycle, onboarding sample-load.

### 6.9 Feedback & system

**44 Avatar** — photo if uploaded else **dither-kit generative**: seed = `users.avatar_seed` → hash → deterministic (2 hues from §2.8 + Bayer pattern mirrored on 5×5 vertical axis, 1-bit dither on bg-2 base). Sizes: 16 (dense row) · 20 (row/board) · 24 (default) · 32 (modal/settings) · 40 (onboarding). Guests get a 1px dashed ring; suspended 40% grayscale; presence ring accent (online, FM-089); "you" badge text-2xs. Never initials-only (dither identity is the brand).
**45 Skeleton** — text lines h-8px radius-sm bg-3 + shimmer (§8.2) 1.6s; avatar-skeleton = static dither block (no shimmer — noise discipline); chart-skeleton = static low-contrast dither + sr-only "Rendering"; >400ms → swap to EmptyState-with-progress-copy. Screens: views, docs, insights, AI waits (<2s only; longer = progress bar with mono step).
**46 EmptyState** — centered max-w 320: **dither illustration tile** 96×96 (dither-kit gradient, domain glyph — issues: three dithered bars; docs: dithered page; inbox: dithered tray; insights: dithered chart; search: dithered magnifier; AI center: canvasui GlyphRain §7) + title text-md 600 + body text-sm secondary + CTA Button sm + optional Kbd hint. `dither-fade` on mount. Copy is dry-warm: "The bench is clear." Screens: every view type, triage, inbox, search, AI center.
**47 Banner** — full-width under topbar, h-36, sticky z-sidebar: SSE reconnect (FM-088) = warning-subtle bg + pulsing dot + "Reconnecting — edits are saved locally and will sync." + Retry ghost; resynced flash success 1.5s auto-dismiss; conflict (FM-090) = info variant with "Review changes" action opening Sheet; dismiss X SR-named. Screens: app-global.
**48 OnboardingStepper** (FM-004) — left rail w 240: steps numbered mono 01–04 + labels, done = success check, active = accent bar + text-primary; right content min-w 480; step 2 workspace-name reveal uses canvasui DecryptReveal (§7.2); final step: sample-data checkbox, tour CTA, Enter=Continue; footer Back ghost / Continue primary. Screens: /onboarding.
**49 ApiKeyRow** (FM-074) — h-40: name text-base + key prefix mono `pmx_abc1…` + scopes LabelChips + created/last-used mono relative + revoke danger-ghost; create flow = Dialog with **secret shown once** (mono, copy button, "stored hashed — shown once" note). Screens: settings/keys.
**50 WebhookRow** (FM-076) — h-40: URL mono truncate + events chips + active switch + expand → delivery ledger rows (status shieldcn-style mini-shield success/danger, response code mono, attempts, next retry mono, Redeliver ghost). Screens: settings/webhooks.
**51 UsageMeter** (FM-084) — per-feature row: feature name + EngineBadge + invocations mono + p50 latency mono + accept-rate Sparkline + cost cell mono ("$0.00" local mode, teal in provider mode with token spend + ceiling ProgressBar dither fill). Screens: settings/ai, AI center.

---

## 7. Dither & Canvas Signature System

### 7.1 Where dither appears (allowed) — and where it is banned

**Allowed (brand moments):**
1. **Login / marketing hero** — full-bleed dithered amber gradient wash over the engineering grid (canvasui, §7.2) + floating dithered shapes.
2. **Empty states** — static dither-kit gradient illustration tiles (46). Not canvas.
3. **Generative avatars** — dither-kit seeded pattern (44). Everywhere avatars appear; this is the workhorse dither.
4. **Chart fills** — dither-kit ordered-dither fills in insights (38–42) and sparklines; dots/lines stay crisp.
5. **AI center hero** — canvasui GlyphRain empty-state + panel header dither wash.
6. **Loading shimmer alternative** — "dither-pulse": two-frame dither density swap 800ms on brand surfaces (onboarding, AI waits); standard shimmer elsewhere.
7. **Primary button texture** — 8%-density 1-bit dither overlay, marketing/onboarding CTAs only.
8. **ProgressBar fade edge** (43) — the logotype motif.

**Banned:** dense working lists (rows, table cells, board cards), inputs/editors, tooltips, code blocks, menus, dialogs, toasts, docs content canvas, sidebars, settings. Rationale: legibility + the 16ms/frame budget at 10k rows (architecture §9) — dither in lists would also destroy the "moment" quality.

### 7.2 Canvasui component picks (signature moments only)

| Effect | Route | Purpose | Props/notes |
|---|---|---|---|
| **RetroDither** | /login hero | amber gradient wash, slowly drifting threshold | colors: accent-500→accent-900 on bg-0; cell 3px; speed 0.2; DPR cap 2 |
| **DitheredObject** | /login, marketing | 2–3 floating dithered prisms (the mark's bars in 3D-ish rotation) | seed fixed per route; `prefers-reduced-motion` → static frame |
| **DecryptReveal** | /onboarding step 2 | workspace name scrambles then settles ("Acmeforge" resolving) | settle 1200ms; final frame = text-xl 600 text-primary; skip-able (click/Esc → instant) |
| **GlyphRain** | AI-center empty state | sparse teal glyph drizzle behind "Ask your workspace" | density low (≤80 glyphs), opacity 0.25, ai-300 on bg-0; pauses on input focus |

**Rules (binding):** canvas only on non-working routes (login, onboarding, marketing, AI-center empty state). Pause via `document.visibilitychange` and IntersectionObserver (offscreen ⇒ paused). Dispose on route change. **≤4 concurrent canvases** per route; **DPR capped at 2**. `prefers-reduced-motion: reduce` ⇒ render one static frame, no RAF loop. No canvas ever sits under text-bearing working surfaces.

### 7.3 Dither-kit integration notes

dither-kit installs via shadcn CLI and requires `components.json` (present from M0). All dither usage flows through the wrappers in `src/components/charts` + `Avatar`/`EmptyState`/`Button` — feature code never imports dither-kit directly (mirrors the architecture's module-ownership rule). Dither patterns: Bayer 2×2 (avatars, chips) / 4×4 (chart fills) / 8×8 (hero washes); density presets 8/12/15/20/40% as listed above. Light theme dithers with ink colors (series hexes §2.8) on bg-2; dark inverts.

---

## 8. Motion Tokens

ux-spec §10 references these; **this table is canonical**. Philosophy: motion confirms, never performs. Nothing decorative moves in working views.

### 8.1 Duration & easing

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 60ms | hovers, color/fill swaps, chip toggles |
| `--dur-fast` | 120ms | menus, popovers, tooltips, card-lift |
| `--dur-base` | 200ms | palette, dialogs, sheets, toasts |
| `--dur-slow` | 300ms | panels, onboarding step transitions |
| `--dur-slowest` | 480ms | dither-fade, empty-state illustration |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | default in/out |
| `--ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | things arriving (palette, dialogs, toasts) |
| `--ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | things leaving (faster than enter) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | rare: drag-drop settle, presence join |

### 8.2 Named animations

| Name | Spec | Where |
|---|---|---|
| `palette-in` | opacity 0→1 · scale .98→1 · translateY 4→0 · 150ms `ease-enter` (exit 100ms `ease-exit`) | command palette |
| `panel-slide` | translateX 12px→0 · opacity · 200ms `ease-enter` | sheets, settings sub-panels, filter-bar expand |
| `card-lift` | translateY −1px · border-strong · shadow-1 · 120ms `ease-standard` | board cards, AI suggestion cards, menu items |
| `row-pulse` | bg flash `interactive-selected` 250ms ×2 · 500ms total | SSE-updated rows (FM-088), triage arrivals |
| `toast-in` | translateY 8px→0 · opacity · 180ms `ease-enter` (out 140ms) | toasts |
| `shimmer` | background-position 2× loop · 1600ms linear | skeletons |
| `dither-fade` | dither density 0→target + opacity · 480ms `ease-standard` | empty-state tiles, progress fade edges, chart first paint |
| `dither-pulse` | 2-frame density swap · 800ms/frame | brand loading (onboarding, AI waits) |
| `decrypt-reveal` | scramble→settle · 1200ms | onboarding only (canvasui) |

### 8.3 Reduced motion (`prefers-reduced-motion: reduce`)

All transforms/parallax → **opacity-only, ≤100ms**; loops (shimmer, dither-pulse, row-pulse, pulse dots) → static final state; canvas effects → single static frame (§7.2); decrypt-reveal → instant text. No animation is ever the sole carrier of information (row-pulse pairs with the content change itself).

---

## 9. Theme Implementation

### 9.1 Strategy

shadcn convention: tokens as CSS custom properties on `:root` (light) and `.dark`, consumed by Tailwind via `@theme inline` (Tailwind v4; if v3, `theme.extend.colors` with `rgb(var(--…) / <alpha-value>)`). Dark class on `<html>`; **dark is default** — `.dark` applied unless user chose light. `<meta name="color-scheme" content="light dark">` + `color-scheme: light` / `dark` in CSS so scrollbars/inputs match. `theme-color` meta per theme (`#14171c` / `#f4f1ea`).

### 9.2 Toggle (FM-085)

Topbar IconButton cycles **light → dark → system** (icons Sun/Moon/Monitor, SR names §10.6). Persisted: server `users.preferences.theme` (authoritative, PATCHed debounced) + `localStorage["pmx-theme"]` (fast path). **No flash:** inline `<script>` in Astro shell head reads localStorage before first paint and sets `.dark`. System mode listens to `matchMedia('(prefers-color-scheme: dark)')` change events live. Toggle is instant (no transition on theme swap except 60ms cross-fade on bg layers).

### 9.3 Token → CSS variable map

| Prodmax token | CSS var | shadcn slot |
|---|---|---|
| bg-0 | `--pmx-bg-0` | `--background` (+ `--foreground` = text-primary) |
| bg-2 | `--pmx-bg-2` | `--card`, `--popover` (+ `-foreground`) |
| bg-3 | `--pmx-bg-3` | `--secondary`, `--muted` (+ `-foreground` = text-primary/secondary) |
| overlay | `--pmx-overlay` | — (custom) |
| border / weak / strong | `--pmx-border{,-weak,-strong}` | `--border`, `--input` (= border) |
| accent-500 (dark) / 600 (light) | `--pmx-accent` | `--primary` |
| on-accent | `--pmx-on-accent` | `--primary-foreground` |
| interactive-hover | `--pmx-hover` | `--accent` ⚠ **trap: shadcn "accent" = hover, NOT brand** (§2.2) |
| interactive-active / selected | `--pmx-active`, `--pmx-selected` | custom |
| danger-solid | `--pmx-danger` | `--destructive` |
| ring | `--pmx-ring` | `--ring` |
| text-primary/secondary/tertiary | `--pmx-txt-1/2/3` | `--foreground` / `--muted-foreground` / custom |
| status ×4 ×3 | `--pmx-{status}-{subtle\|solid\|text}` | custom |
| ai ×5 | `--pmx-ai-*` | custom |
| chart 1–8 | `--pmx-chart-1…8` | custom |
| fonts | `--font-sans`, `--font-mono` | Tailwind `font-sans/mono` |
| density vars | `--row-h`, `--cell-py`, `--card-py`, `--card-px`, `--ctrl-h`, `--ctrl-h-md`, `--hit`, `--list-gap` | custom (§4.2) |

Status/priority/state/chart hexes ship as literal values in each theme block (not ramp-referenced) so devtools inspection is one-hop.

### 9.4 Density as data-attribute

`<html data-density="comfortable">` (default). Toggle in Settings → Appearance + topbar quick toggle; persisted alongside theme (same PATCH). All list/table/board/card/control components consume the §4.2 vars only — no component hard-codes row heights. Switch density = instant, no re-layout animation.

### 9.5 Fonts

`@fontsource-variable/inter` + `@fontsource-variable/jetbrains-mono` imported once in the Astro shell (`src/styles/fonts.css`, M0-owned); `unicode-range`-subsetted woff2 (latin + latin-ext minimum); `font-display: swap`; preloaded in head for the two variables. No Google Fonts CDN (self-hosted = offline-capable, on-brand).

---

## 10. Accessibility Baked In

### 10.1 Focus ring (the "generous visibility" promise)

`*:focus-visible { outline: 2px solid var(--pmx-ring); outline-offset: 2px; }` — global, non-negotiable, **no component may remove it**; nothing else changes on focus. Ring = accent-500 (dark) / accent-600 (light) — 7.0:1 / 3.8:1 on their backgrounds. Focus never hidden behind canvas or transformed elements; dialogs trap and restore focus (Radix default, verified in tests). Keyboard nav order = visual order; `G`/`O`-prefix nav moves real focus, not a fake cursor.

### 10.2 Hit targets

Minimum interactive target = `--hit`: **32px compact / 40px comfortable**. Compact 28px rows keep legal targets via padded pseudo-element hitboxes (a 28px visual row exposes ≥32px hit bands for its interactive cells). IconButtons are square at `--hit`. Board drag handles 24×24 visual with 32px hit. Touch move-confirm sheet (FM-026) doubles as the accessibility fallback for drag-only mutations.

### 10.3 ARIA pattern assignments (WAI-ARIA APG)

| Component | APG pattern |
|---|---|
| DropdownMenu / ContextMenu | Menu / Menubar (roving focus, Esc closes, typeahead) |
| Dialog / Sheet / Palette-as-dialog | Dialog (focus trap, restore, `aria-modal`) |
| CommandPalette input + results | Combobox w/ Listbox (aria-activedescendant) |
| Combobox pickers | Combobox w/ Listbox, selection follows focus |
| Select | Select (native `<select>` where possible; custom uses Listbox popover) |
| Tabs | Tabs (automatic activation, arrow keys, `aria-selected`) |
| Sidebar pages / outliner | Tree (`role=tree/treeitem`, `aria-expanded`, arrow-key traversal) |
| Table view | Grid (`role=grid`, cells focusable, arrow navigation, roving tabindex) |
| Toast | `role=status` `aria-live=polite` (danger: `role=alert`) |
| Banner | `role=status` polite; conflicts `role=alert` |
| Tooltip | describedby; never focus-only content duplication for critical info |
| HoverCard | describedby pattern, keyboard-focusable trigger |
| SlashMenu / block handles | Menu pattern at caret + `aria-describedby` editor hints |
| ProgressBar / UsageMeter | `role=progressbar` with `aria-valuenow/min/max` |
| Onboarding stepper | `aria-current=step` on active |
| Presence / SSE dot | text alternatives (visually-hidden roster text; "Reconnecting" banner carries state) |

### 10.4 Color-only info prohibition

Every color signal pairs with glyph/text: priority = bars glyph + label in menus/tooltips (§5.3); state = dot + name (rows show dot+name in state cell; dot-only allowed only where tooltip always names it); status toasts/banners = icon + text; chart series = legend + dither-density/lightness separation + labels on hover; AI = ⚡/◈ glyph + engine label text (never teal alone); urgent = cap-line glyph differentiator (survives deuteranopia); selected rows = tint **plus** inset bar; SSE = dot plus banner text.

### 10.5 Contrast

Verified table §2.9 is the contract; the a11y agent (Phase 4) re-runs axe + manual checks against it. Known intentional exceptions documented there (hairlines §2.9 disclosure).

### 10.6 Screen-reader names for icon-only buttons (15)

| # | Button | Accessible name |
|---|---|---|
| 1 | Palette trigger | "Command palette (Ctrl K)" |
| 2 | Theme toggle | "Theme: dark. Activate to switch to light" |
| 3 | Density toggle | "Density: comfortable. Activate for compact rows" |
| 4 | Sidebar collapse | "Collapse sidebar" / "Expand sidebar" |
| 5 | New issue | "New issue (C)" |
| 6 | Search clear | "Clear search" |
| 7 | Filter clear | "Clear all filters (Shift Alt F)" |
| 8 | Row kebab | "Actions for PRO-123" |
| 9 | Presence more (+n) | "3 more people viewing" |
| 10 | Notification snooze | "Snooze notification (H)" |
| 11 | Sort direction | "Sort: newest first. Activate to reverse" |
| 12 | Favorite star | "Add view to favorites" / "Remove from favorites" |
| 13 | Block handle | "Block actions" |
| 14 | Comment resolve | "Resolve thread" |
| 15 | Invite copy link | "Copy invite link" |

Names are announced with live state ("Collapse sidebar" ↔ "Expand sidebar"); kbd suffixes match tooltips.

### 10.7 Reduced motion

§8.3. Additionally: presence join/leave, decrypt effects, glyph rain all degrade to static; `row-pulse` replaced by content update + SR live region. Test pass in Phase 4 visual agent.

---

## 11. Application Surfaces

### 11.1 Login / onboarding visual concept

**Login** — split: left 55% canvasui RetroDither hero (amber wash over faint engineering grid — 32px major lines `border-weak` — with two DitheredObject prisms drifting; static PNG fallback for reduced-motion) + wordmark top-left, tagline "Ship from the bench." bottom-left mono; right 45% bg-2 panel: mark 24 + "Sign in to your workshop", email/password Inputs, primary Button full-width, "Create account" ghost. One canvas ≤ DPR 2.

**Onboarding** (FM-004) — full-screen bg-0; OnboardingStepper layout (48); step 2 "name your workspace" centers a mono input whose valueDecryptReveals into a workspace plate (mark + name in bordered card) on Continue; step 4 seeds sample data with ProgressBar dither fills and offers the shortcut tour (`?`-help preview inline). All steps keyboard-completeable; Enter advances.

### 11.2 App shell surfaces

- **Sidebar** 240px (collapsed rail 48px): bg-1 — workspace switcher (avatar 24 + name + chevron) / SectionHeaders: Favorites, Teams (tree of teams + views + cycles), Your pages (TreeNode tree), Recents / footer: user card (avatar 32 + name + theme/density/menu). Hairline right border. Resizable 200–320.
- **Topbar** 44px: bg-1, hairline bottom — Breadcrumb / view tabs or title / spacer / SearchInput trigger (mono "/" Kbd) / SSE status dot + presence / palette / new issue primary sm.
- **Content** bg-0 on 8px baseline — working views (list/board/table/docs/insights) flush to edges with 16px gutters; sticky filter bar (z-sticky) where applicable.
- **Sheet/panels** bg-2 (issue modal 15, AI center right panel); **Dialogs** for confirmations; **Toast** bottom-right.
- **Settings** bg-0 content with bg-2 cards; SettingsNav left.
- SSE reconnect Banner slots between topbar and content (47).

### 11.3 Repo README "marketing page" (shieldcn layout)

Structure (all original copy):
1. **Header row** — mark 32 + `PRODMAX` wordmark 24 + tagline "Ship from the bench." (text-xl, text-secondary).
2. **Shield badge row** (shieldcn flat-square, 20px tall, gap 6): `build` passing (success) · `tests` `142 passed` (success) · `license` `MIT` (neutral) · `astro` `react` `tailwind` `sqlite` (stack, neutral) · **AI-engine badge last**: `⚡ AI` `local engine · $0.00/mo` — label bg `#14171c` text `#a6b0bc`, value bg `#0f2a30` text `#45d6e8` (the AI color, the only teal shield).
3. **Pitch paragraph** (3 lines max): issues like Linear, docs like Notion, AI on your bench — local-first, self-hosted, no meters.
4. **Three-column feature table** (Issues / Docs / AI engine) with 16px Lucide icons and hairline borders.
5. **Quickstart** code block (mono, bg-0, bash): clone → `npm install` → `npm run dev`.
6. Screenshot (login hero render), roadmap links, license.

In-app shieldcn usage (FM-087): webhook delivery status mini-shields (50), engine status shields in AI settings, session-list platform tags.

---

## Appendix A — Token inventory (handoff counts)

- **Color:** **~110 CSS variables** = 17 semantic primitives × 2 themes (4 bg + surface + overlay + 3 border + 3 text + 3 interactive + ring) + theme-variant literals: status 4×3 × 2, priority 5 × 2, state 6 × 2, AI 5 × 2, chart 8 × 2, primary/on-accent mapping × 2; plus the theme-invariant 12-step accent ramp shared by both.
- **Typography:** 12 scale tokens + 2 family stacks + 1 feature rule (tabular numerals).
- **Space/density:** 13 spacing steps + 8 density vars + 5 radii + 1 border width + 5 shadows + 8 z-index levels.
- **Motion:** 5 durations + 4 easings + 9 named animations + reduced-motion overrides.
- **Icons:** Lucide primary set + 7 custom glyph families (priority bars, state dot, estimate dots, ⚡ engine badge, ◈ provider badge, relation arrows, logotype mark).
- **Components:** **51** (§6).
