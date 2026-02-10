// mcp_state.js
// Centralise l'état global et fonctions serveur / préférences de haut niveau.

// State variables (these refer to globals declared in app_pro.js and will update them)
let jobPoller = null;
let logInterval = null;
let statusInterval = null;
let metricsInterval = null;
let mainChart = null;
let metricsHistory = { cpu: [], ram: [], timestamps: [] };
let selectedMods = window.selectedMods || [];
window.selectedMods = selectedMods;

// Persisted state and caches
const dataCache = {
  servers: null,
  versions: null,
  metrics: null,
  lastUpdate: {},
};
const CACHE_DURATION = 30000;

// Session stats
const sessionStats = window.sessionStats || {
  startTime: Date.now(),
  apiCalls: 0,
  errors: 0,
  commandsSent: 0,
  notifications: 0,
};
window.sessionStats = sessionStats;

// User preferences
const userPreferences = window.userPreferences || {
  soundEnabled: true,
  desktopNotifications: false,
  compactMode: false,
  showTimestamps: true,
  logMaxLines: 1000,
  autoRefresh: true,
  refreshInterval: 5000,
};
window.userPreferences = userPreferences;

let favoriteCommands = window.favoriteCommands || [];
window.favoriteCommands = favoriteCommands;

let commandHistory = window.commandHistory || [];
let commandHistoryIndex = window.commandHistoryIndex || -1;
const MAX_COMMAND_HISTORY = window.MAX_COMMAND_HISTORY || 100;

// Initialization / loaders
function loadUserPreferences() {
  const saved = localStorage.getItem("mcpanel_userprefs");
  if (saved) {
    try {
      Object.assign(userPreferences, JSON.parse(saved));
    } catch (e) {
      console.warn("loadUserPreferences: failed to parse", e);
    }
  }
  loadCommandHistory();
  loadFavoriteCommands();
  try {
    const oldPwd = document.getElementById("old-password");
    const newPwd = document.getElementById("new-password");
    const confirmPwd = document.getElementById("confirm-password");
    const emailInp = document.getElementById("account-email");
    if (oldPwd) oldPwd.value = "";
    if (newPwd) newPwd.value = "";
    if (confirmPwd) confirmPwd.value = "";
    if (emailInp) emailInp.value = window.currentUser?.email || "";
  } catch (e) {
    console.warn("loadUserPreferences: failed to restore inputs", e);
  }
}

function saveUserPreferences() {
  localStorage.setItem("mcpanel_userprefs", JSON.stringify(userPreferences));
}

function loadCommandHistory() {
  const saved = localStorage.getItem("mcpanel_cmdhistory");
  if (saved) {
    try {
      commandHistory = JSON.parse(saved);
    } catch (e) {
      console.warn("loadCommandHistory: failed to parse", e);
    }
  }
}

function saveCommandHistory() {
  localStorage.setItem(
    "mcpanel_cmdhistory",
    JSON.stringify(commandHistory.slice(0, 50)),
  );
}

function loadFavoriteCommands() {
  const saved = localStorage.getItem("mcpanel_favcmds");
  if (saved) {
    try {
      favoriteCommands = JSON.parse(saved);
      window.favoriteCommands = favoriteCommands;
    } catch (e) {
      console.warn("loadFavoriteCommands: failed to parse", e);
    }
  }
}

function saveFavoriteCommands() {
  localStorage.setItem("mcpanel_favcmds", JSON.stringify(favoriteCommands));
}

function addFavoriteCommand(cmd) {
  if (!favoriteCommands.includes(cmd)) {
    favoriteCommands.push(cmd);
    saveFavoriteCommands();
    try {
      if (typeof window.showToast === "function")
        window.showToast("success", "Commande ajoutée aux favoris");
    } catch (e) {}
    renderFavoriteCommands();
  }
}

function removeFavoriteCommand(cmd) {
  favoriteCommands = favoriteCommands.filter((c) => c !== cmd);
  saveFavoriteCommands();
  try {
    if (typeof window.showToast === "function")
      window.showToast("info", "Commande retirée des favoris");
  } catch (e) {}
  renderFavoriteCommands();
}

function addCurrentCommandToFavorites() {
  const input = document.getElementById("cmd-input");
  const cmd = input?.value?.trim();
  if (cmd) addFavoriteCommand(cmd);
  else
    try {
      window.showToast("info", "Entrez une commande d'abord");
    } catch (e) {}
}

