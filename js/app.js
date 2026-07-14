// Main app wiring: template library, inputs, settings, preview, export.
(() => {
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                       "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

  const state = {
    templates: [],       // [{id, name, type, blob}]
    selectedIds: new Set(),
    currentStyle: "light"
  };

  const el = (id) => document.getElementById(id);
  const templateListEl = el("templateList");
  const statusLine = el("statusLine");
  const previewCanvas = el("previewCanvas");
  const previewHint = el("previewHint");

  function setStatus(msg) {
    statusLine.textContent = msg || "";
  }

  function inferType(filename) {
    return /\.pdf$/i.test(filename) ? "pdf" : "image";
  }

  // ---------- Template Library ----------

  async function refreshTemplateList() {
    state.templates = await TemplateDB.getAll();
    templateListEl.innerHTML = "";

    if (state.templates.length === 0) {
      templateListEl.innerHTML = '<p class="empty-hint">No templates yet. Tap "+ Upload" to add PDF or image templates. They\'ll stay saved on this device.</p>';
      return;
    }

    for (const tpl of state.templates) {
      const item = document.createElement("div");
      item.className = "template-item" + (state.selectedIds.has(tpl.id) ? " selected" : "");
      item.dataset.id = tpl.id;

      const thumb = document.createElement("img");
      thumb.className = "thumb";
      renderThumb(tpl).then((src) => { thumb.src = src; }).catch(() => {});

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = tpl.name;

      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await TemplateDB.deleteTemplate(tpl.id);
        state.selectedIds.delete(tpl.id);
        await refreshTemplateList();
      });

      item.appendChild(thumb);
      item.appendChild(name);
      item.appendChild(delBtn);

      item.addEventListener("click", () => {
        if (state.selectedIds.has(tpl.id)) {
          state.selectedIds.delete(tpl.id);
        } else {
          state.selectedIds.add(tpl.id);
        }
        item.classList.toggle("selected");
      });

      templateListEl.appendChild(item);
    }
  }

  const thumbCache = new Map();
  async function renderThumb(tpl) {
    if (thumbCache.has(tpl.id)) return thumbCache.get(tpl.id);
    const canvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 40);
    const url = canvas.toDataURL("image/jpeg", 0.7);
    thumbCache.set(tpl.id, url);
    return url;
  }

  el("uploadBtn").addEventListener("click", () => el("fileInput").click());

  el("fileInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setStatus("Saving templates...");
    for (const file of files) {
      await TemplateDB.addTemplate({ name: file.name, type: inferType(file.name), blob: file });
    }
    e.target.value = "";
    await refreshTemplateList();
    setStatus("");
  });

  // ---------- Inputs / Settings ----------

  function toThaiDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return "";
    return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
  }

  function buildWatermarkText() {
    const l1 = el("label1").value, v1 = el("value1").value;
    const l2 = el("label2").value, v2 = el("value2").value;
    const l3 = el("label3").value, v3 = el("value3").value;
    const l4 = el("label4").value, v4 = toThaiDate(el("dateValue").value);
    return `${l1}: ${v1}\n${l2}: ${v2}\n${l3}: ${v3}\n${l4}: ${v4}`;
  }

  function readSettings() {
    return {
      columns: parseInt(el("columns").value, 10),
      paddingRatio: parseInt(el("padding").value, 10) / 100,
      angleDeg: parseInt(el("angle").value, 10),
      opacity: parseInt(el("opacity").value, 10) / 100,
      style: state.currentStyle
    };
  }

  [["columns", "columnsOut"], ["padding", "paddingOut"], ["angle", "angleOut"], ["opacity", "opacityOut"]]
    .forEach(([sliderId, outId]) => {
      const slider = el(sliderId);
      const out = el(outId);
      slider.addEventListener("input", () => { out.textContent = slider.value; });
    });

  document.querySelectorAll("#styleToggle .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#styleToggle .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentStyle = btn.dataset.style;
    });
  });

  // default date = today
  el("dateValue").value = new Date().toISOString().slice(0, 10);

  // ---------- Preview ----------

  function firstSelectedTemplate() {
    if (state.selectedIds.size === 0) return null;
    const id = Array.from(state.selectedIds)[0];
    return state.templates.find(t => t.id === id) || null;
  }

  el("previewBtn").addEventListener("click", async () => {
    const tpl = firstSelectedTemplate();
    if (!tpl) {
      setStatus("Select a template first.");
      return;
    }
    setStatus("Generating preview...");
    try {
      const srcCanvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 150);
      const text = buildWatermarkText();
      const settings = readSettings();
      const result = await Watermark.apply(srcCanvas, { text, ...settings });
      previewCanvas.width = result.width;
      previewCanvas.height = result.height;
      previewCanvas.getContext("2d").drawImage(result, 0, 0);
      previewCanvas.classList.add("visible");
      previewHint.style.display = "none";
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  });

  // ---------- Create / Export ----------

  function safeFilenamePart(str) {
    return (str || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-ก-๙]/g, "");
  }

  function buildBaseFilename() {
    const order = safeFilenamePart(el("value3").value);
    const name = safeFilenamePart(el("value1").value);
    if (order && name) return `${order}_${name}`;
    if (order || name) return order || name;
    return `watermarked_${new Date().toISOString().slice(0, 10)}`;
  }

  el("createBtn").addEventListener("click", async () => {
    if (state.selectedIds.size === 0) {
      setStatus("Select at least one template first.");
      return;
    }
    if (!el("value1").value || !el("value2").value || !el("value3").value || !el("dateValue").value) {
      setStatus("Please fill in all value fields first.");
      return;
    }

    const selected = state.templates.filter(t => state.selectedIds.has(t.id));
    const text = buildWatermarkText();
    const settings = readSettings();
    const format = el("outputFormat").value;
    const baseFilename = buildBaseFilename();

    setStatus(`Creating ${selected.length} file(s)...`);
    try {
      const outputs = [];
      for (let i = 0; i < selected.length; i++) {
        const tpl = selected[i];
        setStatus(`Processing ${i + 1}/${selected.length}: ${tpl.name}`);
        const srcCanvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 300);
        const result = await Watermark.apply(srcCanvas, { text, ...settings });
        const blob = await PdfHandler.canvasToBlob(result, format);
        const suffix = selected.length > 1 ? `_${safeFilenamePart(tpl.name.replace(/\.[^.]+$/, ""))}` : "";
        outputs.push({ blob, filename: `${baseFilename}${suffix}.${format === "pdf" ? "pdf" : "jpg"}` });
      }

      if (outputs.length === 1) {
        PdfHandler.downloadBlob(outputs[0].blob, outputs[0].filename);
      } else {
        setStatus("Zipping files...");
        const zip = new JSZip();
        outputs.forEach(o => zip.file(o.filename, o.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        PdfHandler.downloadBlob(zipBlob, `${baseFilename}_watermarked.zip`);
      }
      setStatus(`Done — ${outputs.length} file(s) saved.`);
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  });

  // ---------- Init ----------
  refreshTemplateList();
})();
