// mcp_preferences.js
// UI pour préférences utilisateur: import/export et bindings

globalThis.performanceSettings = globalThis.performanceSettings || {
  mode: "balanced",
  refreshRate: 30000,
  maxLogLines: 1000,
  chartPoints: 30,
  gpuEnabled: true,
};

async function importPreferences(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.userPreferences) {
      Object.assign(userPreferences, data.userPreferences);
      if (typeof globalThis.saveUserPreferences === "function")
        globalThis.saveUserPreferences();
      if (typeof globalThis.loadUserPreferences === "function")
        globalThis.loadUserPreferences();
      showToast("success", "Préférences importées");
    }
  } catch (e) {
    console.warn("importPreferences failed", e);
    showToast("error", "Erreur d'import");
  }
}

function initPreferences() {
  globalThis.importPreferences = importPreferences;
  globalThis._mcp_importPreferences = importPreferences;
}
