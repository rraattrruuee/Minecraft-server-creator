// mcp_shortcuts.js
// Raccourcis globaux et gestion d'activité

function setupGlobalShortcuts() {
  if (globalThis.__mcp_setupGlobalShortcutsDone) return;
  globalThis.__mcp_setupGlobalShortcutsDone = true;
  try {
    document.addEventListener("keydown", (e) => {
      try {
        const key = (e.key || "").toLowerCase();
        if (e.ctrlKey && key === "k") {
          e.preventDefault();
          document.getElementById("cmd-input")?.focus();
        }
        if (e.ctrlKey && e.shiftKey && key === "p") {
          e.preventDefault();
          if (typeof refreshAll === "function") refreshAll();
        }
        if (e.ctrlKey && key === "l") {
          e.preventDefault();
          if (typeof logout === "function") logout();
        }
      } catch (err) {
        console.warn("global shortcut handler failed", err);
      }
    });
  } catch (e) {
    console.warn("setupGlobalShortcuts failed", e);
  }
}

function initShortcuts() {
  globalThis.setupGlobalShortcuts = setupGlobalShortcuts;
  globalThis._mcp_setupGlobalShortcuts = setupGlobalShortcuts;
}
