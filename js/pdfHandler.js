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

  return { loadAsCanvas, canvasToBlob, downloadBlob };
})();
