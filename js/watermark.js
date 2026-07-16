// Ported from the desktop app's watermark_image_as_overlay (PyMuPDF/Pillow) to
// canvas 2D. Produces a new canvas with the tiled, rotated watermark composited
// over the source template.
const Watermark = (() => {

  const FONT_FAMILY = "Noto Sans Thai";

  const STYLE_PRESETS = {
    light: { text: "rgba(50,50,50,1)", bg: "255,255,255", bgAlpha: 51 / 255, border: "rgba(153,153,153,1)" },
    dark:  { text: "rgba(240,240,240,1)", bg: "0,0,0", bgAlpha: 90 / 255, border: "rgba(200,200,200,1)" }
  };

  async function ensureFontLoaded(size) {
    try {
      await document.fonts.load(`${size}px "${FONT_FAMILY}"`);
      await document.fonts.ready;
    } catch (e) { /* fall back silently to system font */ }
  }

  function splitLines(text) {
    return text.split("\n");
  }

  function measureMultiline(ctx, lines, font, lineSpacingRatio = 0.2) {
    ctx.font = font;
    let maxWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxWidth) maxWidth = w;
    }
    const fontSize = parseInt(font, 10);
    const lineHeight = fontSize * (1 + lineSpacingRatio);
    const totalHeight = lineHeight * lines.length;
    return { width: maxWidth, height: totalHeight, lineHeight };
  }

  function drawMultilineCentered(ctx, lines, font, color, cx, cy, lineHeight) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const totalHeight = lineHeight * lines.length;
    let y = cy - totalHeight / 2 + lineHeight / 2;
    for (const line of lines) {
      ctx.fillText(line, cx, y);
      y += lineHeight;
    }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draw one tile (rounded rect bg + border + centered multiline text), auto
  // font-sized so the tile's box width matches targetBoxWidth. Shared by the
  // tiled and single-placement paths below.
  async function buildTile(text, targetBoxWidth, style) {
    const preset = STYLE_PRESETS[style] || STYLE_PRESETS.light;
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d");

    // Step 1: estimate font size against a placeholder string sized to columns.
    const testFontSize = 30;
    await ensureFontLoaded(testFontSize);
    const lines = splitLines(text);
    const testLines = lines.map(l => {
      const idx = l.indexOf(":");
      const label = idx >= 0 ? l.slice(0, idx + 1) : l;
      return `${label} XXXXXXXXXXXXXXX`;
    });
    const testFont = `${testFontSize}px "${FONT_FAMILY}"`;
    const testMeasure = measureMultiline(mctx, testLines, testFont);
    const testBoxW = testMeasure.width + testFontSize;
    const ratio = testBoxW > 0 ? targetBoxWidth / testBoxW : 1;
    const fontSize = Math.max(8, Math.round(testFontSize * ratio));

    // Step 2: measure actual text at computed font size.
    await ensureFontLoaded(fontSize);
    const font = `${fontSize}px "${FONT_FAMILY}"`;
    const measure = measureMultiline(mctx, lines, font);

    const padding = fontSize;
    const boxWidth = Math.ceil(measure.width + padding);
    const boxHeight = Math.ceil(measure.height + padding);

    // Step 3: draw one tile (rounded rect bg + border + centered text).
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = boxWidth;
    tileCanvas.height = boxHeight;
    const tctx = tileCanvas.getContext("2d");
    tctx.save();
    roundRectPath(tctx, 1, 1, boxWidth - 2, boxHeight - 2, 10);
    tctx.fillStyle = `rgba(${preset.bg},${preset.bgAlpha})`;
    tctx.fill();
    tctx.lineWidth = 2;
    tctx.strokeStyle = preset.border;
    tctx.stroke();
    tctx.restore();
    drawMultilineCentered(tctx, lines, font, preset.text, boxWidth / 2, boxHeight / 2, measure.lineHeight);

    return { tileCanvas, boxWidth, boxHeight };
  }

  // Build the rotated, tiled watermark pattern for a W×H page (mode: "tiled").
  // Returns { rotatedCanvas, pasteX, pasteY } — no source, no opacity applied.
  async function buildRotatedOverlay(W, H, opts) {
    const { text, columns, paddingRatio, angleDeg, style } = opts;

    const totalColumnRatio = columns * (1 + paddingRatio);
    const targetBoxWidth = totalColumnRatio > 0 ? W / totalColumnRatio : W;

    const { tileCanvas, boxWidth, boxHeight } = await buildTile(text, targetBoxWidth, style);

    // Step 4: tile across a canvas big enough to cover the rotated bounds.
    const angleRad = angleDeg * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const tilingW = Math.ceil(W * cosA + H * sinA);
    const tilingH = Math.ceil(H * cosA + W * sinA);

    const tilingCanvas = document.createElement("canvas");
    tilingCanvas.width = tilingW;
    tilingCanvas.height = tilingH;
    const tilCtx = tilingCanvas.getContext("2d");

    const uniformPadding = Math.round(boxWidth * paddingRatio);
    const stepX = boxWidth + uniformPadding;
    const stepY = boxHeight + uniformPadding;

    for (let y = 0; y < tilingH; y += stepY) {
      for (let x = 0; x < tilingW; x += stepX) {
        tilCtx.drawImage(tileCanvas, x, y);
      }
    }

    // Step 5: rotate the tiled canvas (expand-to-fit, like PIL's rotate(expand=True)).
    const rotBoundW = Math.ceil(tilingW * cosA + tilingH * sinA);
    const rotBoundH = Math.ceil(tilingH * cosA + tilingW * sinA);
    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = rotBoundW;
    rotatedCanvas.height = rotBoundH;
    const rotCtx = rotatedCanvas.getContext("2d");
    rotCtx.translate(rotBoundW / 2, rotBoundH / 2);
    rotCtx.rotate(angleRad);
    rotCtx.drawImage(tilingCanvas, -tilingW / 2, -tilingH / 2);

    const pasteX = (W - rotBoundW) / 2;
    const pasteY = (H - rotBoundH) / 2;
    return { rotatedCanvas, pasteX, pasteY };
  }

  // Anchor a w×h box within a W×H page at one of the 9 grid positions, with
  // a small margin from the page edges for every anchor except center.
  function anchorPosition(position, W, H, w, h, margin) {
    let x, y;
    switch (position) {
      case "top-left": x = margin; y = margin; break;
      case "top-center": x = (W - w) / 2; y = margin; break;
      case "top-right": x = W - w - margin; y = margin; break;
      case "middle-left": x = margin; y = (H - h) / 2; break;
      case "middle-right": x = W - w - margin; y = (H - h) / 2; break;
      case "bottom-left": x = margin; y = H - h - margin; break;
      case "bottom-center": x = (W - w) / 2; y = H - h - margin; break;
      case "bottom-right": x = W - w - margin; y = H - h - margin; break;
      case "center":
      default:
        x = (W - w) / 2; y = (H - h) / 2;
    }
    return { pasteX: x, pasteY: y };
  }

  // Build a single rotated watermark stamp for a W×H page (mode: "single"),
  // sized to ~opts.size% of the page width and placed at opts.position.
  async function buildSingleOverlay(W, H, opts) {
    const { text, size, angleDeg, style, position } = opts;
    const targetBoxWidth = W * ((size || 40) / 100);
    const { tileCanvas, boxWidth, boxHeight } = await buildTile(text, targetBoxWidth, style);

    const angleRad = angleDeg * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const rotW = Math.ceil(boxWidth * cosA + boxHeight * sinA);
    const rotH = Math.ceil(boxHeight * cosA + boxWidth * sinA);
    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = rotW;
    rotatedCanvas.height = rotH;
    const rotCtx = rotatedCanvas.getContext("2d");
    rotCtx.translate(rotW / 2, rotH / 2);
    rotCtx.rotate(angleRad);
    rotCtx.drawImage(tileCanvas, -boxWidth / 2, -boxHeight / 2);

    const margin = Math.round(Math.min(W, H) * 0.04);
    const { pasteX, pasteY } = anchorPosition(position || "center", W, H, rotW, rotH, margin);
    return { rotatedCanvas, pasteX, pasteY };
  }

  // Dispatches to the tiled or single-placement builder based on opts.mode
  // (defaults to tiled when unset, preserving prior behavior).
  function buildOverlayForMode(W, H, opts) {
    return opts.mode === "single" ? buildSingleOverlay(W, H, opts) : buildRotatedOverlay(W, H, opts);
  }

  // Composite the watermark over an existing source canvas (image path / preview).
  async function apply(sourceCanvas, opts) {
    const W = sourceCanvas.width;
    const H = sourceCanvas.height;
    const { rotatedCanvas, pasteX, pasteY } = await buildOverlayForMode(W, H, opts);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = W;
    outCanvas.height = H;
    const outCtx = outCanvas.getContext("2d");
    outCtx.drawImage(sourceCanvas, 0, 0);
    outCtx.save();
    outCtx.globalAlpha = opts.opacity;
    outCtx.drawImage(rotatedCanvas, pasteX, pasteY);
    outCtx.restore();
    return outCanvas;
  }

  // Build a transparent W×H overlay (opacity baked in) for compositing onto a
  // vector PDF page as a PNG. No source drawn.
  async function buildOverlay(W, H, opts) {
    const { rotatedCanvas, pasteX, pasteY } = await buildOverlayForMode(W, H, opts);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = opts.opacity;
    ctx.drawImage(rotatedCanvas, pasteX, pasteY);
    return canvas;
  }

  return { apply, buildOverlay, STYLE_PRESETS };
})();
