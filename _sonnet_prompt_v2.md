# Task: implement 6 UI changes in the Watermark PWA

You are editing an existing vanilla-JS Progressive Web App (no build step, no framework, no bundler). It watermarks Thai PDF/image templates entirely client-side. Do NOT introduce a build system, npm, or a framework. Keep everything in plain HTML/CSS/JS loaded via `<script>` tags.

## Project layout (all under `webapp/`)
- `index.html` — markup, loads CDN libs (pdf.js, jsPDF, JSZip, pdf-lib) then `js/*.js`
- `css/style.css` — all styles; CSS variables at top (`--accent #1f6feb`, `--text`, `--muted`, `--border`, `--radius`, `--danger`, etc.)
- `js/app.js` — main wiring (navigation, template picker, watermark lines, settings, preview carousel, export)
- `js/db.js` — IndexedDB wrappers (`TemplateDB`, `CustomerDB`)
- `js/pdfHandler.js` — `loadAsCanvas`, `canvasToBlob`, `overlayOnPdf` (vector PDF overlay via pdf-lib), `downloadBlob`
- `js/watermark.js` — `Watermark.apply` (composite over source) and `Watermark.buildOverlay` (transparent overlay for the vector PDF path)
- `js/ui.js` — overlay show/hide + confirm dialog helpers (`UI.showOverlay`, `UI.hideOverlay`, `UI.confirmDialog`)
- `js/customerImport.js` — CSV/XLSX bulk import

The app is mobile-first (~380px wide), Thai-language UI. There is a Create page and a Setup page, plus a bottom nav. Preserve all existing behavior not mentioned below — especially the vector-PDF overlay export path.

## Current relevant markup/behavior

Settings block in `index.html` (inside `.preview-settings-unit` card):
- Four sliders with ids `columns` (1–8, val 3), `padding` (0–60, val 15), `angle` (0–90, val 45), `opacity` (5–100, val 20). Each row is `.compact-row` with `.compact-label`, `.compact-value` (holds `columnsOut`/`paddingOut`/`angleOut`/`opacityOut`), then the `input[type=range]`.
- A `.style-output-row` containing `#styleToggle` (two `.icon-seg` buttons, `data-style="light"|"dark"`, using ☀/☾ text) and `<select id="outputFormat">` (PDF/JPG).
- In `app.js`, `resetSettings()` currently hardcodes 3/15/45/20/light/pdf. `#cancelBtn` calls `resetSettings()`. There is NO settings-default button yet. (Note: `#defaultLinesBtn` labeled "Default" resets the watermark TEXT lines — leave it alone.)

Watermark text rows: built in `app.js renderLines()`. Each `.line-row` = `.line-label` input + `.line-value` input + optional `.search-icon-btn` (🔍) + `.line-del` (×). In `style.css`, `.line-row` currently has `border-bottom: 1px solid var(--border)` and `.line-row:last-child { border-bottom: none }`.

Templates: `.template-row` (horizontal scroll) holds `.template-item` (flex 0 0 84px) each with `.thumb` (84px tall) and `.name` (10px muted). Create-page picker is `#templatePicker`; header has `<h2>Templates</h2>` + a "Manage in Setup" link. Setup-page manager `#templateList` has a per-item `.settings-btn` (⚙).

Preview carousel: `#previewTrack` holds `.preview-slide` elements, each containing a `<canvas>` rendered by `runPreview()`. Swiping moves between selected templates; `.preview-dots` show position.

Emoji/glyphs currently in use: 🔍 (search, app.js), × (delete lines & customers), ⚙ (template settings, app.js), 🖼️ and ⚙️ (bottom nav `.nav-icon`, index.html), ☀/☾ (style toggle, index.html).

## Changes to implement

### 1. Adjustable settings default + "Set default" button
- Persist a settings default in `localStorage` under key `wm_settings_default` as JSON `{columns, padding, angle, opacity, style, output}`.
- On app load, if that key exists, apply it to the four sliders (and their `*Out` readouts), the style toggle, and `#outputFormat`. If absent, fall back to the current built-in 3/15/45/20/light/pdf.
- Add a **"Set default"** button in the `.style-output-row` (right of the output select). When tapped, save the current control values to `localStorage` and show a brief confirmation via the existing `#statusLine` (e.g. "Default saved").
- Change `resetSettings()` and the `#cancelBtn` reset to restore to the SAVED default (or built-in fallback), not the hardcoded values.

### 2. Long-press preview → zoom popup
- On a `.preview-slide`, a long press (~450ms) opens a full-screen overlay showing an enlarged view of that slide's page. Use pointer events: start a timer on `pointerdown`; cancel if `pointermove` exceeds ~10px (so carousel swipes still work) or on `pointerup`/`pointercancel` before the timer fires.
- The overlay should display the page large (re-render at higher resolution, or scale up the existing slide canvas) with the ability to pinch-zoom / double-tap to zoom on mobile. Close by tapping outside the image or an X button.
- Add the overlay markup (e.g. `#zoomOverlay`) reusing the `.modal-overlay` pattern, plus CSS. Single-tap behavior on slides must remain unchanged.

### 3. Remove separator lines in watermark text section
- Delete the `border-bottom` on `.line-row` (and the `:last-child` override). Keep comfortable vertical spacing between rows without visible dividers.

### 4. Modernize all icons (emoji → inline SVG)
- Replace every emoji/glyph listed above with a consistent inline-SVG stroke icon set (24×24 viewBox, `stroke="currentColor"`, `fill="none"`, `stroke-width="2"`, rounded caps). Use inline SVG — NOT an icon font or CDN dependency (app must work offline).
- Suggested approach: a small `Icons` helper in JS returning SVG strings by name (`search`, `close`, `settings`, `sun`, `moon`, `zoom`, `save`, `tap`), used where buttons are created in `app.js`; and inline SVG directly in `index.html` for the bottom nav (create/setup) and the style toggle. Icons inherit color via `currentColor` so existing color rules keep working.
- Cover: line search, line delete, customer delete, template settings gear, bottom-nav create + setup, style toggle sun/moon, plus new zoom and set-default icons.

### 5. "Tap to choose" hint in Templates section
- Add a small muted hint with a tap icon (e.g. "Tap to choose") under the Templates header on the Create page, so the tap-to-select action is discoverable.

### 6. Larger, clearer template thumbnails (~3 per screen width)
- Resize `.template-item` so about 3 fit across a full mobile screen width with small gaps (~8px). Target item width roughly `calc((100% - 2*gap)/3)` or a fixed ~110px; increase `.thumb` height accordingly (keep image aspect via `object-fit`). Keep horizontal scroll for additional templates beyond 3.
- Make `.name` more visible: larger (~12–13px) and darker (`var(--text)` instead of muted). Keep single-line ellipsis for long Thai filenames.
- Apply the larger sizing to both the Create picker and the Setup manager.

## Constraints
- No build tools, no frameworks, no new CDN runtime deps (pdf-lib etc. already present are fine).
- Preserve Thai rendering, IndexedDB storage, the vector-PDF overlay export, and the preview carousel.
- Mobile-first; verify layout holds at ~360–414px widths.
- After changes, all JS files must pass `node --check`.

Please make the edits directly in the files and summarize what changed per item.
