// CSV/Excel bulk upload for the customer preset list, plus a blank-template
// download. Expected columns: ชื่อร้านค้า, เลขที่ใบอนุญาติ.
const CustomerImport = (() => {

  const COL_SHOP = "ชื่อร้านค้า";
  const COL_LICENSE = "เลขที่ใบอนุญาติ";

  function downloadBlankTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([[COL_SHOP, COL_LICENSE]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customer_template.xlsx");
  }

  async function parseFile(file) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    return rows
      .map(row => ({
        shopName: String(row[COL_SHOP] ?? "").trim(),
        licenseNumber: String(row[COL_LICENSE] ?? "").trim()
      }))
      .filter(r => r.shopName || r.licenseNumber);
  }

  // Classify each parsed row against existing customers + rows already
  // queued earlier in the same file, so in-file duplicates are also caught.
  async function classifyRows(rows) {
    const clean = [];
    const conflicts = [];
    const seenInFile = [];

    for (const row of rows) {
      let existing = await CustomerDB.findDuplicate(row.shopName, row.licenseNumber);
      if (!existing) {
        existing = seenInFile.find(r =>
          r.shopName.toLowerCase() === row.shopName.toLowerCase() ||
          (row.licenseNumber && r.licenseNumber.toLowerCase() === row.licenseNumber.toLowerCase())
        );
      }
      if (existing) {
        conflicts.push({ row, existing });
      } else {
        clean.push(row);
      }
      seenInFile.push(row);
    }

    return { clean, conflicts };
  }

  return { downloadBlankTemplate, parseFile, classifyRows };
})();
