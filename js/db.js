// IndexedDB wrapper for storing user-uploaded templates and the customer
// preset list (ชื่อร้านค้า + เลขที่ใบอนุญาติ) on-device.
const AppDB = (() => {
  const DB_NAME = "watermark-templates";
  const DB_VERSION = 2;
  const TEMPLATE_STORE = "templates";
  const CUSTOMER_STORE = "customers";
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
          const store = db.createObjectStore(TEMPLATE_STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("addedAt", "addedAt");
        }
        if (!db.objectStoreNames.contains(CUSTOMER_STORE)) {
          const store = db.createObjectStore(CUSTOMER_STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("addedAt", "addedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  return { open, TEMPLATE_STORE, CUSTOMER_STORE };
})();

const TemplateDB = (() => {
  async function addTemplate({ name, type, blob }) {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.TEMPLATE_STORE, "readwrite");
      const store = tx.objectStore(AppDB.TEMPLATE_STORE);
      const record = { name, type, blob, addedAt: Date.now() };
      const req = store.add(record);
      req.onsuccess = () => resolve({ ...record, id: req.result });
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll() {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.TEMPLATE_STORE, "readonly");
      const store = tx.objectStore(AppDB.TEMPLATE_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.addedAt - a.addedAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteTemplate(id) {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.TEMPLATE_STORE, "readwrite");
      const store = tx.objectStore(AppDB.TEMPLATE_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return { addTemplate, getAll, deleteTemplate };
})();

const CustomerDB = (() => {

  function norm(str) {
    return (str || "").trim().toLowerCase();
  }

  async function getAll() {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.CUSTOMER_STORE, "readonly");
      const store = tx.objectStore(AppDB.CUSTOMER_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.shopName.localeCompare(b.shopName, "th")));
      req.onerror = () => reject(req.error);
    });
  }

  // Returns the existing record that matches on shopName OR licenseNumber,
  // excluding excludeId (used when editing an existing record).
  async function findDuplicate(shopName, licenseNumber, excludeId = null) {
    const all = await getAll();
    const nShop = norm(shopName);
    const nLic = norm(licenseNumber);
    return all.find(c =>
      c.id !== excludeId &&
      ((nShop && norm(c.shopName) === nShop) || (nLic && norm(c.licenseNumber) === nLic))
    ) || null;
  }

  async function add({ shopName, licenseNumber }) {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.CUSTOMER_STORE, "readwrite");
      const store = tx.objectStore(AppDB.CUSTOMER_STORE);
      const record = { shopName, licenseNumber, addedAt: Date.now() };
      const req = store.add(record);
      req.onsuccess = () => resolve({ ...record, id: req.result });
      req.onerror = () => reject(req.error);
    });
  }

  async function update(id, { shopName, licenseNumber }) {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.CUSTOMER_STORE, "readwrite");
      const store = tx.objectStore(AppDB.CUSTOMER_STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = { ...getReq.result, shopName, licenseNumber };
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve(record);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function deleteCustomer(id) {
    const db = await AppDB.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppDB.CUSTOMER_STORE, "readwrite");
      const store = tx.objectStore(AppDB.CUSTOMER_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return { getAll, findDuplicate, add, update, deleteCustomer };
})();