function renderFavoriteCommands() {
  const list = document.getElementById("favorite-commands-list");
  if (!list) return;
  list.innerHTML = favoriteCommands
    .map(
      (cmd) =>
        `<div class="fav-command"><button class="plugin-favorite" onclick="runFavoriteCommand('${escapeHtmlAttr(cmd)}')">${escapeHtml(cmd)}</button> <button class="btn-icon btn-small" title="Retirer" onclick="removeFavoriteCommand('${escapeHtmlAttr(cmd)}')">×</button></div>`,
    )
    .join("");
}

function runFavoriteCommand(cmd) {
  const input = document.getElementById("cmd-input");
  if (!input) return;
  input.value = cmd;
  sendCommand();
}

// Server list loader
async function loadServerList(forceRefresh = false) {
  console.debug("loadServerList called", { forceRefresh });
  try {
    const response = await apiFetch("/api/servers");
    console.debug(
      "/api/servers response",
      response && typeof response.json === "function" ? "ok" : response,
    );
    const servers = await response.json();
    console.debug("/api/servers parsed", {
      length: Array.isArray(servers) ? servers.length : null,
      sample: servers?.slice?.(0, 5),
    });
    const serversChanged =
      forceRefresh ||
      JSON.stringify(servers) !== JSON.stringify(window.lastServerList || []);
    console.debug("serversChanged?", serversChanged);
    window.lastServerList = servers;
    const serversTable = document.getElementById("servers-table");
    if (serversTable && serversChanged) {
      if (servers.length === 0)
        serversTable.innerHTML =
          '<p class="empty-message">Aucun serveur. Crez-en un !</p>';
      else {
        serversTable.innerHTML = `<table><thead><tr><th>Nom</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${servers.map((s) => `<tr><td>${escapeHtml(s)}</td><td><span class="status-dot-small" id="status-${s}"></span></td><td><button class="btn-table" onclick="selectServer('${s}')"><i class="fas fa-eye"></i></button></td></tr>`).join("")}</tbody></table>`;
      }
    } else {
      console.debug("serversTable not updated", {
        serversTableExists: !!serversTable,
        serversLength: servers?.length,
      });
    }
  } catch (e) {
    console.warn("loadServerList failed", e);
  }
}

// Reload server icon (copied from original implementation)
async function reloadServerIcon(serverName, options = {}) {
  try {
    const iconImg = document.querySelector("#server-detail-icon img");
    const rawUrl = `/api/server/${encodeURIComponent(serverName)}/icon/raw?t=${Date.now()}`;
    const res = await fetch(rawUrl, { credentials: "include" });
    if (res && res.status === 200) {
      if (iconImg) {
        iconImg.src = rawUrl;
        iconImg.classList.add("icon-updated");
        setTimeout(() => iconImg.classList.remove("icon-updated"), 1600);
      }
      document
        .querySelectorAll(".server-card img, .server-item img")
        .forEach((img) => {
          try {
            img.src = rawUrl;
          } catch (e) {}
        });
      return true;
    } else {
      if (iconImg) iconImg.src = "/static/img/default_icon.svg";
      return false;
    }
  } catch (err) {
    console.warn("reloadServerIcon failed", err);
    try {
      const iconImg = document.querySelector("#server-detail-icon img");
      if (iconImg) iconImg.src = "/static/img/default_icon.svg";
    } catch (e) {}
    return false;
  }
}

async function applyServerConfigContext(
  serverName,
  config,
  authoritative = false,
) {
  try {
    const now = Date.now();
    const __serverContextLocks = (globalThis.__serverContextLocks =
      globalThis.__serverContextLocks || {});
    if (
      !authoritative &&
      __serverContextLocks[serverName] &&
      now < __serverContextLocks[serverName]
    )
      return;
    if (authoritative) __serverContextLocks[serverName] = now + 10000;
    let serverType =
      (config && (config.server_type || config.serverType)) || null;
    if (config && (config.version || config.mc_version))
      window.currentServerMcVersion =
        config.version || config.mc_version || window.currentServerMcVersion;
    if (!serverType) {
      try {
        const pluginsResp = await apiFetch(
          `/api/server/${serverName}/plugins/installed`,
        );
        const plugins = await pluginsResp.json();
        if (Array.isArray(plugins) && plugins.length > 0) serverType = "paper";
      } catch (e) {
        console.warn(
          "serverConfig: failed to check installed plugins for",
          serverName,
          e,
        );
      }
    }
    if (!serverType || serverType === "paper") {
      try {
        const modsResp = await apiFetch(`/api/server/${serverName}/mods`);
        const modsData = await modsResp.json();
        const mods = modsData.mods || modsData || [];
        if (Array.isArray(mods) && mods.length > 0) {
          if (config.forge_version) serverType = "forge";
          else if (config.loader_version || config.server_type === "fabric")
            serverType = "fabric";
          else serverType = "fabric";
        }
      } catch (e) {
        console.warn(
          "serverConfig: failed to check installed mods for",
          serverName,
          e,
        );
      }
    }
    if (serverName.toLowerCase().includes("fabric") && serverType === "paper")
      serverType = "fabric";
    if (!serverType) serverType = "paper";
    if (config && config.server_type) serverType = config.server_type;
    if (serverType === "forge") window.currentServerLoader = "forge";
    else if (serverType === "fabric") window.currentServerLoader = "fabric";
    else if (serverType === "neoforge") window.currentServerLoader = "neoforge";
    else if (serverType === "quilt") window.currentServerLoader = "quilt";
    else if (serverType === "paper") window.currentServerLoader = null;
    if (serverType === "fabric" || serverType === "forge") {
      try {
        document.querySelector('.tab[data-view="mods"]').style.display = "";
      } catch (e) {}
      try {
        document.querySelector('.tab[data-view="plugins"]').style.display = "";
      } catch (e) {}
    }
  } catch (e) {
    console.warn("applyServerConfigContext failed", e);
  }
}

