// Handles loading a PDF/image template into a source canvas, and exporting
// a processed canvas back out as PDF or JPG.
const PdfHandler = (() => {

  // Render page 1 of a PDF blob (or an image blob) to an offscreen canvas.
  async function loadAsCanvas(blob, type, targetDpi = 200) {
    if (type === "pdf") {
      const arrayBuffer = await blob.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const scale = targetDpi / 72; // pdf.js viewport is at 72dpi base
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas;
    } else {
      const img = await blobToImage(blob);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return canvas;
    }
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  // Export a finished canvas as a downloadable Blob for the given format.
  function canvasToBlob(canvas, format) {
    return new Promise((resolve) => {
      if (format === "jpg") {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
      } else {
        const { jsPDF } = window.jspdf;
        const orientation = canvas.width >= canvas.height ? "l" : "p";
        const pdf = new jsPDF({
          orientation,
          unit: "pt",
          format: [canvas.width, canvas.height]
        });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(dataUrl, "JPEG", 0, 0, canvas.width, canvas.height);
        resolve(pdf.output("blob"));
      }
    });
  }

  // Overlay the watermark on the ORIGINAL pdf as a transparent layer, keeping
  // the underlying page content as vectors (selectable text, small file, crisp).
  // opts: { text, columns, paddingRatio, angleDeg, opacity, style }
  async function overlayOnPdf(blob, opts) {
    const { PDFDocument } = window.PDFLib;
    const bytes = await blob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const RENDER_SCALE = 2; // ~144 DPI overlay render for crisp watermark text

    for (const page of pdfDoc.getPages()) {
      const { width, height } = page.getSize();
      const W = Math.max(1, Math.round(width * RENDER_SCALE));
      const H = Math.max(1, Math.round(height * RENDER_SCALE));
      const overlay = await Watermark.buildOverlay(W, H, opts);
      const png = await pdfDoc.embedPng(overlay.toDataURL("image/png"));
      page.drawImage(png, { x: 0, y: 0, width, height });
    }

    const out = await pdfDoc.save();
    return new Blob([out], { type: "application/pdf" });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { loadAsCanvas, canvasToBlob, overlayOnPdf, downloadBlob };
})();
