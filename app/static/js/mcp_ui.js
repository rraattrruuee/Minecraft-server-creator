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
  }
}

function closeSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.style.display = "none";
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

function initUI() {
  // Install real showSection for compatibility
  globalThis.__real_showSection = __real_showSection;
  globalThis.showSection = showSection;
  globalThis.openModal = openModal;
  globalThis.closeModal = closeModal;
  globalThis.openSettings = openSettings;
  globalThis.renderSelectedMods = renderSelectedMods;
  globalThis.setupQuickActions = setupQuickActions;
  // underscored aliases
  globalThis._mcp_showSection = showSection;
  globalThis._mcp_openModal = openModal;
}
