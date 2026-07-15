// Main app wiring: navigation, template library, dynamic watermark lines,
// inline customer search, live multi-template preview carousel, settings,
// export, and post-create save-customer prompt.
(() => {
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                       "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

  const el = (id) => document.getElementById(id);

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
  async function renderThumb(tpl) {
    if (thumbCache.has(tpl.id)) return thumbCache.get(tpl.id);
    const canvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 40);
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
      settingsBtn.textContent = "⚙";
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

  el("uploadBtn").addEventListener("click", () => el("fileInput").click());
  el("fileInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const file of files) {
      await TemplateDB.addTemplate({
        name: file.name,
        type: /\.pdf$/i.test(file.name) ? "pdf" : "image",
        blob: file
      });
    }
    e.target.value = "";
    await refreshTemplates();
  });

  // ---------- Template settings popup (rename / delete) ----------

  let activeTemplateForSettings = null;

  function openTemplateSettings(tpl) {
    activeTemplateForSettings = tpl;
    el("templateNameInput").value = tpl.name;
    UI.showOverlay("templateSettingsOverlay");
  }

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

      const titleRow = document.createElement("div");
      titleRow.className = "line-title-row";

      const labelInput = document.createElement("input");
      labelInput.className = "line-label";
      labelInput.value = line.label;
      labelInput.placeholder = "Label";
      labelInput.addEventListener("input", () => { line.label = labelInput.value; schedulePreview(); });
      titleRow.appendChild(labelInput);

      if (line.role === "shop" || line.role === "license") {
        const searchBtn = document.createElement("button");
        searchBtn.className = "search-icon-btn";
        searchBtn.textContent = "\u{1F50D}";
        searchBtn.title = "Search customers";
        searchBtn.addEventListener("click", () => openCustomerSearch());
        titleRow.appendChild(searchBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "line-del";
      delBtn.textContent = "×";
      delBtn.disabled = state.lines.length <= 1;
      delBtn.addEventListener("click", () => {
        if (state.lines.length <= 1) return;
        state.lines = state.lines.filter(l => l.id !== line.id);
        renderLines();
        schedulePreview();
      });
      titleRow.appendChild(delBtn);

      const valueInput = document.createElement("input");
      valueInput.className = "line-value";
      valueInput.type = line.type === "date" ? "date" : "text";
      valueInput.value = line.value;
      valueInput.placeholder = "Value";
      valueInput.addEventListener("input", () => { line.value = valueInput.value; schedulePreview(); });
      if (line.role === "shop") line.shopInputRef = valueInput;
      if (line.role === "license") line.licenseInputRef = valueInput;

      row.appendChild(titleRow);
      row.appendChild(valueInput);
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
        <div class="c-actions"><button class="del" title="Delete">×</button></div>
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

  // ---------- Bulk import ----------

  el("downloadTemplateBtn").addEventListener("click", () => CustomerImport.downloadBlankTemplate());
  el("bulkUploadBtn").addEventListener("click", () => el("bulkFileInput").click());

  el("bulkFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

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

  [["columns", "columnsOut"], ["padding", "paddingOut"], ["angle", "angleOut"], ["opacity", "opacityOut"]]
    .forEach(([sliderId, outId]) => {
      const slider = el(sliderId);
      const out = el(outId);
      slider.addEventListener("input", () => { out.textContent = slider.value; schedulePreview(); });
    });

  document.querySelectorAll("#styleToggle .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#styleToggle .seg-btn").forEach(b => b.classList.remove("active"));
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

  function resetSettings() {
    el("columns").value = 3; el("columnsOut").textContent = "3";
    el("padding").value = 15; el("paddingOut").textContent = "15";
    el("angle").value = 45; el("angleOut").textContent = "45";
    el("opacity").value = 20; el("opacityOut").textContent = "20";
    document.querySelectorAll("#styleToggle .seg-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('#styleToggle .seg-btn[data-style="light"]').classList.add("active");
    state.currentStyle = "light";
    el("outputFormat").value = "pdf";
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

  async function runPreview() {
    const selected = selectedTemplatesInOrder();
    const track = el("previewTrack");
    const hint = el("previewHint");
    const dots = el("previewDots");

    if (selected.length === 0) {
      track.innerHTML = "";
      dots.innerHTML = "";
      hint.style.display = "block";
      return;
    }
    hint.style.display = "none";

    const text = buildWatermarkText();
    const settings = readSettings();

    track.innerHTML = "";
    dots.innerHTML = "";

    for (let i = 0; i < selected.length; i++) {
      const tpl = selected[i];
      const slide = document.createElement("div");
      slide.className = "preview-slide";
      track.appendChild(slide);
      try {
        const srcCanvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 150);
        const result = await Watermark.apply(srcCanvas, { text, ...settings });
        slide.appendChild(result);
      } catch (err) {
        console.error(err);
        slide.textContent = "Preview error";
      }
    }

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

  // ---------- Create / Export ----------

  function safeFilenamePart(str) {
    return (str || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-ก-๙]/g, "");
  }

  function buildBaseFilename() {
    const orderLine = state.lines.find(l => l.role === "order");
    const shopLine = state.lines.find(l => l.role === "shop");
    const order = safeFilenamePart(orderLine ? orderLine.value : "");
    const name = safeFilenamePart(shopLine ? shopLine.value : "");
    if (order && name) return `${order}_${name}`;
    if (order || name) return order || name;
    return `watermarked_${new Date().toISOString().slice(0, 10)}`;
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
      await requestSaveCustomerIfNew();
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  });

  // ---------- Init ----------
  async function init() {
    renderLines();
    await refreshTemplates();
    await loadCustomers();
  }
  init();
})();
