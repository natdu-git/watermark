# Task: add a visible app version to the Watermark PWA

This is an existing vanilla-JS PWA (no build step, no framework) under `webapp/`. Files: `index.html`, `css/style.css`, `js/app.js`, plus other `js/*.js`. The top bar is `<header class="topbar"><h1>Add Watermark</h1></header>`. Styles use CSS variables (`--muted`, etc.); the top bar has a colored (`--accent`) background with white text.

## Goal
Show the app version in one obvious place and define it in a single source of truth, so the running version is always visible on-device.

## Requirements
1. **Single source of truth:** add `<meta name="app-version" content="2026.07.15.1">` inside `<head>` in `index.html`. This is the ONLY place the version string is written.
2. **Also mirror it as an HTML comment** on the first line of `index.html` (e.g. `<!-- app version 2026.07.15.1 -->`) for quick file inspection.
3. **Display in the UI:** in `js/app.js` (or a small inline script), read `document.querySelector('meta[name="app-version"]').content` and render it into the top bar, right-aligned, small and subtle (e.g. a `<span class="app-version">v2026.07.15.1</span>`). Add CSS so it sits at the right edge of `.topbar`, ~11px, reduced-opacity white, not overlapping the `<h1>`.
4. Version format is CalVer `YYYY.MM.DD.N` where N is a same-day build counter starting at 1.

## Constraints
- No build tools, no frameworks, no new dependencies.
- Don't change any existing behavior; this is additive.
- Must render on mobile widths (~360–414px) without pushing the title off-screen.
- All JS must pass `node --check`.

After implementing, tell me the version string you set and confirm where it appears.
