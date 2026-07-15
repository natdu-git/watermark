// Main app wiring: navigation, template library, dynamic watermark lines,
// inline customer search, live multi-template preview carousel, settings,
// export, and post-create save-customer prompt.
(() => {
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                       "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

  const el = (id) => document.getElementById(id);

  const Icons = {
    search: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    close: '<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    settings: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/></svg>'
  };

  function defaultLines() {
    return [
      { id: "shop",    role: "shop",    label: "ชื่อร้านค้า/บริษัท",     value: "", type: "text" },
      { id: "license", role: "license", label: "เลขที่ใบอนุญาติ",        value: "", type: "text" },
      { id: "order",   role: "order",   label: "เลขที่ใบเสร็จรับเงิน",  value: "", type: "text" },
      { id: "date",    role: "date",    label: "สั่งซื้อวันที่",         value: new Date().toISOString().slice(0, 10), type: "date" }
    ];
  }

  const state = {
    templates: [],
    selectedTemplateIds: new Set(),
    currentStyle: "light",
    lines: defaultLines(),
    nextLineId: 1,
    customers: [],
    conflictQueue: [],
    previewTimer: null,
    previewIndex: 0
  };

  // ---------- Navigation ----------

  function showPage(name) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    el(name === "create" ? "pageCreate" : "pageSetup").classList.add("active");
    document.querySelectorAll(`.nav-btn[data-nav="${name}"]`).forEach(b => b.classList.add("active"));
    if (name === "setup") refreshCustomerList();
  }

  document.querySelectorAll("[data-nav]").forEach(elm => {
    elm.addEventListener("click", () => showPage(elm.dataset.nav));
  });

  // ---------- Template library (Create picker + Setup manager) ----------

  const thumbCache = new Map();
  const THUMB_MAX_IMAGE_DIM = 200;

  // Decoded preview-resolution source canvas per template id, so dragging a
  // settings slider re-runs Watermark.apply() on an already-decoded canvas
  // instead of re-rendering the PDF/image from scratch every time.
  const PREVIEW_SOURCE_DPI = 150;
  const previewSourceCache = new Map();
  async function getPreviewSourceCanvas(tpl) {
    if (previewSourceCache.has(tpl.id)) return previewSourceCache.get(tpl.id);
    const canvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, PREVIEW_SOURCE_DPI);
    previewSourceCache.set(tpl.id, canvas);
    return canvas;
  }
  async function renderThumb(tpl) {
    if (thumbCache.has(tpl.id)) return thumbCache.get(tpl.id);
    const canvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 40, THUMB_MAX_IMAGE_DIM);
    const url = canvas.toDataURL("image/jpeg", 0.7);
    thumbCache.set(tpl.id, url);
    return url;
  }

  async function refreshTemplates() {
    state.templates = await TemplateDB.getAll();
    renderTemplatePicker();
    renderTemplateManager();
  }

  function renderTemplatePicker() {
    const container = el("templatePicker");
    container.innerHTML = "";
    if (state.templates.length === 0) {
      container.innerHTML = '<p class="empty-hint">No templates yet. Go to Setup to upload some.</p>';
      return;
    }
    for (const tpl of state.templates) {
      const item = document.createElement("div");
      item.className = "template-item" + (state.selectedTemplateIds.has(tpl.id) ? " selected" : "");
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      renderThumb(tpl).then(src => { thumb.src = src; }).catch(() => {});
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = tpl.name;
      item.appendChild(thumb);
      item.appendChild(name);
      item.addEventListener("click", () => {
        if (state.selectedTemplateIds.has(tpl.id)) state.selectedTemplateIds.delete(tpl.id);
        else state.selectedTemplateIds.add(tpl.id);
        item.classList.toggle("selected");
        schedulePreview();
      });
      container.appendChild(item);
    }
  }

  function renderTemplateManager() {
    const container = el("templateList");
    container.innerHTML = "";
    if (state.templates.length === 0) {
      container.innerHTML = '<p class="empty-hint">No templates yet. Tap "+ Upload" to add PDF or image templates. They\'ll stay saved on this device.</p>';
      return;
    }
    for (const tpl of state.templates) {
      const item = document.createElement("div");
      item.className = "template-item";
      const thumb = document.createElement("img");
      thumb.className = "thumb";
      renderThumb(tpl).then(src => { thumb.src = src; }).catch(() => {});
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = tpl.name;
      const settingsBtn = document.createElement("button");
      settingsBtn.className = "settings-btn";
      settingsBtn.innerHTML = Icons.settings;
      settingsBtn.title = "Template settings";
      settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTemplateSettings(tpl);
      });
      item.appendChild(thumb);
      item.appendChild(name);
      item.appendChild(settingsBtn);
      container.appendChild(item);
    }
  }

  // Downscale a large photo before storing it: if the longest edge exceeds
  // maxDim, redraw it to a scaled canvas and re-encode as JPEG. Keeps
  // IndexedDB storage lean and preview/export fast. Falls back to the
  // original file on any decode error.
  const IMPORT_MAX_IMAGE_DIM = 2000;
  const IMPORT_JPEG_QUALITY = 0.9;

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  async function downscaleImageIfNeeded(file, maxDim = IMPORT_MAX_IMAGE_DIM, quality = IMPORT_JPEG_QUALITY) {
    try {
      const img = await loadImageFromFile(file);
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest <= maxDim) return file;
      const scale = maxDim / longest;
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
      return blob || file;
    } catch (err) {
      console.warn("Image downscale failed, storing original:", err);
      return file;
    }
  }

  function setUploadStatus(msg) {
    const line = el("templateUploadStatus");
    line.textContent = msg || "";
    line.style.display = msg ? "block" : "none";
  }

  el("uploadBtn").addEventListener("click", () => el("fileInput").click());
  el("fileInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      setUploadStatus(`Adding ${i + 1}/${files.length}: ${file.name}`);
      const blob = isPdf ? file : await downscaleImageIfNeeded(file);
      await TemplateDB.addTemplate({
        name: file.name,
        type: isPdf ? "pdf" : "image",
        blob
      });
    }
    e.target.value = "";
    setUploadStatus("");
    await refreshTemplates();
  });

  // ---------- Template settings popup (rename / metadata / delete) ----------

  let activeTemplateForSettings = null;

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function imageTypeLabel(blob, name) {
    if (blob.type === "image/jpeg") return "JPEG";
    if (blob.type === "image/png") return "PNG";
    if (blob.type === "image/webp") return "WEBP";
    const ext = (name.split(".").pop() || "").toUpperCase();
    return ext || "Image";
  }

  // Computed on-demand from the stored blob (no DB migration needed).
  async function computeTemplateMetadata(tpl) {
    const blob = tpl.blob;
    const size = formatFileSize(blob.size);
    if (tpl.type === "pdf") {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        return {
          type: `PDF · ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`,
          dims: `${Math.round(viewport.width)} × ${Math.round(viewport.height)}`,
          size
        };
      } catch (err) {
        console.error(err);
        return { type: "PDF", dims: "—", size };
      }
    } else {
      try {
        const img = await loadImageFromFile(blob);
        return {
          type: imageTypeLabel(blob, tpl.name),
          dims: `${img.naturalWidth} × ${img.naturalHeight}`,
          size
        };
      } catch (err) {
        console.error(err);
        return { type: imageTypeLabel(blob, tpl.name), dims: "—", size };
      }
    }
  }

  async function openTemplateSettings(tpl) {
    activeTemplateForSettings = tpl;
    el("templateNameInput").value = tpl.name;
    el("templateMetaType").textContent = "…";
    el("templateMetaDims").textContent = "…";
    el("templateMetaSize").textContent = "…";
    UI.showOverlay("templateSettingsOverlay");

    try {
      const meta = await computeTemplateMetadata(tpl);
      if (activeTemplateForSettings !== tpl) return; // popup moved on / closed
      el("templateMetaType").textContent = meta.type;
      el("templateMetaDims").textContent = meta.dims;
      el("templateMetaSize").textContent = meta.size;
    } catch (err) {
      console.error(err);
    }
  }

  el("templateCloseBtn").addEventListener("click", () => UI.hideOverlay("templateSettingsOverlay"));
  el("templateSettingsOverlay").addEventListener("click", (e) => {
    if (e.target.id === "templateSettingsOverlay") UI.hideOverlay("templateSettingsOverlay");
  });

  el("templateSaveBtn").addEventListener("click", async () => {
    if (!activeTemplateForSettings) return;
    const newName = el("templateNameInput").value.trim();
    if (!newName) return;
    await TemplateDB.renameTemplate(activeTemplateForSettings.id, newName);
    UI.hideOverlay("templateSettingsOverlay");
    thumbCache.delete(activeTemplateForSettings.id);
    await refreshTemplates();
  });

  el("templateDeleteBtn").addEventListener("click", async () => {
    if (!activeTemplateForSettings) return;
    UI.hideOverlay("templateSettingsOverlay");
    const ok = await UI.confirmDialog(`Delete "${activeTemplateForSettings.name}"? This can't be undone.`);
    if (!ok) return;
    await TemplateDB.deleteTemplate(activeTemplateForSettings.id);
    state.selectedTemplateIds.delete(activeTemplateForSettings.id);
    thumbCache.delete(activeTemplateForSettings.id);
    previewSourceCache.delete(activeTemplateForSettings.id);
    await refreshTemplates();
    schedulePreview();
  });

  // ---------- Dynamic watermark lines ----------

  function renderLines() {
    const container = el("linesContainer");
    container.innerHTML = "";
    state.lines.forEach((line) => {
      const row = document.createElement("div");
      row.className = "line-row";

      const labelInput = document.createElement("input");
      labelInput.className = "line-label";
      labelInput.value = line.label;
      labelInput.addEventListener("input", () => { line.label = labelInput.value; schedulePreview(); });
      row.appendChild(labelInput);

      const valueInput = document.createElement("input");
      valueInput.className = "line-value";
      valueInput.type = line.type === "date" ? "date" : "text";
      valueInput.value = line.value;
      valueInput.addEventListener("input", () => { line.value = valueInput.value; schedulePreview(); });
      if (line.role === "shop") line.shopInputRef = valueInput;
      if (line.role === "license") line.licenseInputRef = valueInput;
      row.appendChild(valueInput);

      if (line.role === "shop" || line.role === "license") {
        const searchBtn = document.createElement("button");
        searchBtn.className = "search-icon-btn";
        searchBtn.innerHTML = Icons.search;
        searchBtn.title = "Search customers";
        searchBtn.addEventListener("click", () => openCustomerSearch());
        row.appendChild(searchBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "line-del";
      delBtn.innerHTML = Icons.close;
      delBtn.disabled = state.lines.length <= 1;
      delBtn.addEventListener("click", () => {
        if (state.lines.length <= 1) return;
        state.lines = state.lines.filter(l => l.id !== line.id);
        renderLines();
        schedulePreview();
      });
      row.appendChild(delBtn);

      container.appendChild(row);
    });
  }

  el("addLineBtn").addEventListener("click", () => {
    state.lines.push({ id: `custom-${state.nextLineId++}`, role: "custom", label: "", value: "", type: "text" });
    renderLines();
  });

  el("defaultLinesBtn").addEventListener("click", () => {
    state.lines = defaultLines();
    renderLines();
    schedulePreview();
  });

  function setCustomerFields(shopName, licenseNumber) {
    const shopLine = state.lines.find(l => l.role === "shop");
    const licenseLine = state.lines.find(l => l.role === "license");
    if (shopLine) { shopLine.value = shopName; if (shopLine.shopInputRef) shopLine.shopInputRef.value = shopName; }
    if (licenseLine) { licenseLine.value = licenseNumber; if (licenseLine.licenseInputRef) licenseLine.licenseInputRef.value = licenseNumber; }
  }

  function toThaiDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return "";
    return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
  }

  function buildWatermarkText() {
    return state.lines
      .map(l => `${l.label}: ${l.type === "date" ? toThaiDate(l.value) : l.value}`)
      .join("\n");
  }

  // ---------- Customer search (inline, opened from search icons) ----------

  async function loadCustomers() {
    state.customers = await CustomerDB.getAll();
  }

  function openCustomerSearch() {
    const shopLine = state.lines.find(l => l.role === "shop");
    const input = el("searchOverlayInput");
    input.value = shopLine ? shopLine.value : "";
    renderSearchOverlayResults(input.value);
    UI.showOverlay("searchOverlay");
    input.focus();
  }

  function renderSearchOverlayResults(query) {
    const q = query.trim().toLowerCase();
    const list = q
      ? state.customers.filter(c => c.shopName.toLowerCase().includes(q) || c.licenseNumber.toLowerCase().includes(q))
      : state.customers;
    const container = el("searchOverlayResults");
    container.innerHTML = "";
    for (const c of list.slice(0, 30)) {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.innerHTML = `<div class="s-name">${c.shopName}</div><div class="s-license">${c.licenseNumber}</div>`;
      item.addEventListener("click", () => {
        setCustomerFields(c.shopName, c.licenseNumber);
        UI.hideOverlay("searchOverlay");
        schedulePreview();
      });
      container.appendChild(item);
    }
  }

  el("searchOverlayInput").addEventListener("input", (e) => renderSearchOverlayResults(e.target.value));
  el("searchOverlayCloseBtn").addEventListener("click", () => UI.hideOverlay("searchOverlay"));

  // ---------- Post-create save-customer prompt ----------

  function requestSaveCustomerIfNew() {
    return new Promise((resolve) => {
      const shopLine = state.lines.find(l => l.role === "shop");
      const licenseLine = state.lines.find(l => l.role === "license");
      const shopName = shopLine ? shopLine.value.trim() : "";
      const licenseNumber = licenseLine ? licenseLine.value.trim() : "";

      if (!shopName || !licenseNumber) { resolve(); return; }

      CustomerDB.findDuplicate(shopName, licenseNumber).then((existing) => {
        if (existing) { resolve(); return; }

        el("saveCustomerMessage").textContent = `Save "${shopName}" (${licenseNumber}) as a customer for next time?`;
        UI.showOverlay("saveCustomerOverlay");

        function cleanup() {
          UI.hideOverlay("saveCustomerOverlay");
          skipBtn.removeEventListener("click", onSkip);
          saveBtn.removeEventListener("click", onSave);
          resolve();
        }
        const skipBtn = el("skipSaveCustomerBtn");
        const saveBtn = el("confirmSaveCustomerBtn");
        function onSkip() { cleanup(); }
        async function onSave() {
          await CustomerDB.add({ shopName, licenseNumber });
          await loadCustomers();
          cleanup();
        }
        skipBtn.addEventListener("click", onSkip);
        saveBtn.addEventListener("click", onSave);
      });
    });
  }

  // ---------- Setup: customer list management ----------

  async function refreshCustomerList() {
    await loadCustomers();
    const q = el("customerListSearch").value.trim().toLowerCase();
    const list = q
      ? state.customers.filter(c => c.shopName.toLowerCase().includes(q) || c.licenseNumber.toLowerCase().includes(q))
      : state.customers;

    const container = el("customerList");
    container.innerHTML = "";
    if (list.length === 0) {
      container.innerHTML = '<p class="empty-hint">No customers saved yet.</p>';
      return;
    }
    for (const c of list) {
      const row = document.createElement("div");
      row.className = "customer-row";
      row.innerHTML = `
        <div><div class="c-name">${c.shopName}</div><div class="c-license">${c.licenseNumber}</div></div>
        <div class="c-actions"><button class="del" title="Delete">${Icons.close}</button></div>
      `;
      row.querySelector(".del").addEventListener("click", async () => {
        const ok = await UI.confirmDialog(`Delete customer "${c.shopName}"?`);
        if (!ok) return;
        await CustomerDB.deleteCustomer(c.id);
        await refreshCustomerList();
      });
      container.appendChild(row);
    }
  }

  el("customerListSearch").addEventListener("input", refreshCustomerList);

  // ---------- Bulk import (guided "Import customers" popup) ----------

  el("importCustomersBtn").addEventListener("click", () => UI.showOverlay("importCustomersOverlay"));
  el("importCustomersCloseBtn").addEventListener("click", () => UI.hideOverlay("importCustomersOverlay"));
  el("importCustomersOverlay").addEventListener("click", (e) => {
    if (e.target.id === "importCustomersOverlay") UI.hideOverlay("importCustomersOverlay");
  });

  el("downloadTemplateBtn").addEventListener("click", () => CustomerImport.downloadBlankTemplate());
  el("chooseFilledFileBtn").addEventListener("click", () => el("bulkFileInput").click());

  el("bulkFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    UI.hideOverlay("importCustomersOverlay");

    const rows = await CustomerImport.parseFile(file);
    const { clean, conflicts } = await CustomerImport.classifyRows(rows);

    for (const row of clean) {
      await CustomerDB.add(row);
    }

    const summaryEl = el("customerImportSummary");
    summaryEl.style.display = clean.length ? "block" : "none";
    summaryEl.textContent = clean.length ? `Imported ${clean.length} new customer(s).` : "";

    if (conflicts.length > 0) {
      state.conflictQueue = conflicts;
      renderConflicts();
    }
    await refreshCustomerList();
  });

  function renderConflicts() {
    const container = el("conflictReview");
    if (state.conflictQueue.length === 0) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }
    container.style.display = "block";
    container.innerHTML = "";
    state.conflictQueue.forEach((c, idx) => {
      const item = document.createElement("div");
      item.className = "conflict-item";
      item.innerHTML = `
        <div class="conflict-desc"><b>${c.row.shopName}</b> / ${c.row.licenseNumber} conflicts with existing <b>${c.existing.shopName}</b> / ${c.existing.licenseNumber}</div>
        <div class="conflict-actions">
          <button data-action="keep">Keep existing</button>
          <button data-action="overwrite">Overwrite</button>
          <button data-action="add">Add anyway</button>
        </div>
      `;
      item.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", async () => {
          const action = btn.dataset.action;
          if (action === "overwrite" && c.existing.id) {
            await CustomerDB.update(c.existing.id, c.row);
          } else if (action === "add") {
            await CustomerDB.add(c.row);
          }
          state.conflictQueue.splice(idx, 1);
          renderConflicts();
          await refreshCustomerList();
        });
      });
      container.appendChild(item);
    });
  }

  // ---------- Settings ----------

  const SETTINGS_SLIDER_IDS = ["columns", "padding", "angle", "opacity"];

  // Cross-browser fill: WebKit doesn't fill the lower portion of a range
  // input natively, so we compute the value's position as a percentage and
  // expose it as a CSS custom property, which the track pseudo-element's
  // gradient reads (custom properties inherit into ::-webkit-*-track).
  function updateSliderFill(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value);
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty("--range-progress", `${pct}%`);
  }

  [["columns", "columnsOut"], ["padding", "paddingOut"], ["angle", "angleOut"], ["opacity", "opacityOut"]]
    .forEach(([sliderId, outId]) => {
      const slider = el(sliderId);
      const out = el(outId);
      slider.addEventListener("input", () => {
        out.textContent = slider.value;
        updateSliderFill(slider);
        schedulePreview();
      });
    });

  document.querySelectorAll("#styleToggle .icon-seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#styleToggle .icon-seg").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentStyle = btn.dataset.style;
      schedulePreview();
    });
  });

  function readSettings() {
    return {
      columns: parseInt(el("columns").value, 10),
      paddingRatio: parseInt(el("padding").value, 10) / 100,
      angleDeg: parseInt(el("angle").value, 10),
      opacity: parseInt(el("opacity").value, 10) / 100,
      style: state.currentStyle
    };
  }

  // ---------- Settings default (persisted) ----------

  const SETTINGS_DEFAULT_KEY = "wm_settings_default";
  const BUILTIN_SETTINGS_DEFAULT = { columns: 3, padding: 15, angle: 45, opacity: 20, style: "light", output: "pdf" };

  function getSettingsDefault() {
    try {
      const raw = localStorage.getItem(SETTINGS_DEFAULT_KEY);
      if (!raw) return BUILTIN_SETTINGS_DEFAULT;
      const parsed = JSON.parse(raw);
      return { ...BUILTIN_SETTINGS_DEFAULT, ...parsed };
    } catch (e) {
      return BUILTIN_SETTINGS_DEFAULT;
    }
  }

  function applySettingsToControls(defaults) {
    el("columns").value = defaults.columns; el("columnsOut").textContent = String(defaults.columns);
    el("padding").value = defaults.padding; el("paddingOut").textContent = String(defaults.padding);
    el("angle").value = defaults.angle; el("angleOut").textContent = String(defaults.angle);
    el("opacity").value = defaults.opacity; el("opacityOut").textContent = String(defaults.opacity);
    SETTINGS_SLIDER_IDS.forEach(id => updateSliderFill(el(id)));
    document.querySelectorAll("#styleToggle .icon-seg").forEach(b => b.classList.remove("active"));
    const styleBtn = document.querySelector(`#styleToggle .icon-seg[data-style="${defaults.style}"]`);
    (styleBtn || document.querySelector('#styleToggle .icon-seg[data-style="light"]')).classList.add("active");
    state.currentStyle = defaults.style;
    el("outputFormat").value = defaults.output;
  }

  function saveCurrentSettingsAsDefault() {
    const toSave = {
      columns: parseInt(el("columns").value, 10),
      padding: parseInt(el("padding").value, 10),
      angle: parseInt(el("angle").value, 10),
      opacity: parseInt(el("opacity").value, 10),
      style: state.currentStyle,
      output: el("outputFormat").value
    };
    localStorage.setItem(SETTINGS_DEFAULT_KEY, JSON.stringify(toSave));
    setStatus("Default saved");
  }

  el("setDefaultBtn").addEventListener("click", saveCurrentSettingsAsDefault);

  function resetSettings() {
    applySettingsToControls(getSettingsDefault());
  }

  function setStatus(msg) { el("statusLine").textContent = msg || ""; }

  // ---------- Live preview (swipeable multi-template carousel) ----------

  function selectedTemplatesInOrder() {
    return state.templates.filter(t => state.selectedTemplateIds.has(t.id));
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(runPreview, 300);
  }

  // Tracks what's currently mounted in #previewTrack so runPreview() can tell
  // a pure settings/style/text change (reuse existing slide DOM, just repaint
  // the canvases) apart from a template-selection change (rebuild the slide
  // list). This is what avoids the clear-then-refill collapse/jump.
  let previewOrderIds = [];
  const previewSlideEls = new Map(); // tpl.id -> { slideEl, canvasEl }

  // Renders the watermarked result for one template using the cached,
  // already-decoded source canvas (no PDF/image re-decode).
  async function renderSlideResult(tpl, text, settings) {
    const srcCanvas = await getPreviewSourceCanvas(tpl);
    return Watermark.apply(srcCanvas, { text, ...settings });
  }

  function paintCanvas(canvasEl, resultCanvas) {
    if (canvasEl.width !== resultCanvas.width) canvasEl.width = resultCanvas.width;
    if (canvasEl.height !== resultCanvas.height) canvasEl.height = resultCanvas.height;
    const ctx = canvasEl.getContext("2d");
    ctx.drawImage(resultCanvas, 0, 0);
  }

  function setupDotsAndScroll(track, dots, selected) {
    dots.innerHTML = "";
    if (selected.length > 1) {
      selected.forEach((_, i) => {
        const dot = document.createElement("div");
        dot.className = "dot" + (i === 0 ? " active" : "");
        dot.addEventListener("click", () => {
          track.scrollTo({ left: track.clientWidth * i, behavior: "smooth" });
        });
        dots.appendChild(dot);
      });

      track.onscroll = () => {
        const idx = Math.round(track.scrollLeft / track.clientWidth);
        dots.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("active", i === idx));
      };
    } else {
      track.onscroll = null;
    }
  }

  // Selection of templates (or their order) changed: rebuild the slide DOM.
  // Some layout shift here is expected/acceptable — the visible document set
  // actually changed.
  async function rebuildSlides(selected, text, settings) {
    const track = el("previewTrack");
    const dots = el("previewDots");

    track.innerHTML = "";
    previewSlideEls.clear();

    for (let i = 0; i < selected.length; i++) {
      const tpl = selected[i];
      const slide = document.createElement("div");
      slide.className = "preview-slide";
      slide.dataset.tplId = tpl.id;
      track.appendChild(slide);
      try {
        const result = await renderSlideResult(tpl, text, settings);
        const canvasEl = document.createElement("canvas");
        canvasEl.width = result.width;
        canvasEl.height = result.height;
        canvasEl.getContext("2d").drawImage(result, 0, 0);
        slide.appendChild(canvasEl);
        previewSlideEls.set(tpl.id, { slideEl: slide, canvasEl });
      } catch (err) {
        console.error(err);
        slide.textContent = "Preview error";
        previewSlideEls.set(tpl.id, { slideEl: slide, canvasEl: null });
      }
    }

    previewOrderIds = selected.map(t => t.id);
    setupDotsAndScroll(track, dots, selected);
  }

  // Pure settings/style/text change with the same templates selected (same
  // ids, same order): repaint each existing canvas in place. No DOM nodes
  // are removed or added, so there is no reflow/collapse.
  async function updateSlidesInPlace(selected, text, settings) {
    for (const tpl of selected) {
      const entry = previewSlideEls.get(tpl.id);
      if (!entry) continue; // shouldn't happen if selection signature matched
      try {
        const result = await renderSlideResult(tpl, text, settings);
        if (entry.canvasEl) {
          paintCanvas(entry.canvasEl, result);
        } else {
          // Previous render errored and left no canvas — add one now.
          entry.slideEl.textContent = "";
          const canvasEl = document.createElement("canvas");
          canvasEl.width = result.width;
          canvasEl.height = result.height;
          canvasEl.getContext("2d").drawImage(result, 0, 0);
          entry.slideEl.appendChild(canvasEl);
          entry.canvasEl = canvasEl;
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function runPreview() {
    const selected = selectedTemplatesInOrder();
    const track = el("previewTrack");
    const hint = el("previewHint");
    const dots = el("previewDots");

    if (selected.length === 0) {
      track.innerHTML = "";
      dots.innerHTML = "";
      track.onscroll = null;
      previewOrderIds = [];
      previewSlideEls.clear();
      hint.style.display = "block";
      return;
    }
    hint.style.display = "none";

    const text = buildWatermarkText();
    const settings = readSettings();
    const newIds = selected.map(t => t.id);
    const sameSelection = newIds.length === previewOrderIds.length &&
      newIds.every((id, i) => id === previewOrderIds[i]);

    if (sameSelection) {
      await updateSlidesInPlace(selected, text, settings);
    } else {
      await rebuildSlides(selected, text, settings);
    }
  }

  // ---------- Long-press zoom on preview slides ----------

  let longPressTimer = null;
  let longPressStart = null;
  const LONG_PRESS_MS = 450;
  const LONG_PRESS_MOVE_TOLERANCE = 10;

  let zoomScale = 1, zoomPanX = 0, zoomPanY = 0;
  const zoomPointers = new Map();
  let pinchStartDist = 0, pinchStartScale = 1;

  function resetZoomTransform() {
    zoomScale = 1; zoomPanX = 0; zoomPanY = 0;
    applyZoomTransform();
  }
  function applyZoomTransform() {
    el("zoomImage").style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomScale})`;
  }

  function closeZoom() {
    el("zoomOverlay").style.display = "none";
  }

  async function openZoom(slide) {
    const canvas = slide.querySelector("canvas");
    if (!canvas) return;
    const img = el("zoomImage");
    img.src = canvas.toDataURL("image/png");
    resetZoomTransform();
    el("zoomOverlay").style.display = "flex";

    const tplId = slide.dataset.tplId;
    const tpl = state.templates.find(t => String(t.id) === String(tplId));
    if (!tpl) return;
    try {
      const text = buildWatermarkText();
      const settings = readSettings();
      const hiCanvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 400);
      const hiResult = await Watermark.apply(hiCanvas, { text, ...settings });
      if (el("zoomOverlay").style.display !== "none") {
        img.src = hiResult.toDataURL("image/png");
      }
    } catch (err) {
      console.error(err);
    }
  }

  const previewTrackEl = el("previewTrack");

  previewTrackEl.addEventListener("pointerdown", (e) => {
    const slide = e.target.closest(".preview-slide");
    if (!slide) return;
    longPressStart = { x: e.clientX, y: e.clientY };
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      openZoom(slide);
    }, LONG_PRESS_MS);
  });
  previewTrackEl.addEventListener("pointermove", (e) => {
    if (longPressTimer === null || !longPressStart) return;
    const dx = e.clientX - longPressStart.x;
    const dy = e.clientY - longPressStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_TOLERANCE) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evtName) => {
    previewTrackEl.addEventListener(evtName, () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    });
  });

  el("zoomCloseBtn").addEventListener("click", closeZoom);
  el("zoomOverlay").addEventListener("click", (e) => {
    if (e.target.id === "zoomOverlay" || e.target.id === "zoomViewport") closeZoom();
  });

  const zoomImgEl = el("zoomImage");
  zoomImgEl.addEventListener("pointerdown", (e) => {
    zoomPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    zoomImgEl.setPointerCapture(e.pointerId);
    if (zoomPointers.size === 2) {
      const pts = Array.from(zoomPointers.values());
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = zoomScale;
    }
  });
  zoomImgEl.addEventListener("pointermove", (e) => {
    if (!zoomPointers.has(e.pointerId)) return;
    const prev = zoomPointers.get(e.pointerId);
    zoomPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zoomPointers.size === 2) {
      const pts = Array.from(zoomPointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDist > 0) {
        zoomScale = Math.min(5, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
        applyZoomTransform();
      }
    } else if (zoomPointers.size === 1 && zoomScale > 1) {
      zoomPanX += e.clientX - prev.x;
      zoomPanY += e.clientY - prev.y;
      applyZoomTransform();
    }
  });
  function releaseZoomPointer(e) {
    zoomPointers.delete(e.pointerId);
    if (zoomPointers.size < 2) pinchStartDist = 0;
  }
  zoomImgEl.addEventListener("pointerup", releaseZoomPointer);
  zoomImgEl.addEventListener("pointercancel", releaseZoomPointer);
  zoomImgEl.addEventListener("dblclick", () => {
    if (zoomScale > 1) {
      resetZoomTransform();
    } else {
      zoomScale = 2.5;
      applyZoomTransform();
    }
  });

  // ---------- Create / Export ----------

  function safeFilenamePart(str) {
    return (str || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-ก-๙]/g, "");
  }

  // Shop name + order date portion, shared by every output file (and the zip
  // name when multiple templates are selected).
  function buildBaseFilename() {
    const shopLine = state.lines.find(l => l.role === "shop");
    const dateLine = state.lines.find(l => l.role === "date");
    const shop = safeFilenamePart(shopLine ? shopLine.value : "");
    const date = safeFilenamePart(dateLine ? dateLine.value : "");
    if (shop && date) return `${shop}_${date}`;
    if (shop || date) return shop || date;
    return `watermarked_${new Date().toISOString().slice(0, 10)}`;
  }

  // Per-output filename: "{template name}_{shop name}_{order date}", always
  // led by the template name so each output stays uniquely identifiable.
  function buildOutputFilename(tpl, baseFilename) {
    const tplName = safeFilenamePart(tpl.name.replace(/\.[^.]+$/, ""));
    return tplName ? `${tplName}_${baseFilename}` : baseFilename;
  }

  el("cancelBtn").addEventListener("click", () => {
    state.selectedTemplateIds.clear();
    state.lines = defaultLines();
    renderLines();
    resetSettings();
    renderTemplatePicker();
    schedulePreview();
    setStatus("");
  });

  el("createBtn").addEventListener("click", async () => {
    if (state.selectedTemplateIds.size === 0) {
      setStatus("Select at least one template first.");
      return;
    }
    const selected = selectedTemplatesInOrder();
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
        let blob;
        if (format === "pdf" && tpl.type === "pdf") {
          // Vector path: overlay watermark on the original PDF, keeping page
          // content selectable/crisp. Fall back to raster on any error.
          try {
            blob = await PdfHandler.overlayOnPdf(tpl.blob, { text, ...settings });
          } catch (e) {
            console.warn("Vector overlay failed, falling back to raster:", e);
          }
        }
        if (!blob) {
          const srcCanvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 300);
          const result = await Watermark.apply(srcCanvas, { text, ...settings });
          blob = await PdfHandler.canvasToBlob(result, format);
        }
        const filenameBody = buildOutputFilename(tpl, baseFilename);
        outputs.push({ blob, filename: `${filenameBody}.${format === "pdf" ? "pdf" : "jpg"}` });
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
      await requestSaveCustomerIfNew();
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  });

  // ---------- App version (single source of truth: <meta name="app-version">) ----------

  function renderAppVersion() {
    const meta = document.querySelector('meta[name="app-version"]');
    const versionEl = el("appVersion");
    if (meta && versionEl) versionEl.textContent = `v${meta.content}`;
  }

  // ---------- Init ----------
  async function init() {
    renderAppVersion();
    applySettingsToControls(getSettingsDefault());
    renderLines();
    await refreshTemplates();
    await loadCustomers();
  }
  init();
})();
