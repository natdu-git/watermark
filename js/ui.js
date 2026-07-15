// Small reusable UI helpers: confirm dialog + generic overlay show/hide.
const UI = (() => {
  const el = (id) => document.getElementById(id);

  function confirmDialog(message) {
    return new Promise((resolve) => {
      const overlay = el("confirmOverlay");
      el("confirmMessage").textContent = message;
      overlay.style.display = "flex";

      const okBtn = el("confirmOkBtn");
      const cancelBtn = el("confirmCancelBtn");

      function cleanup(result) {
        overlay.style.display = "none";
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
    });
  }

  function showOverlay(id) { el(id).style.display = "flex"; }
  function hideOverlay(id) { el(id).style.display = "none"; }

  return { confirmDialog, showOverlay, hideOverlay };
})();
