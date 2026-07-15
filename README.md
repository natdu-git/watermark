# Add Watermark

A mobile-first web app for stamping watermarks (shop name, license number, receipt number, date) onto PDF/image documents — a browser-based rebuild of the original desktop `watermarker.py` tool, designed for one-handed phone use.

Live app: https://natdu-git.github.io/watermark/

## What it does

- Upload document templates (PDF or image) once, reuse them anytime.
- Fill in watermark text — shop name, license number, receipt number, date — with a live preview that updates as you type or adjust settings.
- Search a saved customer list (by shop name or license number) to autofill fields instead of retyping, or type a new customer and get prompted to save it after creating the file.
- Apply the watermark to one or many templates at once; multiple outputs are bundled into a .zip download.
- Everything (templates, customer list) is stored locally in the browser (IndexedDB) — nothing is uploaded to a server.

## Using the app

### Create page
1. **Templates** — tap the templates you want to watermark (multi-select, swipe to see more).
2. **Watermark Text** — edit the default lines (shop name, license number, receipt number, date) or add/remove lines. Use the search icon next to the shop name or license number fields to pull in a saved customer. Tap **Default** to reset the lines back to the original four.
3. **Preview** — updates automatically as you type or move the sliders below it. If more than one template is selected, swipe the preview to check each one.
4. **Settings** — columns, padding, angle, opacity, light/dark watermark style, and output format (PDF or JPG).
5. Tap **Create File(s)** to generate and download. If the typed customer isn't already saved, you'll be asked whether to save it for next time.

### Setup page
- **Templates** — upload new PDF/image templates, or tap the gear icon on an existing one to rename or delete it.
- **Customers** — browse/search the saved customer list, delete entries, or bulk-import via CSV/Excel (columns: `ชื่อร้านค้า`, `เลขที่ใบอนุญาติ`). Download a blank template first if you need the right column headers. Rows that conflict with an existing customer are flagged for you to keep, overwrite, or add anyway.

All deletions (templates, customers) ask for confirmation first.

## Project structure

```
webapp/
├── index.html            Page markup (Create + Setup pages, modals, bottom nav)
├── manifest.json          PWA manifest (installable to home screen)
├── css/
│   └── style.css          All styling
└── js/
    ├── db.js               IndexedDB wrapper (templates + customers)
    ├── customerImport.js   CSV/Excel parsing + blank template download (SheetJS)
    ├── pdfHandler.js       Renders PDF/image templates to canvas; exports canvas to PDF/JPG (pdf.js + jsPDF)
    ├── watermark.js        Core watermark tiling/rotation/opacity logic (canvas port of the original Python algorithm)
    ├── ui.js                Shared confirm-dialog / modal helpers
    └── app.js               Main app wiring: navigation, state, previews, export
```

## Tech stack

Fully static, client-side only — no backend or build step. Runs on GitHub Pages.

- [pdf.js](https://mozilla.github.io/pdf.js/) — renders PDF templates to canvas
- [jsPDF](https://github.com/parallax/jsPDF) — exports the watermarked canvas back to PDF
- [JSZip](https://stuk.github.io/jszip/) — bundles multiple outputs into a .zip
- [SheetJS (xlsx)](https://sheetjs.com/) — parses CSV/Excel bulk customer uploads
- [Noto Sans Thai](https://fonts.google.com/noto/specimen/Noto+Sans+Thai) (Google Fonts) — Thai + Latin text rendering

## Data & privacy

Templates and the customer list are stored only in the browser's IndexedDB, per device. Nothing is sent to a server. Clearing browser data/cache on the device will remove this data, so avoid clearing site data if you want to keep your templates and customer list.

## Deploying changes

This repo is served via GitHub Pages from the `main` branch root. After editing files locally, re-upload the changed files (or the whole folder) through GitHub's web upload or `git push`, then allow a minute for Pages to redeploy. Use a hard refresh or incognito tab on mobile to bypass browser cache when checking updates.
