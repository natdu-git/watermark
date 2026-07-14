// Main app wiring: navigation, template library, customer list, dynamic
// watermark lines, live preview, settings, and export.
(() => {
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                       "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

  const el = (id) => document.getElementById(id);

  function defaultLines() {
    return [
      { id: "shop",    role: "shop",    label: "ชื่อร้าน/บริษัท",       value: "", type: "text" },
      { id: "license", role: "license", label: "เลขที่ใบอนุญาต",        value: "", type: "text" },
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
    previewTimer: null
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

  // ---------- Template library (shared by Create picker + Setup manager) ----------

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
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await TemplateDB.deleteTemplate(tpl.id);
        state.selectedTemplateIds.delete(tpl.id);
        await refreshTemplates();
      });
      item.appendChild(thumb);
      item.appendChild(name);
      item.appendChild(delBtn);
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
      labelInput.placeholder = "Label";
      labelInput.addEventListener("input", () => { line.label = labelInput.value; schedulePreview(); });

      const valueInput = document.createElement("input");
      valueInput.className = line.type === "date" ? "line-value line-date" : "line-value";
      valueInput.type = line.type === "date" ? "date" : "text";
      valueInput.value = line.value;
      valueInput.placeholder = "Value";
      valueInput.addEventListener("input", () => { line.value = valueInput.value; schedulePreview(); });
      if (line.role === "shop") line.shopInputRef = valueInput;
      if (line.role === "license") line.licenseInputRef = valueInput;

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

      row.appendChild(labelInput);
      row.appendChild(valueInput);
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

  // ---------- Customer search (Create page) ----------

  async function loadCustomers() {
    state.customers = await CustomerDB.getAll();
  }

  const customerSearchInput = el("customerSearch");
  const suggestionsEl = el("customerSuggestions");
  const newLicenseInput = el("newLicenseInput");
  const customerErrorEl = el("customerError");

  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) { suggestionsEl.classList.remove("open"); suggestionsEl.innerHTML = ""; return; }
    const matches = state.customers.filter(c =>
      c.shopName.toLowerCase().includes(q) || c.licenseNumber.toLowerCase().includes(q)
    ).slice(0, 8);

    suggestionsEl.innerHTML = "";
    for (const c of matches) {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.innerHTML = `<div class="s-name">${c.shopName}</div><div class="s-license">${c.licenseNumber}</div>`;
      item.addEventListener("click", () => {
        customerSearchInput.value = c.shopName;
        newLicenseInput.value = c.licenseNumber;
        setCustomerFields(c.shopName, c.licenseNumber);
        suggestionsEl.classList.remove("open");
        customerErrorEl.textContent = "";
        schedulePreview();
      });
      suggestionsEl.appendChild(item);
    }
    suggestionsEl.classList.toggle("open", matches.length > 0);
  }

  customerSearchInput.addEventListener("input", () => {
    setCustomerFields(customerSearchInput.value, newLicenseInput.value);
    renderSuggestions(customerSearchInput.value);
    customerErrorEl.textContent = "";
    schedulePreview();
  });
  customerSearchInput.addEventListener("blur", () => {
    setTimeout(() => suggestionsEl.classList.remove("open"), 150);
  });

  newLicenseInput.addEventListener("input", () => {
    setCustomerFields(customerSearchInput.value, newLicenseInput.value);
    customerErrorEl.textContent = "";
    schedulePreview();
  });

  el("saveNewCustomerBtn").addEventListener("click", async () => {
    const shopName = customerSearchInput.value.trim();
    const licenseNumber = newLicenseInput.value.trim();
    if (!shopName || !licenseNumber) {
      customerErrorEl.textContent = "Enter both shop name and license number to save.";
      return;
    }
    const dup = await CustomerDB.findDuplicate(shopName, licenseNumber);
    if (dup) {
      customerErrorEl.textContent = `Conflicts with existing customer: ${dup.shopName} (${dup.licenseNumber}). Edit the name or license to resolve.`;
      return;
    }
    await CustomerDB.add({ shopName, licenseNumber });
    await loadCustomers();
    customerErrorEl.textContent = "";
    setStatus("Customer saved.");
  });

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

  el("outputFormat").addEventListener("change", () => {});

  function readSettings() {
    return {
      columns: parseInt(el("columns").value, 10),
      paddingRatio: parseInt(el("padding").value, 10) / 100,
      angleDeg: parseInt(el("angle").value, 10),
      opacity: parseInt(el("opacity").value, 10) / 100,
      style: state.currentStyle
    };
  }

  function setStatus(msg) { el("statusLine").textContent = msg || ""; }

  // ---------- Live preview ----------

  function firstSelectedTemplate() {
    if (state.selectedTemplateIds.size === 0) return null;
    const id = Array.from(state.selectedTemplateIds)[0];
    return state.templates.find(t => t.id === id) || null;
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(runPreview, 300);
  }

  async function runPreview() {
    const tpl = firstSelectedTemplate();
    const canvas = el("previewCanvas");
    const hint = el("previewHint");
    if (!tpl) {
      canvas.classList.remove("visible");
      hint.style.display = "block";
      return;
    }
    try {
      const srcCanvas = await PdfHandler.loadAsCanvas(tpl.blob, tpl.type, 150);
      const text = buildWatermarkText();
      const settings = readSettings();
      const result = await Watermark.apply(srcCanvas, { text, ...settings });
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext("2d").drawImage(result, 0, 0);
      canvas.classList.add("visible");
      hint.style.display = "none";
    } catch (err) {
      console.error(err);
      setStatus("Preview error: " + err.message);
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

  el("createBtn").addEventListener("click", async () => {
    if (state.selectedTemplateIds.size === 0) {
      setStatus("Select at least one template first.");
      return;
    }
    const selected = state.templates.filter(t => state.selectedTemplateIds.has(t.id));
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
  async function init() {
    renderLines();
    await refreshTemplates();
    await loadCustomers();
  }
  init();
})();
