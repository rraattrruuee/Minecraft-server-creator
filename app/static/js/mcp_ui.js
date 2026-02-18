// mcp_ui.js
// Comportements UI généraux: sections, modals, quick actions

function __real_showSection(sectionName) {
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  const section = document.getElementById(`section-${sectionName}`);
  if (section) section.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === sectionName);
  });
  if (sectionName === "settings" && typeof loadSettings === "function")
    loadSettings();
  if (
    sectionName === "notifications" &&
    typeof loadNotifications === "function"
  )
    loadNotifications();
  if (sectionName === "dashboard" && typeof loadSystemMetrics === "function")
    loadSystemMetrics();
}

// wrapper used by inline handlers; this will be set on init
function showSection(sectionName) {
  if (typeof globalThis.__real_showSection === "function")
    return globalThis.__real_showSection(sectionName);
  // queueing is handled by main loader
  globalThis.__queuedShowSection = globalThis.__queuedShowSection || [];
  globalThis.__queuedShowSection.push(sectionName);
}

function openModal() {
  document.getElementById("create-modal")?.classList.add("show");
  renderSelectedMods();
  loadVersions();
}

function closeModal() {
  document.getElementById("create-modal")?.classList.remove("show");
}

function openSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) {
    modal.style.display = "block";
    if (typeof loadNotificationConfig === "function") loadNotificationConfig();
    if (typeof loadAdminQuotas === "function") loadAdminQuotas();
  }
}

function closeSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.style.display = "none";
}

/**
 * Change la période d'affichage du graphique principal.
 * Appelée depuis l'attribut `onchange` dans le template (`#chart-period`).
 */
function updateChartPeriod(value) {
  console.debug("updateChartPeriod called with", value);
  const v = Number(value) || 60;
  globalThis.metricsHistoryLimit = v;
  if (typeof globalThis.performanceSettings !== "undefined") {
    globalThis.performanceSettings.chartPoints = Math.max(
      10,
      Math.min(1000, v),
    );
  }
  try {
    const sel = document.getElementById("chart-period");
    if (sel) sel.value = String(v);
  } catch (e) {}
  if (typeof loadMetricsHistory === "function") {
    loadMetricsHistory(v);
  }
  try {
    showToast("info", `Période graphique changée: ${v} points`);
  } catch (e) {}
  try {
    loadSystemMetrics();
  } catch (e) {
    console.warn("loadSystemMetrics failed after period change", e);
  }
}
window.updateChartPeriod = updateChartPeriod;

(function attachChartPeriodListener() {
  const attach = (sel) =>
    sel &&
    sel.addEventListener("change", (e) => updateChartPeriod(e.target.value));
  const sel = document.getElementById("chart-period");
  if (sel) attach(sel);
  else
    document.addEventListener("DOMContentLoaded", () => {
      const sel2 = document.getElementById("chart-period");
      if (sel2) attach(sel2);
    });
})();

function switchTab(viewName) {
  // Remove active class and hide all views to avoid leftover visible panes
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.remove("active");
    try {
      v.style.display = "none";
    } catch (e) {}
  });

  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));

  const view = document.getElementById(`view-${viewName}`);
  const tab = document.querySelector(`.tab[data-view="${viewName}"]`);

  if (view) {
    view.classList.add("active");
    try {
      view.style.display = "block";
    } catch (e) {}
  }

  if (tab) tab.classList.add("active");

  // Call feature-specific loaders if they exist
  if (viewName === "console") {
    if (typeof startLogStream === "function") startLogStream();
  } else {
    if (typeof stopLogStream === "function") stopLogStream();
  }

  if (viewName === "players" && typeof loadPlayers === "function")
    loadPlayers();
  if (viewName === "plugins" && typeof loadInstalledPlugins === "function")
    loadInstalledPlugins();
  if (viewName === "mods" && typeof loadInstalledMods === "function")
    loadInstalledMods();
  if (viewName === "config" && typeof loadConfig === "function") loadConfig();
  if (viewName === "backups" && typeof loadBackups === "function")
    loadBackups();
  if (viewName === "stats" && typeof refreshServerStats === "function")
    refreshServerStats();
  if (viewName === "files" && typeof loadFiles === "function") loadFiles();
}

function renderSelectedMods() {
  try {
    const container = document.getElementById("selected-mods");
    if (!container) return;
    if (!Array.isArray(selectedMods) || selectedMods.length === 0) {
      container.innerHTML =
        '<div class="text-muted">Aucun mod sélectionné</div>';
      return;
    }
    container.innerHTML = selectedMods
      .map(
        (m) => `<div class="chip">${escapeHtml(m.name || m.slug || m)}</div>`,
      )
      .join(" ");
  } catch (e) {
    console.warn("renderSelectedMods failed", e);
  }
}

const themeManager = {
  key: "mcpanel_theme",
  colorKey: "mcpanel_accent_color",

  get() {
    return localStorage.getItem(this.key) || "dark";
  },

  getColor() {
    return localStorage.getItem(this.colorKey) || "#6c5ce7";
  },

  set(theme) {
    localStorage.setItem(this.key, theme);
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle("light-mode", theme === "light");
    showToast("info", `Thème: ${theme === "dark" ? "Sombre" : "Clair"}`);
  },

  setColor(color) {
    localStorage.setItem(this.colorKey, color);
    document.documentElement.style.setProperty("--primary-color", color);
    document.documentElement.style.setProperty("--accent-color", color);
  },

  toggle() {
    const current = this.get();
    this.set(current === "dark" ? "light" : "dark");
  },

  init() {
    const saved = this.get();
    const savedColor = this.getColor();

    document.documentElement.dataset.theme = saved;
    document.body.classList.toggle("light-mode", saved === "light");

    if (savedColor) {
      document.documentElement.style.setProperty("--primary-color", savedColor);
      document.documentElement.style.setProperty("--accent-color", savedColor);
    }
  },
};

function setupQuickActions() {
  // placeholder for global quick-action button bindings
}

async function initiateIconUpload() {
  if (!window.currentServer) {
    showToast("warning", "Sélectionnez un serveur avant de changer l'icône");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg";
  input.onchange = async (e) => {
    if (!e.target.files.length) return;
    const file = e.target.files[0];
    try {
      showToast("info", "Lecture de l'image...");
      const img = await readImageFromFile(file);
      const formData = new FormData();
      formData.append("icon", file);
      const res = await apiFetch(`/api/server/${window.currentServer}/icon`, {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.status === "success") {
        showToast("success", "Icône mise à jour !");
        if (typeof reloadServerIcon === "function")
          reloadServerIcon(window.currentServer);
      } else {
        showToast("error", result.message || "Erreur upload");
      }
    } catch (err) {
      showToast("error", "Erreur lors de l'upload");
    }
  };
  input.click();
}

function readImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initUI() {
  globalThis.__real_showSection = __real_showSection;
  globalThis.showSection = showSection;
  globalThis.openModal = openModal;
  globalThis.closeModal = closeModal;
  globalThis.openSettings = openSettings;
  globalThis.switchTab = switchTab;
  globalThis.renderSelectedMods = renderSelectedMods;
  globalThis.setupQuickActions = setupQuickActions;
  globalThis.initiateIconUpload = initiateIconUpload;

  globalThis._mcp_showSection = showSection;
  globalThis._mcp_openModal = openModal;
}

try {
  initUI();
} catch (e) {
  console.warn("initUI failed", e);
}