// Refresh installed mods helper placeholder; real implementation remains in mcp_mods.js
async function refreshInstalledMods() {
  try {
    if (typeof window.loadModsForCurrentServer === "function")
      await window.loadModsForCurrentServer("");
  } catch (e) {
    console.warn("refreshInstalledMods failed", e);
  }
}

// Select server and manage details view
function selectServer(serverName) {
  try {
    window.currentServer = serverName;
    if (typeof showSection === "function") showSection("servers");

    const listView = document.getElementById("servers-list-view");
    const detailView = document.getElementById("server-detail-view");
    const detailName = document.getElementById("detail-server-name");
    if (listView) listView.style.display = "none";
    if (detailView) detailView.style.display = "block";
    if (detailName) detailName.textContent = serverName;
    updateServerAddressDisplay(serverName, "25565");
    try {
      reloadServerIcon(serverName);
    } catch (e) {
      console.warn("selectServer: reloadServerIcon failed", e);
    }
    document.querySelectorAll(".server-item").forEach((item) => {
      item.classList.toggle("active", item.textContent.trim() === serverName);
    });
    try {
      updateStatus();
    } catch (e) {}
    (async () => {
      try {
        const cfgRes = await apiFetch(
          `/api/server/${encodeURIComponent(serverName)}/config?t=${Date.now()}`,
        );
        const cfg = await (cfgRes.ok ? cfgRes.json() : {});
        await applyServerConfigContext(serverName, cfg, true);
      } catch (e) {
        console.warn("selectServer: failed to fetch config for UI sync", e);
      }
      try {
        if (document.querySelector(".tab.active")?.dataset?.view === "mods")
          loadModsForCurrentServer("");
      } catch (e) {}
    })();
  } catch (e) {
    console.warn("selectServer failed", e);
  }
}

// Initialization to expose functions
function initState() {
  globalThis.loadUserPreferences = loadUserPreferences;
  globalThis.saveUserPreferences = saveUserPreferences;
  globalThis.loadCommandHistory = loadCommandHistory;
  globalThis.saveCommandHistory = saveCommandHistory;
  globalThis.loadFavoriteCommands = loadFavoriteCommands;
  globalThis.saveFavoriteCommands = saveFavoriteCommands;
  globalThis.addFavoriteCommand = addFavoriteCommand;
  globalThis.removeFavoriteCommand = removeFavoriteCommand;
  globalThis.renderFavoriteCommands = renderFavoriteCommands;
  globalThis.runFavoriteCommand = runFavoriteCommand;
  globalThis.addCurrentCommandToFavorites = addCurrentCommandToFavorites;
  globalThis.loadServerList = loadServerList;
  globalThese = globalThis; // helper no-op for debugging
  globalThis._mcp_loadServerList = loadServerList;
  globalThis.reloadServerIcon = reloadServerIcon;
  globalThis._mcp_reloadServerIcon = reloadServerIcon;
  globalThis.applyServerConfigContext = applyServerConfigContext;
  globalThis.refreshInstalledMods = refreshInstalledMods;
  globalThis.selectServer = selectServer;
  globalThis._mcp_selectServer = selectServer;

  // Backwards compatibility for state vars (ensure they exist)
  globalThis.sessionStats = window.sessionStats = sessionStats;
  globalThis.userPreferences = window.userPreferences = userPreferences;
  globalThis.favoriteCommands = window.favoriteCommands = favoriteCommands;
}

try {
  initState();
} catch (e) {
  console.warn("initState failed", e);
}
