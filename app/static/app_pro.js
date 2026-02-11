// MCPanel JS - Ultimate Edition v2.0 with Visual Effects + 50 Improvements

// ================================
// GLOBAL STATE
// ================================
let currentServer = null;

// Ensure showSection is callable from inline onclicks even if the full script
// hasn't finished initializing or if an earlier runtime error prevented
// defining the real implementation. This stub will forward to the real
// implementation once available.
if (!globalThis.showSection) {
  globalThis.__queuedShowSection = globalThis.__queuedShowSection || [];
  globalThis.showSection = function (sectionName) {
    if (typeof globalThis.__real_showSection === "function") {
      try {
        return globalThis.__real_showSection(sectionName);
      } catch (e) {
        console.warn("showSection error", e);
      }
    }
    // queue call for later when real impl is ready
    globalThis.__queuedShowSection.push(sectionName);
  };
}

function onServerTypeChange() {
  const t = document.getElementById("server-type")?.value;
  document.getElementById("forge-version-group").style.display =
    t === "forge" ? "block" : "none"; // Show forge version group
  document.getElementById("fabric-loader-group").style.display =
    t === "fabric" ? "block" : "none";
}

// When server type changes in the create modal, reload version lists
function onServerTypeChangeDebounced() {
  onServerTypeChange();
  loadVersions();
  // Réafficher les onglets par défaut
  try {
    const modsTab = document.querySelector('.tab[data-view="mods"]');
    const pluginsTab = document.querySelector('.tab[data-view="plugins"]');
    if (modsTab) modsTab.style.display = "";
    if (pluginsTab) pluginsTab.style.display = "";
  } catch (e) {
    console.warn("onServerTypeChangeDebounced: failed to reset tabs", e);
  }

  // nothing else here
}

async function loadForgeBuilds(version) {
  try {
    const resp = await apiFetch(`/api/forge/builds/${version}`);
    const data = await resp.json();
    const select = document.getElementById("forge-version");
    if (select && data.builds) {
      select.innerHTML = data.builds
        .map(
          (b) =>
            `<option value="${b.full_version}">${b.forge_version}</option>`,
        )
        .join("");
    }
  } catch (e) {
    console.warn("Forge builds error", e);
  }
}

// Récupère et remplit la liste des loaders Fabric compatibles pour une version MC donnée
async function loadFabricLoaders(mcVersion) {
  try {
    const resp = await apiFetch(
      `/api/fabric/loaders/${encodeURIComponent(mcVersion)}`,
    );
    const data = await resp.json();
    const loaders = data.loaders || [];
    const select = document.getElementById("fabric-loader");
    if (select) {
      // Loaders peut être un tableau de strings ou d'objets {version, stable, ...}
      select.innerHTML = loaders
        .map((l) => {
          const version =
            typeof l === "object" && l !== null
              ? l.version || l.name || JSON.stringify(l)
              : String(l);
          return `<option value="${escapeHtmlAttr(version)}">${escapeHtml(version)}</option>`;
        })
        .join("");
    }
  } catch (e) {
    console.warn("Fabric loaders error", e);
  }
}
let logInterval = null;
let statusInterval = null;
let metricsInterval = null;
let mainChart = null;
let metricsHistory = { cpu: [], ram: [], timestamps: [] };
let currentUser = null;
let translations = {};
let currentLang = "fr";
let autoScroll = true;
let logFilter = "all";
let allLogs = [];
// Selected mods for creation
let selectedMods = [];
// Exposed for external callers and to make usage explicit for static analysis
globalThis.selectedMods = selectedMods;

// Render the selected mods area in the creation modal (no-op if UI removed)
function renderSelectedMods() {
  try {
    const container = document.getElementById("selected-mods");
    if (!container) return; // UI not present
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

globalThis.renderSelectedMods = renderSelectedMods;
let jobPoller = null;

// Current server context for mods (loader and MC version)
let currentServerLoader = null;
let currentServerMcVersion = null;

// Amélioration 1: Historique des commandes
let commandHistory = [];
let commandHistoryIndex = -1;
const MAX_COMMAND_HISTORY = 100;

// Amélioration 2: Cache système
const dataCache = {
  servers: null,
  versions: null,
  metrics: null,
  lastUpdate: {},
};
const CACHE_DURATION = 30000;

// Amélioration 3: Statistiques de session
const sessionStats = {
  startTime: Date.now(),
  apiCalls: 0,
  errors: 0,
  commandsSent: 0,
  notifications: 0,
};

// Amélioration 4: État de connexion
let isOnline = navigator.onLine;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Amélioration 5: Préférences utilisateur étendues
const userPreferences = {
  soundEnabled: true,
  desktopNotifications: false,
  compactMode: false,
  showTimestamps: true,
  logMaxLines: 1000,
  autoRefresh: true,
  refreshInterval: 5000,
};

// Amélioration 6: Commandes favorites
let favoriteCommands = [];

// Amélioration 7: Players en cache pour éviter les requêtes répétées
let cachedPlayers = {};

// Amélioration 8: Dernière activité
let lastActivity = Date.now();
const IDLE_TIMEOUT = 300000; // 5 minutes

// ================================
// INITIALISATION AMÉLIORÉE
// ================================

// Amélioration 9: Charger les préférences au démarrage
function loadUserPreferences() {
  const saved = localStorage.getItem("mcpanel_userprefs");
  if (saved) {
    try {
      Object.assign(userPreferences, JSON.parse(saved));
    } catch (e) {
      console.warn("Erreur chargement préférences:", e);
    }
  }

  // Charger l'historique des commandes
  loadCommandHistory();

  // Charger les commandes favorites
  loadFavoriteCommands();
  renderFavoriteCommands();

  try {
    const oldPwd = document.getElementById("old-password");
    const newPwd = document.getElementById("new-password");
    const confirmPwd = document.getElementById("confirm-password");
    const emailInp = document.getElementById("account-email");
    if (oldPwd) oldPwd.value = "";
    if (newPwd) newPwd.value = "";
    if (confirmPwd) confirmPwd.value = "";
    if (emailInp) emailInp.value = currentUser?.email || "";
  } catch (e) {
    console.warn(
      "loadUserPreferences: failed to restore password/email inputs",
      e,
    );
  }
}

function saveUserPreferences() {
  localStorage.setItem("mcpanel_userprefs", JSON.stringify(userPreferences));
}

// Amélioration 10: Charger l'historique des commandes
function loadCommandHistory() {
  const saved = localStorage.getItem("mcpanel_cmdhistory");
  if (saved) {
    try {
      commandHistory = JSON.parse(saved);
    } catch (e) {
      console.warn("loadCommandHistory: failed to parse stored history", e);
    }
  }
}

function saveCommandHistory() {
  localStorage.setItem(
    "mcpanel_cmdhistory",
    JSON.stringify(commandHistory.slice(0, 50)),
  );
}

// Amélioration 11: Commandes favorites
function loadFavoriteCommands() {
  const saved = localStorage.getItem("mcpanel_favcmds");
  if (saved) {
    try {
      favoriteCommands = JSON.parse(saved);
    } catch (e) {
      console.warn("loadFavoriteCommands: failed to parse favorites", e);
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
    showToast("success", "Commande ajoutée aux favoris");
    renderFavoriteCommands();
  }
}

function removeFavoriteCommand(cmd) {
  favoriteCommands = favoriteCommands.filter((c) => c !== cmd);
  saveFavoriteCommands();
  showToast("info", "Commande retirée des favoris");
  renderFavoriteCommands();
}

// Amélioration : Ajouter la commande actuelle aux favoris
function addCurrentCommandToFavorites() {
  const input = document.getElementById("cmd-input");
  const cmd = input?.value?.trim();
  if (cmd) {
    addFavoriteCommand(cmd);
  } else {
    showToast("info", "Entrez une commande d'abord");
  }
}

// Amélioration : Afficher les commandes favorites
function renderFavoriteCommands() {
  const list = document.getElementById("favorite-commands-list");
  if (!list) return;
  list.innerHTML = favoriteCommands
    .map((cmd) => {
      return `<div class="fav-command"><button class="plugin-favorite" onclick="runFavoriteCommand('${escapeHtmlAttr(cmd)}')">${escapeHtml(cmd)}</button> <button class="btn-icon btn-small" title="Retirer" onclick="removeFavoriteCommand('${escapeHtmlAttr(cmd)}')">×</button></div>`;
    })
    .join("");
}

function runFavoriteCommand(cmd) {
  const input = document.getElementById("cmd-input");
  if (!input) return;
  input.value = cmd;
  sendCommand();
}

// Amélioration 15: Navigation historique commandes
function handleCommandInput(event) {
  const input = document.getElementById("cmd-input");

  if (event.key === "Enter") {
    sendCommand();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (commandHistoryIndex < commandHistory.length - 1) {
      commandHistoryIndex++;
      input.value = commandHistory[commandHistoryIndex] || "";
    }
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    if (commandHistoryIndex > 0) {
      commandHistoryIndex--;
      input.value = commandHistory[commandHistoryIndex] || "";
    } else {
      commandHistoryIndex = -1;
      input.value = "";
    }
  } else if (event.key === "Tab") {
    event.preventDefault();
    autocompleteCommand();
  }
}

// Amélioration 16: Autocomplétion des commandes Minecraft
const MINECRAFT_COMMANDS = [
  "say",
  "tell",
  "msg",
  "whisper",
  "me",
  "teammsg",
  "kick",
  "ban",
  "ban-ip",
  "pardon",
  "pardon-ip",
  "banlist",
  "op",
  "deop",
  "whitelist add",
  "whitelist remove",
  "whitelist list",
  "whitelist on",
  "whitelist off",
  "gamemode survival",
  "gamemode creative",
  "gamemode adventure",
  "gamemode spectator",
  "time set day",
  "time set night",
  "time set noon",
  "time set midnight",
  "time add",
  "weather clear",
  "weather rain",
  "weather thunder",
  "difficulty peaceful",
  "difficulty easy",
  "difficulty normal",
  "difficulty hard",
  "give",
  "clear",
  "effect give",
  "effect clear",
  "enchant",
  "tp",
  "teleport",
  "spawnpoint",
  "setworldspawn",
  "spreadplayers",
  "kill",
  "summon",
  "setblock",
  "fill",
  "clone",
  "execute",
  "gamerule",
  "scoreboard",
  "title",
  "bossbar",
  "team",
  "stop",
  "save-all",
  "save-on",
  "save-off",
  "reload",
  "list",
  "seed",
  "plugins",
  "version",
  "tps",
  "gc",
  "worldborder set",
  "worldborder center",
  "worldborder add",
  "experience add",
  "experience set",
  "xp",
  "locate",
  "locatebiome",
  "playsound",
  "stopsound",
  "attribute",
  "damage",
  "data",
  "function",
  "schedule",
];

function autocompleteCommand() {
  const input = document.getElementById("cmd-input");
  if (!input) return;

  const value = input.value.toLowerCase();
  if (!value) return;

  const matches = MINECRAFT_COMMANDS.filter((cmd) =>
    cmd.toLowerCase().startsWith(value),
  );

  if (matches.length === 1) {
    input.value = matches[0] + " ";
  } else if (matches.length > 1) {
    showCommandSuggestions(matches);
  }
}

function showCommandSuggestions(suggestions) {
  let popup = document.getElementById("cmd-suggestions");
  const wrapper = document.querySelector(".console-input");

  if (!popup && wrapper) {
    popup = document.createElement("div");
    popup.id = "cmd-suggestions";
    popup.className = "cmd-suggestions";
    wrapper.appendChild(popup);
  }

  if (popup) {
    popup.innerHTML = suggestions
      .slice(0, 10)
      .map(
        (s) =>
          `<div class="cmd-suggestion" onclick="selectSuggestion('${s}')">${s}</div>`,
      )
      .join("");
    popup.style.display = "block";

    setTimeout(() => {
      popup.style.display = "none";
    }, 5000);
  }
}

function selectSuggestion(cmd) {
  const input = document.getElementById("cmd-input");
  if (input) {
    input.value = cmd + " ";
    input.focus();
  }

  const popup = document.getElementById("cmd-suggestions");
  if (popup) popup.style.display = "none";
}

// Expose functions used by inline handlers so static analysis recognizes usage
try {
  globalThis.runFavoriteCommand = runFavoriteCommand;
  globalThis.removeFavoriteCommand = removeFavoriteCommand;
  globalThis.addFavoriteCommand = addFavoriteCommand;
  globalThis.handleCommandInput = handleCommandInput;
  globalThis.selectSuggestion = selectSuggestion;
  globalThis.addCurrentCommandToFavorites = addCurrentCommandToFavorites;
  globalThis.copyToClipboard = copyToClipboard;
  globalThis.importPreferences = importPreferences;
  globalThis.sendDesktopNotification = sendDesktopNotification;
  globalThis.robustFetch = robustFetch;
} catch (e) {
  console.warn("Failed to expose inline handlers to globalThis", e);
}

// Debounce/throttle helpers: canonical implementations are defined later (kept singular)

// Amélioration 19: Notifications de bureau
function requestNotificationPermission() {
  if (
    "Notification" in globalThis &&
    globalThis.Notification.permission === "default"
  ) {
    Notification.requestPermission();
  }
}

function sendDesktopNotification(title, body, icon = "/static/icon.png") {
  if (!userPreferences.desktopNotifications) return;
  if (
    "Notification" in globalThis &&
    globalThis.Notification.permission === "granted"
  ) {
    new Notification(title, { body, icon });
  }
}

// Connection detection: monitor online/offline and probe a simple ping endpoint
function setupConnectionDetection() {
  if (globalThis.__mcp_setupConnectionDetectionDone) return;
  globalThis.__mcp_setupConnectionDetectionDone = true;

  try {
    window.addEventListener("online", () => {
      isOnline = true;
      reconnectAttempts = 0;
      try {
        showToast("Connexion rétablie", "success");
      } catch (e) {}
    });
    window.addEventListener("offline", () => {
      isOnline = false;
      try {
        showToast("Hors-ligne", "warning");
      } catch (e) {}
    });

    // lightweight poll to detect backend availability
    setInterval(async () => {
      if (!navigator.onLine) {
        isOnline = false;
        return;
      }
      try {
        const r = await fetch("/api/ping", { cache: "no-store" });
        isOnline = r.ok;
      } catch (e) {
        isOnline = false;
      }
    }, 30000);
  } catch (e) {
    console.warn("setupConnectionDetection failed", e);
  }
}

// Idle detection: update lastActivity on user events
function setupIdleDetection() {
  if (globalThis.__mcp_setupIdleDetectionDone) return;
  globalThis.__mcp_setupIdleDetectionDone = true;
  try {
    const handler = () => {
      lastActivity = Date.now();
      if (sleepMode) {
        sleepMode = false;
        try {
          showToast("Activité détectée — réveil", "info");
        } catch (e) {}
      }
    };
    ["mousemove", "keydown", "scroll", "touchstart", "click"].forEach((ev) =>
      document.addEventListener(ev, handler, { passive: true }),
    );
  } catch (e) {
    console.warn("setupIdleDetection failed", e);
  }
}

// Global shortcuts for convenience (idempotent)
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

// Amélioration 20: Sons de notification
function playNotificationSound(type = "info") {
  if (!userPreferences.soundEnabled) return;

  // Utiliser l'API Web Audio pour jouer un son simple
  try {
    const audioContext = new (
      globalThis.AudioContext || globalThis.webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const frequencies = {
      success: 800,
      error: 300,
      warning: 500,
      info: 600,
    };

    oscillator.frequency.value = frequencies[type] || 600;
    oscillator.type = "sine";
    gainNode.gain.value = 0.1;

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    console.warn("playSound: audio playback failed", e);
  }
}

// ================================
// Améliorations 21 à 60 : Robustesse avancée
// ================================

// Amélioration 21: Surveillance mémoire JS
setInterval(() => {
  if (globalThis.performance?.memory) {
    sessionStats.jsHeap = performance.memory.usedJSHeapSize;
  }
}, 10000);

// Amélioration 22: Nettoyage à la fermeture (utiliser pagehide au lieu de unload)
globalThis.addEventListener("pagehide", () => {
  // Nettoyage global - sauvegarder les préférences
  try {
    saveUserPreferences();
  } catch (e) {
    console.warn("saveUserPreferences failed", e);
  }
});

// Amélioration 23: Limitation du nombre d'API calls simultanés
let apiCallCount = 0;
const MAX_API_CALLS = 5;

// Amélioration 24: Retry automatique sur fetch réseau
async function robustFetch(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      apiCallCount++;
      if (apiCallCount > MAX_API_CALLS)
        throw new Error("Trop d'appels API simultanés");
      const res = await fetch(url, options);
      apiCallCount--;
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    } catch (e) {
      apiCallCount--;
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// Amélioration 25: Timeout sur fetch
const fetchWithTimeout = async (url, options = {}, timeout = 8000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeout),
    ),
  ]);
};

// Amélioration 26: Validation stricte des entrées utilisateur
const validateInput = (str, type = "text") => {
  if (typeof str !== "string") return false;
  if (type === "text") return str.length < 200 && !/\0/.test(str);
  if (type === "cmd") return /^\/?[a-z0-9_\- ]+$/i.test(str);
  return true;
};

// Amélioration 27: Historique des erreurs JS
let jsErrorLog = [];
globalThis.addEventListener("error", (e) => {
  jsErrorLog.push({
    message: e.message,
    file: e.filename,
    line: e.lineno,
    time: Date.now(),
  });
  if (jsErrorLog.length > 100) jsErrorLog.shift();
});

// Amélioration 28: Affichage d'un message d'erreur global
function showGlobalError(msg) {
  let el = document.getElementById("global-error");
  if (!el) {
    el = document.createElement("div");
    el.id = "global-error";
    el.style =
      "position:fixed;top:0;left:0;width:100vw;background:#c00;color:#fff;z-index:9999;padding:8px;text-align:center;font-weight:bold;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  setTimeout(() => {
    el.remove();
  }, 8000);
}

// Amélioration 29: Mode dégradé si API down
async function checkApiHealth() {
  try {
    await fetch("/api/ping", { cache: "no-store" });
    document.body.classList.remove("api-down");
  } catch (e) {
    document.body.classList.add("api-down");
    showGlobalError("API injoignable");
    console.warn("checkApiHealth failed", e);
  }
}
setInterval(checkApiHealth, 15000);

// Amélioration 30: Limitation du spam de notifications
// throttledNotify and saveLogsToFile are currently unused and removed to reduce code noise.

// Amélioration 32: Nettoyage périodique du cache
setInterval(() => {
  for (const k in dataCache) {
    if (
      dataCache[k] &&
      Date.now() - (dataCache.lastUpdate[k] || 0) > CACHE_DURATION * 2
    ) {
      dataCache[k] = null;
    }
  }
}, 60000);

// Amélioration 33: Mode compact automatique sur mobile
if (globalThis.innerWidth < 600) userPreferences.compactMode = true;

// Amélioration 34: Affichage du temps de réponse API
const timedFetch = async (url, options) => {
  const t0 = performance.now();
  const res = await fetch(url, options);
  const t1 = performance.now();
  sessionStats.apiLastResponse = t1 - t0;
  return res;
};

// Amélioration 35: Affichage du statut réseau
globalThis.addEventListener("online", () =>
  showGlobalError("Connexion rétablie"),
);
globalThis.addEventListener("offline", () =>
  showGlobalError("Connexion perdue"),
);

// Amélioration 36: Limite de lignes dans la console (handled inline where needed)

// Amélioration 38: Affichage du nombre de joueurs connectés
// updatePlayerCount removed (unused)

// Amélioration 39: Mode sombre automatique selon l'heure
function autoDarkMode() {
  const h = new Date().getHours();
  document.body.classList.toggle("dark", h < 8 || h > 19);
}
setInterval(autoDarkMode, 60000);

// Amélioration 40: Protection contre double clic sur boutons critiques
// preventDoubleClick removed (unused)

// Amélioration 41: Affichage de la version du client
function showClientVersion() {
  let el = document.getElementById("client-version");
  if (!el) {
    el = document.createElement("div");
    el.id = "client-version";
    el.style =
      "position:fixed;bottom:0;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;";
    document.body.appendChild(el);
  }
  el.textContent = "MCPanel Ultimate v2.0 - 2025-12-06";
}
showClientVersion();

// Amélioration 42: Affichage du temps de session
setInterval(() => {
  let el = document.getElementById("session-time");
  if (!el) {
    el = document.createElement("div");
    el.id = "session-time";
    el.style =
      "position:fixed;bottom:0;left:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;";
    document.body.appendChild(el);
  }
  const d = Math.floor((Date.now() - sessionStats.startTime) / 1000);
  el.textContent = "Session: " + Math.floor(d / 60) + "m" + (d % 60) + "s";
}, 10000);

// Amélioration 43: Mode accessibilité (tabindex sur boutons)
document
  .querySelectorAll("button")
  .forEach((b) => b.setAttribute("tabindex", "0"));

// Amélioration 44: Focus automatique sur la console à l'ouverture
globalThis.addEventListener("load", () => {
  const c = document.getElementById("console-input");
  if (c) c.focus();
  // Attach modal related events
  try {
    const ver = document.getElementById("server-version");
    const type = document.getElementById("server-type");
    if (ver)
      ver.addEventListener("change", (e) => {
        const v = e.target.value;
        const t = type?.value || "paper";
        if (t === "forge") loadForgeBuilds(v);
        if (t === "fabric") loadFabricLoaders(v);
      });
    if (type)
      type.addEventListener("change", () => {
        onServerTypeChange();
      });
  } catch (e) {
    console.warn("attach modal events failed", e);
  }
});

// Amélioration 50: Mode veille automatique (désactive les requêtes)
let sleepMode = false;
setInterval(() => {
  if (Date.now() - lastActivity > IDLE_TIMEOUT) sleepMode = true;
  else sleepMode = false;
}, 10000);

// ================================
// Améliorations 61 à 100 : Fonctionnalités avancées
// ================================

// Amélioration 61: Système de confirmation pour actions critiques
function confirmAction(message, callback) {
  const modal = document.createElement("div");
  modal.className = "confirm-modal";
  modal.innerHTML = `
        <div class="confirm-content">
            <p>${message}</p>
            <button class="btn-confirm">Confirmer</button>
            <button class="btn-cancel">Annuler</button>
        </div>
    `;
  modal.style.cssText =
    "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;";
  modal.querySelector(".confirm-content").style.cssText =
    "background:#1e1e2e;padding:30px;border-radius:12px;text-align:center;";
  modal.querySelector(".btn-confirm").style.cssText =
    "background:#4CAF50;color:#fff;border:none;padding:10px 20px;margin:10px;border-radius:6px;cursor:pointer;";
  modal.querySelector(".btn-cancel").style.cssText =
    "background:#f44336;color:#fff;border:none;padding:10px 20px;margin:10px;border-radius:6px;cursor:pointer;";
  modal.querySelector(".btn-confirm").onclick = () => {
    modal.remove();
    callback();
  };
  modal.querySelector(".btn-cancel").onclick = () => modal.remove();
  document.body.appendChild(modal);
}

// Amélioration 63: Export des données de session
// exportSessionData removed (unused)

// Amélioration 64: Import des préférences
async function importPreferences(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.userPreferences) {
      Object.assign(userPreferences, data.userPreferences);
      saveUserPreferences();
      showNotification("Préférences importées", "success");
    }
  } catch (e) {
    console.warn("importPreferences failed", e);
    showNotification("Erreur d'import", "error");
  }
}

// Amélioration 65: Système de thèmes personnalisés
const customThemes = {
  default: { bg: "#1e1e2e", text: "#fff", accent: "#8b5cf6" },
  ocean: { bg: "#0d1b2a", text: "#e0e1dd", accent: "#3a86ff" },
  forest: { bg: "#1b4332", text: "#d8f3dc", accent: "#40916c" },
  sunset: { bg: "#2d1b3d", text: "#ffeedd", accent: "#ff6b6b" },
};

function applyCustomTheme(themeName) {
  const theme = customThemes[themeName] || customThemes.default;
  document.documentElement.style.setProperty("--bg-primary", theme.bg);
  document.documentElement.style.setProperty("--text-primary", theme.text);
  document.documentElement.style.setProperty("--accent", theme.accent);
  localStorage.setItem("mcpanel_theme", themeName);
}

// Charge le thème courant (mode sombre/clair + thème personnalisé)
function loadTheme() {
  try {
    // Init theme manager (dark/light)
    if (globalThis.themeManager?.init) globalThis.themeManager.init();

    // Apply saved custom theme if any
    const custom = localStorage.getItem("mcpanel_theme");
    if (custom) applyCustomTheme(custom);
  } catch (e) {
    console.warn("Erreur loadTheme():", e);
  }
}

// Amélioration 66: Détection du type de serveur
const detectServerType = (serverName) => {
  const types = {
    paper: /paper/i,
    spigot: /spigot/i,
    bukkit: /bukkit/i,
    vanilla: /vanilla/i,
    forge: /forge/i,
    fabric: /fabric/i,
  };
  for (const [type, regex] of Object.entries(types)) {
    if (regex.test(serverName)) return type;
  }
  return "unknown";
};

// Amélioration 67: Formatage automatique des tailles
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) +
    " " +
    sizes[i]
  );
};

// Amélioration 68: Formatage automatique des durées
const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return d + "j " + (h % 24) + "h";
  if (h > 0) return h + "h " + (m % 60) + "m";
  if (m > 0) return m + "m " + (s % 60) + "s";
  return s + "s";
};

// Amélioration 69: Détection des patterns d'erreur dans les logs
const errorPatterns = [
  /\[ERROR\]/i,
  /\[SEVERE\]/i,
  /\[FATAL\]/i,
  /Exception/i,
  /Error:/i,
  /Failed to/i,
  /Could not/i,
  /Unable to/i,
];

function isErrorLine(line) {
  return errorPatterns.some((p) => p.test(line));
}

// Amélioration 70: Compteur d'erreurs dans les logs
function countLogErrors() {
  return allLogs.filter(isErrorLine).length;
}

// Amélioration 71: Extraction des IPs des joueurs
function extractPlayerIPs() {
  const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
  const ips = new Set();
  allLogs.forEach((line) => {
    const matches = line.match(ipRegex);
    if (matches) matches.forEach((ip) => ips.add(ip));
  });
  return Array.from(ips);
}

// Amélioration 72: Détection des crashes serveur
const detectCrashes = () => {
  const crashPatterns = [
    /server crashed/i,
    /OutOfMemoryError/i,
    /StackOverflowError/i,
    /server is stopping/i,
  ];
  return allLogs.filter((line) => crashPatterns.some((p) => p.test(line)));
};

// Analyse les lignes de crash pour extraire un mod potentiellement en cause
function analyzeCrash(lines) {
  const text = lines.join("\n");
  const info = { raw: text };

  // 1) Detect suggested Minecraft version change from lines like "Replace 'Minecraft' ... with version 1.21.10"
  const mcReplace =
    text.match(
      /Replace\s+'Minecraft'[\s\S]*?with(?: any version)?\s*([0-9]+\.[0-9]+\.[0-9]+)/i,
    ) ||
    text.match(
      /replace\[\[minecraft.*?-> add:minecraft\s*([0-9]+\.[0-9]+\.[0-9]+)/i,
    );
  if (mcReplace) info.suggested_minecraft_version = mcReplace[1];

  // 2) Detect explicit mod incompatibilities
  const modLines = [];
  const modRegex =
    /Mod\s+'([^']+)'\s*\(([^)]+)\)[\s\S]*?requires(?: any version)?(?: between)?\s*([0-9\.\-\[\],<>]*)/gi;
  let m;
  while ((m = modRegex.exec(text)) !== null) {
    modLines.push({ name: m[1], slug: m[2], required: (m[3] || "").trim() });
  }
  if (modLines.length > 0) info.offending_mods = modLines;

  // 3) Find filenames referenced
  const fileMatch = text.match(/([\w\-]+(?:\.jar))/i);
  if (fileMatch) info.filename = fileMatch[1];

  // 4) Generic markers
  if (
    /Incompatible mods found|Mod resolution failed|Some of your mods are incompatible/i.test(
      text,
    )
  ) {
    info.reason = "Incompatible mods detected";
  }

  if (
    info.suggested_minecraft_version ||
    info.offending_mods ||
    info.filename ||
    info.reason
  )
    return info;
  return null;
}

// Periodically check logs for new crashes and notify + highlight offending mod
let __lastCrashCount = 0;
async function checkForCrashes() {
  try {
    const crashes = detectCrashes();
    // If no crashes anymore, remove banner
    if (crashes.length === 0 && __lastCrashCount > 0) {
      __lastCrashCount = 0;
      try {
        document.getElementById("mcp-crash-banner")?.remove();
      } catch (e) {}
    }

    if (crashes.length > __lastCrashCount) {
      const newLines = crashes.slice(__lastCrashCount);
      __lastCrashCount = crashes.length;
      const info = analyzeCrash(newLines);
      const message = info
        ? `Serveur crashé: ${info.name || info.filename || info.reason}`
        : "Serveur crashé!";
      try {
        showToast("error", message);
      } catch (e) {
        console.warn("showToast in checkForCrashes failed", e);
      }

      // If we have offending mods (array) prefer slug/name, otherwise filename
      let offending = null;
      if (
        info?.offending_mods &&
        Array.isArray(info.offending_mods) &&
        info.offending_mods.length > 0
      ) {
        offending =
          info.offending_mods[0].slug || info.offending_mods[0].name || null;
      }
      if (!offending) offending = info?.filename || info?.slug || info?.name;
      if (offending) {
        document
          .querySelectorAll("#fabric-installed-mods .installed-mod-row")
          .forEach((el) => {
            try {
              if (el.textContent && el.textContent.includes(offending)) {
                el.classList.add("mod-offending");
              } else {
                el.classList.remove("mod-offending");
              }
            } catch (e) {}
          });
        // Also show a persistent banner at top
        try {
          showCrashBanner(offending, message, info);
        } catch (e) {
          console.warn("showCrashBanner failed", e);
        }
      }
    }
  } catch (e) {
    console.warn("checkForCrashes failed", e);
  }
}

setInterval(checkForCrashes, 5000);

// Show a persistent banner indicating offending mod/server crash
function showCrashBanner(offending, message, info = null) {
  try {
    let banner = document.getElementById("mcp-crash-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "mcp-crash-banner";
      banner.className = "mcp-crash-banner";
      banner.innerHTML = `<div id="mcp-crash-message"></div><div><button class="close-btn" onclick="document.getElementById('mcp-crash-banner')?.remove()">×</button></div>`;
      document.body.appendChild(banner);
      // load style
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/static/crash_banner.css";
      document.head.appendChild(link);
    }
    const msgEl = document.getElementById("mcp-crash-message");
    if (msgEl) msgEl.textContent = `${message} — probable mod: ${offending}`;
    // Add action buttons if applicable
    const btnsId = "mcp-crash-actions";
    let btns = document.getElementById(btnsId);
    if (!btns) {
      btns = document.createElement("div");
      btns.id = btnsId;
      btns.style.marginLeft = "12px";
      banner.querySelector("div").appendChild(btns);
    }
    btns.innerHTML = "";
    // Add uninstall button
    const uninstallBtn = document.createElement("button");
    uninstallBtn.className = "btn btn-danger";
    uninstallBtn.textContent = `Désinstaller ${offending}`;
    uninstallBtn.onclick = async () => {
      if (!currentServer) return showToast("error", "Sélectionnez un serveur");
      if (!confirm(`Désinstaller ${offending} ?`)) return;
      uninstallBtn.disabled = true;
      uninstallBtn.textContent = "Désinstallation...";
      try {
        const res = await uninstallModByIdentifier(offending);
        showToast("success", res.message || "Mod désinstallé");
        await refreshInstalledMods();
        // remove banner if it referenced this mod
        try {
          document.getElementById("mcp-crash-banner")?.remove();
        } catch (e) {}
      } catch (e) {
        console.error("uninstallModByIdentifier failed", e);
        showToast("error", e.message || "Erreur désinstallation");
      } finally {
        uninstallBtn.disabled = false;
        uninstallBtn.textContent = `Désinstaller ${offending}`;
      }
    };
    // Add change version button if suggested version present in message
    const verMatch = message.match(/([0-9]+\.[0-9]+\.[0-9]+)/);
    if (verMatch) {
      const ver = verMatch[1];
      const verBtn = document.createElement("button");
      verBtn.className = "btn btn-secondary";
      verBtn.style.marginLeft = "8px";
      verBtn.textContent = `Changer version Minecraft → ${ver}`;
      verBtn.onclick = async () => {
        if (!currentServer)
          return showToast("error", "Sélectionnez un serveur");
        if (!confirm(`Définir la version du serveur à ${ver} et redémarrer ?`))
          return;
        try {
          await apiJson(
            `/api/server/${encodeURIComponent(currentServer)}/meta`,
            { method: "POST", body: JSON.stringify({ version: ver }) },
          );
          showToast("success", `Version définie à ${ver}`);
        } catch (e) {
          console.error("set version failed", e);
          showToast("error", "Erreur définition version");
        }
      };
      btns.appendChild(verBtn);
    }
    btns.appendChild(uninstallBtn);
    // Add mini-wizard button to propose multiple corrective actions
    const wizardBtn = document.createElement("button");
    wizardBtn.className = "btn btn-primary";
    wizardBtn.style.marginLeft = "8px";
    wizardBtn.textContent = "Assistant de réparation";
    wizardBtn.title =
      "Ouvrir l'assistant pour proposer des actions (désinstaller, changer version)";
    wizardBtn.onclick = () => {
      try {
        openMiniWizard(info || { filename: offending, raw: message });
      } catch (e) {
        console.warn("openMiniWizard failed", e);
      }
    };
    btns.appendChild(wizardBtn);
  } catch (e) {
    console.warn("showCrashBanner failed", e);
  }
}

// Mini-wizard modal: propose actions based on crash analysis
async function openMiniWizard(info) {
  if (!currentServer) return showToast("error", "Sélectionnez un serveur");
  try {
    // Fetch installed mods
    const r = await apiFetch(`/api/server/${currentServer}/mods`);
    const d = await r.json();
    const installed = Array.isArray(d.mods) ? d.mods : [];

    const modal = document.createElement("div");
    modal.className = "modal confirm-modal show";
    modal.innerHTML = `
            <div class="modal-content confirm-content" style="max-width:800px;">
                <div class="modal-header"><h2><i class="fas fa-tools"></i> Assistant de réparation</h2></div>
                <div class="modal-body" style="max-height:60vh;overflow:auto;">
                    <p>Actions proposées pour <strong>${escapeHtml(currentServer)}</strong> :</p>
                    <div style="margin-bottom:12px;">
                        <label><input type="checkbox" id="wiz-apply-version"> Appliquer changement de version suggérée :</label>
                        <input id="wiz-version-input" class="input-small" style="width:150px;margin-left:8px;" />
                        <div id="wiz-version-note" style="font-size:0.9em;opacity:0.8;margin-top:6px"></div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <strong>Mods suspects (sélectionnés par défaut):</strong>
                        <div id="wiz-suspects" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>
                    </div>
                    <div>
                        <strong>Mods installés (optionnel):</strong>
                        <div id="wiz-installed" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>
                    </div>
                </div>
                <div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                    <button class="btn btn-secondary btn-cancel">Annuler</button>
                    <button class="btn btn-primary btn-apply">Appliquer les actions</button>
                </div>
            </div>`;

    document.body.appendChild(modal);

    // Prefill version if available
    if (info && info.suggested_minecraft_version) {
      modal.querySelector("#wiz-apply-version").checked = true;
      modal.querySelector("#wiz-version-input").value =
        info.suggested_minecraft_version;
      modal.querySelector("#wiz-version-note").textContent =
        `Version suggérée détectée: ${info.suggested_minecraft_version}`;
    } else {
      modal.querySelector("#wiz-apply-version").checked = false;
      modal.querySelector("#wiz-version-input").value = "";
      modal.querySelector("#wiz-version-note").textContent = "";
    }

    // Fill suspects
    const suspectsEl = modal.querySelector("#wiz-suspects");
    if (
      info &&
      Array.isArray(info.offending_mods) &&
      info.offending_mods.length
    ) {
      info.offending_mods.forEach((m) => {
        const id = `suspect-${Math.random().toString(36).slice(2, 8)}`;
        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.innerHTML = `<input type="checkbox" id="${id}" data-identifier="${escapeHtmlAttr(m.slug || m.name || "")}" checked style="margin-right:8px"> ${escapeHtml(m.name || m.slug || "")} <span style="opacity:0.7;margin-left:6px;font-size:0.9em">(${escapeHtml(m.required || "")})</span>`;
        suspectsEl.appendChild(row);
      });
    } else if (info && info.filename) {
      const id = `suspect-${Math.random().toString(36).slice(2, 8)}`;
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.innerHTML = `<input type="checkbox" id="${id}" data-identifier="${escapeHtmlAttr(info.filename)}" checked style="margin-right:8px"> ${escapeHtml(info.filename)}`;
      suspectsEl.appendChild(row);
    } else {
      suspectsEl.innerHTML =
        '<div class="text-muted">Aucun mod suspect détecté automatiquement.</div>';
    }

    // Fill installed mods list
    const installedEl = modal.querySelector("#wiz-installed");
    if (installed && installed.length) {
      installed.slice(0, 200).forEach((m) => {
        const id = `inst-${Math.random().toString(36).slice(2, 8)}`;
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.innerHTML = `<input type="checkbox" id="${id}" data-identifier="${escapeHtmlAttr(m.filename || m.slug || m.name || "")}" style="margin-right:8px"> ${escapeHtml(m.filename || m.name || m.slug || "")}`;
        installedEl.appendChild(label);
      });
    } else {
      installedEl.innerHTML =
        '<div class="text-muted">Aucun mod détecté sur ce serveur.</div>';
    }

    // Button handlers
    modal.querySelector(".btn-cancel").onclick = () => modal.remove();
    modal.querySelector(".btn-apply").onclick = async () => {
      const applyBtn = modal.querySelector(".btn-apply");
      applyBtn.disabled = true;
      try {
        // Collect selected uninstalls from suspects and installed
        const toUninstall = [];
        modal
          .querySelectorAll(
            "#wiz-suspects input[type=checkbox], #wiz-installed input[type=checkbox]",
          )
          .forEach((cb) => {
            if (cb.checked)
              toUninstall.push(cb.getAttribute("data-identifier"));
          });

        // Apply version change if requested
        if (modal.querySelector("#wiz-apply-version").checked) {
          const ver = modal.querySelector("#wiz-version-input").value.trim();
          if (ver) {
            try {
              await apiJson(
                `/api/server/${encodeURIComponent(currentServer)}/meta`,
                { method: "POST", body: JSON.stringify({ version: ver }) },
              );
              showToast("success", `Version définie à ${ver}`);
            } catch (e) {
              console.error("set version failed", e);
              showToast("error", "Erreur définition version");
            }
          }
        }

        // Uninstall selected mods sequentially
        for (const id of toUninstall) {
          try {
            showToast("info", `Désinstallation ${id}...`);
            await uninstallModByIdentifier(id);
            showToast("success", `${id} désinstallé`);
          } catch (e) {
            console.warn("wizard uninstall failed for", id, e);
            showToast("error", `Erreur désinstallation ${id}`);
          }
        }

        // Refresh UI
        try {
          await refreshInstalledMods();
        } catch (e) {
          console.warn("refresh after wizard failed", e);
        }
        // Close modal and remove crash banner if applicable
        modal.remove();
        try {
          document.getElementById("mcp-crash-banner")?.remove();
        } catch (e) {}
      } finally {
        applyBtn.disabled = false;
      }
    };
  } catch (e) {
    console.warn("openMiniWizard failed", e);
    showToast("error", "Impossible d'ouvrir l'assistant");
  }
}

// Amélioration 73: Système de bookmarks pour les logs
let logBookmarks = [];

function addLogBookmark(lineIndex, note = "") {
  logBookmarks.push({ index: lineIndex, note, time: Date.now() });
  localStorage.setItem("mcpanel_bookmarks", JSON.stringify(logBookmarks));
}

function loadLogBookmarks() {
  try {
    logBookmarks = JSON.parse(
      localStorage.getItem("mcpanel_bookmarks") || "[]",
    );
  } catch (e) {
    logBookmarks = [];
    console.warn("loadLogBookmarks failed", e);
  }
}

// Amélioration 74: Recherche dans les logs
const searchLogsArray = (query, caseSensitive = false) => {
  const regex = new RegExp(query, caseSensitive ? "g" : "gi");
  return allLogs
    .map((line, i) => ({ line, index: i }))
    .filter((l) => regex.test(l.line));
};

// Amélioration 75: Statistiques des logs
function getLogStats() {
  return {
    total: allLogs.length,
    warnings: allLogs.filter((l) => /\[WARN\]/i.test(l)).length,
    info: allLogs.filter((l) => /\[INFO\]/i.test(l)).length,
    players: extractPlayerIPs().length,
  };
}

// Amélioration 76: Système de macros personnalisées
let userMacros = {};

function saveMacro(name, commands) {
  userMacros[name] = commands;
  localStorage.setItem("mcpanel_macros", JSON.stringify(userMacros));
}

function loadMacros() {
  try {
    userMacros = JSON.parse(localStorage.getItem("mcpanel_macros") || "{}");
  } catch (e) {
    userMacros = {};
    console.warn("loadUserMacros failed", e);
  }
}

function executeMacro(name) {
  const commands = userMacros[name];
  if (!commands) return;
  commands.forEach((cmd, i) => {
    setTimeout(() => sendCommand(cmd), i * 500);
  });
}

// Amélioration 77: Planification de commandes
let scheduledCommands = [];

function scheduleCommand(cmd, delayMs) {
  const id = setTimeout(() => {
    sendCommand(cmd);
    scheduledCommands = scheduledCommands.filter((s) => s.id !== id);
  }, delayMs);
  scheduledCommands.push({ id, cmd, executeAt: Date.now() + delayMs });
}

function cancelScheduledCommand(id) {
  clearTimeout(id);
  scheduledCommands = scheduledCommands.filter((s) => s.id !== id);
}

// Amélioration 78: Système de templates de serveur
const serverTemplates = {
  survival: { gamemode: "survival", difficulty: "normal", pvp: true },
  creative: { gamemode: "creative", difficulty: "peaceful", pvp: false },
  hardcore: { gamemode: "survival", difficulty: "hard", hardcore: true },
  minigames: { gamemode: "adventure", difficulty: "normal", pvp: true },
};

// Expose utility functions/collections to global scope so they can be used by UI
try {
  globalThis.fetchWithTimeout = fetchWithTimeout;
  globalThis.validateInput = validateInput;
  globalThis.timedFetch = timedFetch;
  globalThis.detectServerType = detectServerType;
  globalThis.countLogErrors = countLogErrors;
  globalThis.detectCrashes = detectCrashes;
  globalThis.addLogBookmark = addLogBookmark;
  globalThis.loadLogBookmarks = loadLogBookmarks;
  globalThis.searchLogsArray = searchLogsArray;
  globalThis.getLogStats = getLogStats;
  globalThis.saveMacro = saveMacro;
  globalThis.executeMacro = executeMacro;
  globalThis.scheduleCommand = scheduleCommand;
  globalThis.cancelScheduledCommand = cancelScheduledCommand;
  globalThis.serverTemplates = serverTemplates;
  globalThis.scheduledCommands = scheduledCommands;
  globalThis.userMacros = userMacros;
  // Expose additional helpers used by UI or templates
  globalThis.toggleFavoriteServer = toggleFavoriteServer;
  globalThis.toggleFavoritePlugin = toggleFavoritePlugin;
  globalThis.saveWidgetLayout = saveWidgetLayout;
  globalThis.loadWidgetLayout = loadWidgetLayout;
  globalThis.addCustomAlert = addCustomAlert;
  globalThis.checkCustomAlerts = checkCustomAlerts;
  globalThis.detectBottlenecks = detectBottlenecks;
  globalThis.toggleHighPerfMode = toggleHighPerfMode;
  globalThis.setUserCustomShortcut = setUserCustomShortcut;
  globalThis.saveServerNote = saveServerNote;
  globalThis.logAction = logAction;
  globalThis.pushUndo = pushUndo;
  globalThis.undo = undo;
  globalThis.redo = redo;
  globalThis.generateRconPassword = generateRconPassword;
  globalThis.calculateUptime = calculateUptime;
  globalThis.validateServerProperties = validateServerProperties;
  globalThis.sortServers = sortServers;
  globalThis.cachePluginInfo = cachePluginInfo;
  globalThis.getPluginFromCache = getPluginFromCache;
  globalThis.restoreFromBackup = restoreFromBackup;
  globalThis.setPerformanceMode = setPerformanceMode;
  globalThis.toggleGPU = toggleGPU;
  globalThis.parseMinecraftVersion = parseMinecraftVersion;
  globalThis.compareVersions = compareVersions;
} catch (e) {
  console.warn("Failed to expose utilities to globalThis", e);
}

// Amélioration 79: Vérification de la version Minecraft
function parseMinecraftVersion(version) {
  const match = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1]),
    minor: Number.parseInt(match[2]),
    patch: Number.parseInt(match[3] || 0),
  };
}

// Amélioration 80: Comparaison de versions
function compareVersions(v1, v2) {
  const a = parseMinecraftVersion(v1);
  const b = parseMinecraftVersion(v2);
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

// Amélioration 81: Système de favoris serveurs
let favoriteServers = [];

function toggleFavoriteServer(serverName) {
  const idx = favoriteServers.indexOf(serverName);
  if (idx >= 0) favoriteServers.splice(idx, 1);
  else favoriteServers.push(serverName);
  localStorage.setItem("mcpanel_favservers", JSON.stringify(favoriteServers));
}

function loadFavoriteServers() {
  try {
    favoriteServers = JSON.parse(
      localStorage.getItem("mcpanel_favservers") || "[]",
    );
  } catch (e) {
    favoriteServers = [];
    console.warn("loadFavoriteServers failed", e);
  }
}

// Amélioration 82: Tri intelligent des serveurs
function sortServers(servers, by = "name") {
  const sorted = [...servers];
  switch (by) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "status":
      sorted.sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0));
      break;
    case "favorite":
      sorted.sort((a, b) => {
        const aFav = favoriteServers.includes(a.name);
        const bFav = favoriteServers.includes(b.name);
        return (bFav ? 1 : 0) - (aFav ? 1 : 0);
      });
      break;
  }
  return sorted;
}

// Amélioration 83: Gestionnaire de ressources (retiré — inutilisé)
// resourceManager removed to reduce dead code - images should be managed via DOM or a dedicated module.

// Amélioration 84: Système de plugins favoriés
let favoritePlugins = [];

function toggleFavoritePlugin(pluginName) {
  const idx = favoritePlugins.indexOf(pluginName);
  if (idx >= 0) favoritePlugins.splice(idx, 1);
  else favoritePlugins.push(pluginName);
  localStorage.setItem("mcpanel_favplugins", JSON.stringify(favoritePlugins));
}

// Amélioration 85: Cache des informations plugins
const pluginCache = new Map();

function cachePluginInfo(name, info) {
  pluginCache.set(name, { info, cachedAt: Date.now() });
}

function getPluginFromCache(name, maxAge = 300000) {
  const cached = pluginCache.get(name);
  if (cached && Date.now() - cached.cachedAt < maxAge) return cached.info;
  return null;
}

// Amélioration 86: Système d'alertes personnalisées
let customAlerts = [];

function addCustomAlert(condition, message) {
  customAlerts.push({ condition, message, active: true });
  localStorage.setItem("mcpanel_alerts", JSON.stringify(customAlerts));
}

function checkCustomAlerts(data) {
  customAlerts.forEach((alert) => {
    if (alert.active && alert.condition(data)) {
      showNotification(alert.message, "warning");
    }
  });
}

// Amélioration 87: Moniteur de performance client
const clientPerformance = {
  fps: 0,
  lastFrame: 0,
  frames: 0,
};

function measureFPS() {
  clientPerformance.frames++;
  const now = performance.now();
  if (now - clientPerformance.lastFrame >= 1000) {
    clientPerformance.fps = clientPerformance.frames;
    clientPerformance.frames = 0;
    clientPerformance.lastFrame = now;
  }
  requestAnimationFrame(measureFPS);
}
requestAnimationFrame(measureFPS);

// Amélioration 88: Détection des goulots d'étranglement
function detectBottlenecks() {
  const issues = [];
  if (clientPerformance.fps < 30) issues.push("FPS faible");
  if (jsErrorLog.length > 10) issues.push("Nombreuses erreurs JS");
  if (apiCallCount > 3) issues.push("API surchargée");
  return issues;
}

// Amélioration 89: Mode haute performance
let highPerfMode = false;

function toggleHighPerfMode() {
  highPerfMode = !highPerfMode;
  if (highPerfMode) {
    userPreferences.refreshInterval = 10000;
    document.body.classList.add("high-perf");
  } else {
    userPreferences.refreshInterval = 5000;
    document.body.classList.remove("high-perf");
  }
}

// Amélioration 90: Système de widgets personnalisables
function saveWidgetLayout(layout) {
  localStorage.setItem("mcpanel_widgets", JSON.stringify(layout));
}

function loadWidgetLayout() {
  try {
    return JSON.parse(localStorage.getItem("mcpanel_widgets") || "[]");
  } catch (e) {
    console.warn("loadWidgetLayout failed", e);
    return [];
  }
}

// Amélioration 91: Gestionnaire de raccourcis personnalisés (étendu)
let userCustomShortcuts = {};

function setUserCustomShortcut(key, action) {
  userCustomShortcuts[key] = action;
  localStorage.setItem(
    "mcpanel_user_shortcuts",
    JSON.stringify(userCustomShortcuts),
  );
}

function loadUserCustomShortcuts() {
  try {
    userCustomShortcuts = JSON.parse(
      localStorage.getItem("mcpanel_user_shortcuts") || "{}",
    );
  } catch (e) {
    userCustomShortcuts = {};
    console.warn("loadUserCustomShortcuts failed", e);
  }
}

// Amélioration 92: Système de notes par serveur
let serverNotes = {};

function saveServerNote(serverName, note) {
  serverNotes[serverName] = note;
  localStorage.setItem("mcpanel_notes", JSON.stringify(serverNotes));
}

function loadServerNotes() {
  try {
    serverNotes = JSON.parse(localStorage.getItem("mcpanel_notes") || "{}");
  } catch (e) {
    serverNotes = {};
    console.warn("loadServerNotes failed", e);
  }
}

// Amélioration 93: Historique des actions
let actionHistory = [];

function logAction(action, details = {}) {
  actionHistory.push({
    action,
    details,
    time: Date.now(),
  });
  if (actionHistory.length > 500) actionHistory.shift();
}

// Amélioration 94: Système d'undo/redo
const undoStack = [];
const redoStack = [];

function pushUndo(state) {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (undoStack.length === 0) return null;
  const state = undoStack.pop();
  redoStack.push(state);
  return JSON.parse(state);
}

function redo() {
  if (redoStack.length === 0) return null;
  const state = redoStack.pop();
  undoStack.push(state);
  return JSON.parse(state);
}

// Amélioration 95: Validation des fichiers de configuration
function validateServerProperties(content) {
  const errors = [];
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (line.trim() && !line.startsWith("#") && !line.includes("=")) {
      errors.push({ line: i + 1, message: "Format invalide" });
    }
  });
  return errors;
}

// Amélioration 96: Générateur de mot de passe RCON
function generateRconPassword(length = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Amélioration 97: Calcul du temps de fonctionnement
function calculateUptime(startTime) {
  if (!startTime) return "N/A";
  return formatDuration(Date.now() - startTime);
}

// Amélioration 98: Système de backup automatique des préférences
setInterval(() => {
  const backup = {
    userPreferences,
    commandHistory,
    favoriteCommands,
    favoriteServers,
    serverNotes,
    userCustomShortcuts,
    timestamp: Date.now(),
  };
  localStorage.setItem("mcpanel_backup_" + Date.now(), JSON.stringify(backup));
  // Nettoyer les vieux backups (garder les 5 derniers)
  const keys = Object.keys(localStorage)
    .filter((k) => k.startsWith("mcpanel_backup_"))
    .sort((a, b) => a.localeCompare(b));
  while (keys.length > 5) {
    localStorage.removeItem(keys.shift());
  }
}, 300000); // Toutes les 5 minutes

// Amélioration 99: Restauration depuis backup
function restoreFromBackup() {
  const keys = Object.keys(localStorage)
    .filter((k) => k.startsWith("mcpanel_backup_"))
    .sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) {
    showNotification("Aucun backup disponible", "warning");
    return;
  }
  const latestKey = keys.at(-1);
  try {
    const backup = JSON.parse(localStorage.getItem(latestKey));
    Object.assign(userPreferences, backup.userPreferences || {});
    commandHistory = backup.commandHistory || [];
    favoriteCommands = backup.favoriteCommands || [];
    favoriteServers = backup.favoriteServers || [];
    serverNotes = backup.serverNotes || {};
    userCustomShortcuts = backup.userCustomShortcuts || {};
    saveUserPreferences();
    showNotification("Restauration réussie", "success");
  } catch (e) {
    showNotification("Erreur de restauration", "error");
    console.warn("restoreFromBackup failed", e);
  }
}

// Amélioration 100: Indicateur de santé globale du système
function getSystemHealth() {
  let score = 100;
  if (!isOnline) score -= 30;
  if (jsErrorLog.length > 5) score -= jsErrorLog.length * 2;
  if (clientPerformance.fps < 30) score -= 20;
  if (sleepMode) score -= 10;
  if (apiCallCount > 3) score -= 15;
  score = Math.max(0, Math.min(100, score));

  let status = "excellent";
  if (score < 90) status = "good";
  if (score < 70) status = "fair";
  if (score < 50) status = "poor";
  if (score < 30) status = "critical";

  return { score, status };
}

// Initialiser les systèmes au chargement
globalThis.addEventListener("load", () => {
  loadLogBookmarks();
  loadMacros();
  loadFavoriteServers();
  loadWidgetLayout();
  loadUserCustomShortcuts();
  loadServerNotes();
});

/*================================
    VISUAL EFFECTS SYSTEM
================================*/

const visualSettings = {
  shader: "none", // none, bloom, neon, chromatic, vignette, scanlines, rgb-split
  fullbright: false,
  upscaling: "off",
};

function applyVisualSettings() {
  // Helper: determine server type using config, plugins, and mods
  async function detectServerType(serverName) {
    try {
      const r = await apiFetch(`/api/server/${serverName}/config`);
      const config = await r.json();
      let serverType = config.server_type || config.serverType || null;
      if (serverType) return serverType;

      if (config.forge_version) return "forge";
      if (config.loader_version) return "fabric";

      try {
        const pluginsResp = await apiFetch(
          `/api/server/${serverName}/plugins/installed`,
        );
        const plugins = await pluginsResp.json();
        if (Array.isArray(plugins) && plugins.length > 0) return "paper";
      } catch (e) {
        console.warn(
          "detectServerType: error while checking installed plugins",
          e,
        );
      }

      try {
        const modsResp = await apiFetch(`/api/server/${serverName}/mods`);
        const modsData = await modsResp.json();
        const mods = modsData.mods || modsData || [];
        if (Array.isArray(mods) && mods.length > 0) {
          if (config.forge_version) return "forge";
          if (config.loader_version) return "fabric";
          return "forge";
        }
      } catch (e) {
        console.warn(
          "detectServerType: error while checking installed mods",
          e,
        );
      }

      return "paper";
    } catch (e) {
      console.warn("detectServerType: failed to get config", e);
      return "paper";
    }
  }
  // If a server is selected, adapt UI tabs depending on its type
  if (currentServer) {
    (async () => {
      try {
        const serverType = await detectServerType(currentServer);
        // Show/hide tabs depending on server type
        const modsTab = document.querySelector('.tab[data-view="mods"]');
        const pluginsTab = document.querySelector('.tab[data-view="plugins"]');
        if (modsTab)
          modsTab.style.display = serverType === "paper" ? "none" : "";
        if (pluginsTab)
          pluginsTab.style.display = [
            "forge",
            "fabric",
            "neoforge",
            "quilt",
          ].includes(serverType)
            ? "none"
            : "";
      } catch (e) {
        console.warn("Erreur recuperation config:", e);
      }
    })();
  }

  const html = document.documentElement;

  // Shader

  delete html.dataset.shader;

  if (visualSettings.shader !== "none") {
    html.dataset.shader = visualSettings.shader;
  }

  // Fullbright

  html.dataset.fullbright = String(visualSettings.fullbright);

  // Upscaling

  delete html.dataset.upscaling;

  if (visualSettings.upscaling !== "off") {
    html.dataset.upscaling = visualSettings.upscaling;
  }

  // Update UI

  updateVisualUI();
}

function updateVisualUI() {
  // Shader buttons

  document.querySelectorAll(".shader-preset-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.shader === visualSettings.shader,
    );
  });

  // Upscaling buttons

  document.querySelectorAll(".upscaling-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.upscaling === visualSettings.upscaling,
    );
  });

  // Fullbright toggle (synchronize all toggles)
  document.querySelectorAll(".fullbright-toggle").forEach((el) => {
    el.checked = visualSettings.fullbright;
  });
}

function loadVisualSettings() {
  try {
    const saved = localStorage.getItem("mcpanel_visual_settings");
    if (saved) Object.assign(visualSettings, JSON.parse(saved));
  } catch (e) {
    console.warn("loadVisualSettings failed", e);
  }
  // Apply and update UI
  try {
    applyVisualSettings();
  } catch (e) {
    console.warn("applyVisualSettings in loadVisualSettings failed", e);
  }
  try {
    updateVisualUI();
  } catch (e) {
    console.warn("updateVisualUI in loadVisualSettings failed", e);
  }
}

function saveVisualSettings() {
  try {
    localStorage.setItem(
      "mcpanel_visual_settings",
      JSON.stringify(visualSettings),
    );
  } catch (e) {
    console.warn("saveVisualSettings failed", e);
  }
  try {
    applyVisualSettings();
  } catch (e) {
    console.warn("applyVisualSettings in saveVisualSettings failed", e);
  }
}

function setShaderPreset(shader) {
  visualSettings.shader = shader;

  saveVisualSettings();

  const shaderNames = {
    none: "Désactivé",

    bloom: "Bloom ✨",

    neon: "Néon 💡",

    chromatic: "Chromatique 🌈",

    vignette: "Vignette 🔲",

    scanlines: "CRT 📺",

    "rgb-split": "RGB Split 🎮",
  };

  showToast(`Shader: ${shaderNames[shader] || shader}`, "info");

  // Animation de transition

  document.body.style.animation = "shader-transition 0.5s ease";

  setTimeout(() => (document.body.style.animation = ""), 500);
}

function toggleFullbright(enabled) {
  visualSettings.fullbright = enabled;

  saveVisualSettings();

  showToast(
    enabled ? "☀️ Fullbright activé" : "🌙 Fullbright désactivé",
    "info",
  );
}

function setUpscaling(mode) {
  visualSettings.upscaling = mode;

  saveVisualSettings();

  const modeNames = {
    off: "Désactivé",

    quality: "DLSS Qualité",

    balanced: "DLSS Équilibré",

    performance: "DLSS Performance",

    ultra: "DLSS Ultra Performance",

    fsr: "AMD FSR",
  };

  showToast(`Upscaling: ${modeNames[mode]}`, "info");
}

function initVisualEffectsControls() {
  // Shader preset buttons

  document.querySelectorAll(".shader-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setShaderPreset(btn.dataset.shader);

      // Animation de feedback

      btn.style.transform = "scale(1.2)";

      setTimeout(() => (btn.style.transform = ""), 200);
    });
  });

  // Fullbright toggle (handle all toggles)
  document.querySelectorAll(".fullbright-toggle").forEach((el) => {
    el.addEventListener("change", (e) => {
      toggleFullbright(e.target.checked);
    });
  });

  // Upscaling buttons

  document.querySelectorAll(".upscaling-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setUpscaling(btn.dataset.upscaling);

      // Animation de feedback

      btn.style.transform = "scale(1.2)";

      setTimeout(() => (btn.style.transform = ""), 200);
    });
  });

  // Appliquer les paramètres chargés

  updateVisualUI();
}

// ================================

// PERFORMANCE SYSTEM

// ================================

const performanceSettings = {
  mode: "balanced", // eco, balanced, gpu, no-gpu

  gpuEnabled: true,

  animationsEnabled: true,

  blurEnabled: true,

  refreshRate: 60000, // ms entre les rafraîchissements

  maxLogLines: 500,

  chartPoints: 20,
};

function loadPerformanceSettings() {
  const saved = localStorage.getItem("mcpanel_performance");

  if (saved) {
    Object.assign(performanceSettings, JSON.parse(saved));
  }

  applyPerformanceMode();
}

function savePerformanceSettings() {
  localStorage.setItem(
    "mcpanel_performance",
    JSON.stringify(performanceSettings),
  );

  applyPerformanceMode();
}

function applyPerformanceMode() {
  const html = document.documentElement;

  // Supprimer les anciens modes

  delete html.dataset.perf;

  // Appliquer le nouveau mode

  if (!performanceSettings.gpuEnabled) {
    html.dataset.perf = "no-gpu";
  } else {
    html.dataset.perf = performanceSettings.mode;
  }

  // Ajuster les intervalles selon le mode

  switch (performanceSettings.mode) {
    case "eco":
      performanceSettings.refreshRate = 120000; // 2 min

      performanceSettings.maxLogLines = 200;

      performanceSettings.chartPoints = 10;

      break;

    case "balanced":
      performanceSettings.refreshRate = 60000; // 1 min

      performanceSettings.maxLogLines = 500;

      performanceSettings.chartPoints = 20;

      break;

    case "gpu":
      performanceSettings.refreshRate = 30000; // 30s

      performanceSettings.maxLogLines = 1000;

      performanceSettings.chartPoints = 30;

      break;
  }

  // Mettre à jour l'intervalle des métriques

  if (metricsInterval) {
    clearInterval(metricsInterval);

    metricsInterval = setInterval(
      loadSystemMetrics,
      performanceSettings.refreshRate,
    );
  }

  // Mettre à jour l'UI des paramètres

  updatePerformanceUI();
}

function updatePerformanceUI() {
  const gpuToggle = document.getElementById("gpu-toggle");

  if (gpuToggle) gpuToggle.checked = performanceSettings.gpuEnabled;

  // Mettre à jour les radio buttons

  const modeRadios = document.querySelectorAll('input[name="perf-mode"]');

  modeRadios.forEach((radio) => {
    radio.checked = radio.value === performanceSettings.mode;
  });
}

function setPerformanceMode(mode) {
  performanceSettings.mode = mode;

  savePerformanceSettings();

  showToast(`Mode performance: ${mode.toUpperCase()}`, "info");
}

function toggleGPU(enabled) {
  performanceSettings.gpuEnabled = enabled;

  savePerformanceSettings();

  showToast(
    enabled ? "GPU activé" : "GPU désactivé - Mode compatibilité",
    "info",
  );
}

// =====================================================
// API FETCH ROBUSTE - 50 CORRECTIONS
// =====================================================

// Correction 1: Timeout pour les requêtes
const API_TIMEOUT = 30000; // 30 secondes

// Correction 2: Retry automatique
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Correction 3: Queue de requêtes pour éviter les surcharges (no-op queue removed)

// Correction 4: Statistiques de requêtes
const apiStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalTime: 0,
};

// Fonction pour récupérer un nouveau token CSRF
async function refreshCsrfToken() {
  try {
    const response = await fetch("/api/csrf-token", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = await response.json();
      const metaTag = document.querySelector('meta[name="csrf-token"]');
      if (metaTag && data.csrf_token) {
        metaTag.setAttribute("content", data.csrf_token);
        console.log("[CSRF] Token mis à jour avec succès");
        return true;
      }
    }
  } catch (e) {
    console.error("[CSRF] Erreur lors de la récupération du token:", e);
  }
  return false;
}

// Amélioration Sécurité 1: Récupérer le token CSRF de manière robuste
function getCsrfToken() {
  // Essayer plusieurs sources
  let token = document.querySelector('meta[name="csrf-token"]')?.content;
  if (!token) {
    token = document.querySelector('meta[name="csrf_token"]')?.content;
  }
  if (!token) {
    token = document.querySelector('input[name="csrf_token"]')?.value;
  }
  if (!token) {
    // Chercher dans les cookies
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "csrf_token") {
        token = value;
        break;
      }
    }
  }
  return token || "";
}

// Amélioration Sécurité 2: Mise à jour automatique du token au chargement
async function ensureCsrfToken() {
  const token = getCsrfToken();
  if (!token) {
    console.warn("[CSRF] Token manquant, tentative de récupération...");
    await refreshCsrfToken();
  }
  return getCsrfToken();
}

// Correction 5: apiFetch robuste avec timeout, retry, et gestion d'erreurs
async function apiFetch(url, options = {}, retries = 0) {
  const startTime = performance.now();
  apiStats.totalRequests++;
  sessionStats.apiCalls++;

  // Vérifier la connexion
  if (!navigator.onLine) {
    sessionStats.errors++;
    throw new Error("Pas de connexion internet");
  }

  // Amélioration Sécurité 3: Toujours récupérer le token CSRF frais
  let csrfToken = getCsrfToken();

  // Si pas de token et c'est une requête POST/PUT/DELETE, en récupérer un
  const method = (options.method || "GET").toUpperCase();
  if (!csrfToken && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    console.warn(
      "[CSRF] Token manquant pour requête " + method + ", récupération...",
    );
    await refreshCsrfToken();
    csrfToken = getCsrfToken();
  }

  // Debug CSRF
  if (!csrfToken && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    console.error("[CSRF] ATTENTION: Token toujours manquant après refresh!");
  }

  // Amélioration Sécurité 4: Fusionner correctement les headers avec CSRF en priorité
  const mergedHeaders = {
    Accept: "application/json",
    ...(options.body && typeof options.body === "string"
      ? { "Content-Type": "application/json" }
      : {}),
    ...options.headers,
  };

  // Amélioration Sécurité 5: Toujours ajouter le CSRF token en dernier (priorité maximale)
  if (csrfToken) {
    mergedHeaders["X-CSRF-Token"] = csrfToken;
  }

  const defaultOptions = {
    credentials: "include",
    headers: mergedHeaders,
    timeout: 10000,
  };

  // Créer un AbortController pour le timeout
  const controller = new AbortController();
  const timeout = options.timeout || defaultOptions.timeout || API_TIMEOUT;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Correction 6: Gérer les erreurs HTTP
    if (!response.ok) {
      // Correction 7: Session expirée
      if (response.status === 401) {
        handleSessionExpired();
        throw new Error("Session expirée");
      }

      // Correction CSRF: Récupérer un nouveau token et réessayer
      if (response.status === 403) {
        const errorData = await response
          .clone()
          .json()
          .catch(() => ({}));
        if (errorData.code === "CSRF_ERROR" && retries < 1) {
          console.warn(
            "[CSRF] Token invalide, récupération d'un nouveau token...",
          );
          await refreshCsrfToken();
          return apiFetch(url, options, retries + 1);
        }
      }

      // Correction 8: Rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") || 5;
        await sleep(retryAfter * 1000);
        if (retries < MAX_RETRIES) {
          return apiFetch(url, options, retries + 1);
        }
      }

      // Correction 9: Erreurs serveur (5xx) - retry
      if (response.status >= 500 && retries < MAX_RETRIES) {
        await sleep(RETRY_DELAY * (retries + 1));
        return apiFetch(url, options, retries + 1);
      }
    }

    apiStats.successfulRequests++;
    apiStats.totalTime += performance.now() - startTime;

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    apiStats.failedRequests++;
    sessionStats.errors++;

    // Correction 10: Timeout - retry
    if (error.name === "AbortError") {
      console.warn(`Timeout pour ${url}`);
      if (retries < MAX_RETRIES) {
        await sleep(RETRY_DELAY);
        return apiFetch(url, options, retries + 1);
      }
      throw new Error("La requête a expiré");
    }

    // Correction 11: Erreur réseau - retry
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      if (retries < MAX_RETRIES) {
        await sleep(RETRY_DELAY * (retries + 1));
        return apiFetch(url, options, retries + 1);
      }
    }

    throw error;
  }
}

// Correction 12: Helper pour parser JSON de manière sécurisée
async function safeJsonParse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Réponse non-JSON:", text.substring(0, 200));
    throw new Error("Le serveur a renvoyé une réponse invalide (non-JSON)");
  }
  return response.json();
}

// Correction 13: Helper sleep
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Correction 13: Gestion session expirée
function handleSessionExpired() {
  showToast("Session expirée, reconnexion...", "warning");
  setTimeout(() => {
    globalThis.location.href = "/login";
  }, 2000);
}

// Correction 14: Wrapper pour les requêtes JSON
async function apiJson(url, options = {}) {
  try {
    const response = await apiFetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erreur ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`API Error (${url}):`, error);
    throw error;
  }
}

// Correction 15: Requête POST simplifiée
async function apiPost(url, data) {
  return apiJson(url, {
    method: "POST",

    body: JSON.stringify(data),
  });
}

// Correction 16: Debounce amélioré
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

// Correction 17: Throttle amélioré
function throttle(func, limit) {
  let inThrottle;
  let lastResult;
  return function (...args) {
    const context = this;
    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
    return lastResult;
  };
}

// Correction 18: Retry wrapper générique
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delay * (i + 1));
    }
  }
}

// Correction 19: Validation des données
function validateRequired(data, fields) {
  const missing = fields.filter(
    (f) => !data[f] && data[f] !== 0 && data[f] !== false,
  );
  if (missing.length > 0) {
    throw new Error(`Champs requis manquants: ${missing.join(", ")}`);
  }
  return true;
}

// Correction 20: Sanitize input
function sanitizeInput(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

// Correction 21: Escape HTML
function escapeHtml(unsafe) {
  if (typeof unsafe !== "string") return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Escape for HTML attributes (single/double quoted)
function escapeHtmlAttr(unsafe) {
  if (typeof unsafe !== "string") return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Use canonical formatBytes/formatDuration implementations defined earlier to avoid duplicates

// Correction 24: Parse server response safely
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("JSON parse error:", e);
    return null;
  }
}

// Correction 25: Local storage safe access
function safeGetItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.warn(`Error reading ${key}:`, e);
    return defaultValue;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`Error saving ${key}:`, e);
    return false;
  }
}

// Correction 26: Element existence check
function getEl(id) {
  return document.getElementById(id);
}

function getEls(selector) {
  return document.querySelectorAll(selector);
}

function safeSetText(id, text) {
  const el = getEl(id);
  if (el) el.textContent = text;
}

function safeSetHtml(id, html) {
  const el = getEl(id);
  if (el) el.innerHTML = html;
}

// Correction 27: Event listener safe add
function safeAddListener(el, event, handler, options) {
  if (typeof el === "string") el = getEl(el);
  if (el && typeof el.addEventListener === "function") {
    el.addEventListener(event, handler, options);
  }
}

// Correction 28: Remove listeners safely
function safeRemoveListener(el, event, handler) {
  if (typeof el === "string") el = getEl(el);
  if (el && typeof el.removeEventListener === "function") {
    el.removeEventListener(event, handler);
  }
}

// Correction 29: Interval management
const intervals = new Map();

function startInterval(name, fn, delay) {
  stopInterval(name);
  intervals.set(name, setInterval(fn, delay));
}

function stopInterval(name) {
  if (intervals.has(name)) {
    clearInterval(intervals.get(name));
    intervals.delete(name);
  }
}

function stopAllIntervals() {
  intervals.forEach((id, name) => {
    clearInterval(id);
  });
  intervals.clear();
}

// Correction 30: Animation frame manager
const animationFrames = new Map();

function startAnimation(name, fn) {
  stopAnimation(name);
  const animate = () => {
    fn();
    animationFrames.set(name, requestAnimationFrame(animate));
  };
  animationFrames.set(name, requestAnimationFrame(animate));
}

function stopAnimation(name) {
  if (animationFrames.has(name)) {
    cancelAnimationFrame(animationFrames.get(name));
    animationFrames.delete(name);
  }
}

// Correction 31: Copy to clipboard robuste
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Copié!", "success");
      return true;
    }
    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    if (typeof textarea.remove === "function") textarea.remove();
    else document.body.removeChild(textarea);
    showToast("Copié!", "success");
    return true;
  } catch (e) {
    showToast("Erreur de copie", "error");
    return false;
  }
}

// Correction 32: Scroll to element
function scrollToElement(el, options = {}) {
  if (typeof el === "string") el = getEl(el);
  if (!el) return;

  el.scrollIntoView({
    behavior: options.smooth !== false ? "smooth" : "auto",
    block: options.block || "center",
    inline: options.inline || "nearest",
  });
}

// Correction 33: Check visible in viewport
function isInViewport(el) {
  if (typeof el === "string") el = getEl(el);
  if (!el) return false;

  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (globalThis.innerHeight || document.documentElement.clientHeight) &&
    rect.right <=
      (globalThis.innerWidth || document.documentElement.clientWidth)
  );
}

// Correction 34: Create element helper
function createElement(tag, props = {}, children = []) {
  const el = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (key === "className") el.className = value;
    else if (key === "innerHTML") el.innerHTML = value;
    else if (key === "textContent") el.textContent = value;
    else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset" && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => (el.dataset[k] = v));
    } else el.setAttribute(key, value);
  });

  children.forEach((child) => {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });

  return el;
}

// Correction 35: Confirm dialog promise
function confirmDialog(message, title = "Confirmation") {
  return new Promise((resolve) => {
    const modal = createElement("div", {
      className: "modal confirm-modal show",
    });
    modal.innerHTML = `
            <div class="modal-content confirm-content">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" data-action="cancel">Annuler</button>
                    <button class="btn btn-primary" data-action="confirm">Confirmer</button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (action) {
        modal.remove();
        resolve(action === "confirm");
      }
    });
  });
}

// Correction 36: Toast amélioré avec queue
const toastQueue = [];
let toastShowing = false;

function showToastQueued(message, type = "info", duration = 3000) {
  toastQueue.push({ message, type, duration });
  processToastQueue();
}

function processToastQueue() {
  if (toastShowing || toastQueue.length === 0) return;

  toastShowing = true;
  const { message, type, duration } = toastQueue.shift();

  showToast(message, type);

  setTimeout(
    () => {
      toastShowing = false;
      processToastQueue();
    },
    Math.min(duration, 1500),
  );
}

// Correction 37: Loading state manager
const loadingStates = new Map();

function setLoading(name, isLoading = true) {
  loadingStates.set(name, isLoading);

  const btn = getEl(`btn-${name}`);
  if (btn) {
    btn.disabled = isLoading;
    if (isLoading) {
      btn.dataset.originalContent = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    } else if (btn.dataset.originalContent) {
      btn.innerHTML = btn.dataset.originalContent;
    }
  }
}

function isLoading(name) {
  return loadingStates.get(name) === true;
}

// Correction 38: Error boundary wrapper
async function safeExecute(fn, errorMessage = "Une erreur est survenue") {
  try {
    return await fn();
  } catch (error) {
    console.error(errorMessage, error);
    showToast(`${errorMessage}: ${error.message}`, "error");
    return null;
  }
}

// Correction 39: URL parameter helpers
function getUrlParam(name) {
  const params = new URLSearchParams(globalThis.location.search);
  return params.get(name);
}

function setUrlParam(name, value) {
  const url = new URL(globalThis.location.href);
  if (value === null || value === undefined) {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
  }
  globalThis.history.replaceState({}, "", url.toString());
}

// Correction 40: Date formatting
function formatDate(date, format = "short") {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";

  if (format === "short") return d.toLocaleDateString("fr-FR");
  if (format === "long")
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  if (format === "time") return d.toLocaleTimeString("fr-FR");
  if (format === "full") return d.toLocaleString("fr-FR");
  if (format === "relative") return getRelativeTime(d);

  return d.toLocaleString("fr-FR");
}

function getRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(date, "short");
}

// Correction 41: Number formatting
function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined) return "-";
  return Number(num).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Correction 42: Percentage formatting
function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toFixed(decimals)}%`;
}

// Correction 43: Clamp value
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Correction 44: Random ID generator
function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Correction 45: Deep clone
function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.warn("Deep clone failed:", e);
    return obj;
  }
}

// Correction 46: Merge objects deep
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Correction 47: Event emitter simple
const eventBus = {
  listeners: {},
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(
      (cb) => cb !== callback,
    );
  },
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error("Event handler error:", e);
      }
    });
  },
};

// Correction 48: Performance monitor
const perfMonitor = {
  marks: new Map(),

  start(name) {
    this.marks.set(name, performance.now());
  },

  end(name, log = false) {
    const start = this.marks.get(name);
    if (!start) return 0;

    const duration = performance.now() - start;
    this.marks.delete(name);

    if (log) console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
    return duration;
  },
};

// Correction 49: Browser feature detection
const browserFeatures = {
  clipboard: !!navigator.clipboard,
  notifications: "Notification" in globalThis,
  localStorage: (() => {
    try {
      localStorage.setItem("test", "test");
      localStorage.removeItem("test");
      return true;
    } catch (e) {
      return false;
    }
  })(),
  webgl: (() => {
    try {
      const canvas = document.createElement("canvas");
      return !!(globalThis.WebGLRenderingContext && canvas.getContext("webgl"));
    } catch (e) {
      return false;
    }
  })(),
  touch: "ontouchstart" in globalThis,
};

// Correction 50: Global error handler amélioré
globalThis.onerror = function (message, source, lineno, colno, error) {
  // Ignore noisy extension errors (e.g., passkeys-inject) that are not actionable
  try {
    const msg = String((error && error.message) || message || "");
    if (
      msg.includes(
        "Could not establish connection. Receiving end does not exist",
      )
    ) {
      console.debug("Ignored extension error:", msg);
      return false; // suppress default handling
    }
  } catch (e) {}
  console.error("Global error:", { message, source, lineno, colno, error });
  sessionStats.errors++;

  // Ne pas afficher les erreurs de ressources externes
  try {
    if (source && !source.includes(globalThis.location.hostname)) return;
  } catch (e) {
    console.warn("onerror host check failed", e);
  }

  try {
    showToast("Une erreur JavaScript est survenue", "error");
  } catch (e) {
    console.warn("showToast in onerror failed", e);
  }
  return false;
};

globalThis.onunhandledrejection = function (event) {
  try {
    const msg = String(event.reason?.message || event.reason || "");
    if (
      msg.includes(
        "Could not establish connection. Receiving end does not exist",
      )
    ) {
      // Likely a browser extension (passkeys) trying to message background script; ignore
      console.debug("Ignored known extension error:", msg);
      return;
    }
  } catch (e) {
    /* ignore checking errors */
  }
  console.error("Unhandled promise rejection:", event.reason);
  sessionStats.errors++;
};

// Early-capture handler to suppress noisy extension unhandled rejections
window.addEventListener(
  "unhandledrejection",
  (ev) => {
    try {
      const msg = String(ev.reason?.message || ev.reason || "");
      if (
        msg.includes(
          "Could not establish connection. Receiving end does not exist",
        )
      ) {
        ev.preventDefault();
        try {
          ev.stopImmediatePropagation();
        } catch (e) {}
        console.debug("Suppressed extension unhandled rejection:", msg);
      }
    } catch (e) {}
  },
  true,
);

// Init

globalThis.addEventListener("DOMContentLoaded", async () => {
  // Amélioration Sécurité 15: Initialiser le token CSRF en premier
  await ensureCsrfToken();

  // Amélioration 21: Charger toutes les préférences en premier
  loadUserPreferences();
  loadPerformanceSettings();
  loadVisualSettings();

  // Amélioration 22: Setup des détections et raccourcis
  setupConnectionDetection();
  setupIdleDetection();
  setupGlobalShortcuts();
  requestNotificationPermission();

  await checkAuth();
  try {
    loadTheme();
  } catch (e) {
    console.warn("Erreur lors de loadTheme():", e);
  }

  // Initialiser les contrôles d'effets visuels
  initVisualEffectsControls();

  await Promise.all([
    loadServerList(),
    loadVersions(),
    loadNotifications(),
    loadSystemMetrics(),
  ]);

  startMetricsPolling();
  initCharts();

  // Amélioration 23: Afficher les infos de session
  console.log("🎮 MCPanel v2.0 loaded");
  console.log("🔒 CSRF Token initialisé:", getCsrfToken() ? "OK" : "ERREUR");
  console.log(
    "💡 Raccourcis: F1-F5 onglets, Ctrl+S sauvegarder, ↑↓ historique, Tab autocomplétion",
  );
  console.log(`📊 Session démarrée à ${new Date().toLocaleTimeString()}`);

  // Amélioration Sécurité 16: Rafraîchir le token CSRF périodiquement
  setInterval(
    async () => {
      await refreshCsrfToken();
      console.log("[CSRF] Token rafraîchi automatiquement");
    },
    15 * 60 * 1000,
  ); // Toutes les 15 minutes
});

// Auth

async function checkAuth() {
  try {
    const response = await apiFetch("/api/auth/user");

    if (response.status === 401) {
      globalThis.location.href = "/login";

      return;
    }

    const data = await response.json();

    if (data.status === "success") {
      currentUser = data.user;

      updateUserUI();
    }
  } catch (error) {
    console.error("Erreur auth:", error);
  }
}

function updateUserUI() {
  if (!currentUser) return;

  const userName = document.getElementById("user-name");

  const userRole = document.getElementById("user-role");

  if (userName) userName.textContent = currentUser.username;

  if (userRole)
    userRole.textContent =
      currentUser.role === "admin" ? "Administrateur" : "Utilisateur";

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = currentUser.role === "admin" ? "" : "none";
  });
}

async function logout() {
  globalThis.location.href = "/logout";

  // Ensure CSRF token is fresh
  await ensureCsrfToken();
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }
  formData.append("path", currentFilePath);
  const csrf = getCsrfToken();
  if (!csrf) {
    showToast("error", "CSRF token manquant");
    return;
  }
  formData.append("csrf_token", csrf);

  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/upload`, {
      method: "POST",
      body: formData,
      headers: { "X-CSRF-Token": csrf },
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichiers uploadés");
      loadFiles("");
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    console.error("Erreur upload files:", e);
    showToast("error", "Erreur upload");
  }

  document.documentElement.dataset.theme = theme;

  localStorage.setItem("theme", theme);

  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

// ================================

// SECTIONS NAVIGATION

// ================================

function showSection(sectionName) {
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));

  const section = document.getElementById(`section-${sectionName}`);

  if (section) section.classList.add("active");

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === sectionName);
  });

  if (sectionName === "settings") loadSettings();

  if (sectionName === "notifications") loadNotifications();
}

// Expose to global scope for inline onclick handlers
globalThis.__real_showSection = showSection;
globalThis.showSection = function (sectionName) {
  // if real is ready, call it and flush queued calls
  if (typeof globalThis.__real_showSection === "function") {
    const res = globalThis.__real_showSection(sectionName);
    if (
      Array.isArray(globalThis.__queuedShowSection) &&
      globalThis.__queuedShowSection.length > 0
    ) {
      globalThis.__queuedShowSection.forEach((s) => {
        try {
          globalThis.__real_showSection(s);
        } catch (e) {
          console.warn("flushing queued showSection failed", e);
        }
      });
      globalThis.__queuedShowSection = [];
    }
    return res;
  }
  // otherwise queue it
  globalThis.__queuedShowSection = globalThis.__queuedShowSection || [];
  globalThis.__queuedShowSection.push(sectionName);
};

function openSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) {
    modal.style.display = "block";
    loadNotificationConfig();
  }
}

// Generic helper for uploading mods (used by UI if implemented)
async function uploadModFile(file) {
  if (!currentServer || !file) return;
  if (!file.name.endsWith(".jar")) {
    showToast("error", "Le fichier doit être un .jar");
    return;
  }
  await ensureCsrfToken();
  const formData = new FormData();
  formData.append("mod", file);
  const csrf = getCsrfToken();
  if (csrf) formData.append("csrf_token", csrf);
  try {
    const res = await apiFetch(`/api/server/${currentServer}/mods/upload`, {
      method: "POST",
      body: formData,
      headers: { "X-CSRF-Token": csrf },
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", data.message || "Mod uploadé");
      try {
        await refreshInstalledMods();
      } catch (e) {
        console.warn("refreshInstalledMods after upload failed", e);
      }
      try {
        setServerModeUI(true);
      } catch (e) {}
      try {
        switchTab("mods");
      } catch (e) {}
      try {
        if (document.querySelector(".tab.active")?.dataset?.view === "mods")
          loadModsForCurrentServer("");
      } catch (e) {}
    } else showToast("error", data.message || "Erreur upload mod");
  } catch (e) {
    console.error("Erreur upload mod:", e);
    showToast("error", "Erreur upload mod");
  }
}

function closeSettings() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.style.display = "none";
}

// Notifications Config
async function loadNotificationConfig() {
  try {
    const res = await apiFetch("/api/notifications/config");
    const config = await res.json();

    if (config.discord) {
      document.getElementById("discord-enabled").checked =
        config.discord.enabled;
      if (document.getElementById("discord-webhook"))
        document.getElementById("discord-webhook").value =
          config.discord.webhook_url || "";
      if (document.getElementById("discord-webhook-settings"))
        document.getElementById("discord-webhook-settings").value =
          config.discord.webhook_url || "";
    }
  } catch (e) {
    console.error("Error loading notification config", e);
  }
}

async function saveNotificationConfig() {
  const enabled = document.getElementById("discord-enabled").checked;
  const webhook = document.getElementById("discord-webhook").value;

  const config = {
    discord: {
      enabled: enabled,
      webhook_url: webhook,
      events: ["server_start", "server_stop", "crash", "backup", "alert"],
    },
  };

  try {
    const res = await apiFetch("/api/notifications/config", {
      method: "POST",
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (data.success) showToast("success", "Configuration sauvegardée");
    else showToast("error", "Erreur sauvegarde");
  } catch (e) {
    showToast("error", "Erreur API");
  }
}

async function testDiscordWebhook() {
  const webhook = document.getElementById("discord-webhook").value;
  if (!webhook) return showToast("error", "URL Webhook manquante");

  try {
    showToast("info", "Test en cours...");
    const res = await apiFetch("/api/notifications/test/discord", {
      method: "POST",
      body: JSON.stringify({ webhook_url: webhook }),
    });
    const data = await res.json();
    if (data.success) showToast("success", "Test réussi !");
    else showToast("error", data.message);
  } catch (e) {
    showToast("error", "Erreur Test");
  }
}

async function testDiscordSettings() {
  const webhook = document
    .getElementById("discord-webhook-settings")
    ?.value?.trim();
  if (!webhook) {
    showToast("error", "Entrez une URL de webhook");
    return;
  }
  try {
    showToast("info", "Test en cours...");
    const res = await apiFetch("/api/notifications/test/discord", {
      method: "POST",
      body: JSON.stringify({ webhook_url: webhook }),
    });
    const data = await res.json();
    if (data.success) showToast("success", "Test réussi !");
    else showToast("error", data.message);
  } catch (e) {
    showToast("error", "Erreur Test");
  }
}

// ================================

// SYSTEM METRICS - Optimized

// ================================

let metricsLoaded = false;

let lastMetricsUpdate = 0;
let metricsHistoryLimit = 300;

function startMetricsPolling() {
  loadSystemMetrics();
  loadMetricsHistory(metricsHistoryLimit);

  // Utilise l'intervalle défini par les paramètres de performance

  metricsInterval = setInterval(
    loadSystemMetrics,
    performanceSettings.refreshRate,
  );
}

async function loadMetricsHistory(limit = metricsHistoryLimit) {
  try {
    console.debug("loadMetricsHistory requesting limit=", limit);
    const res = await apiFetch(
      `/api/metrics/history?limit=${encodeURIComponent(limit)}`,
    );
    const payload = await res.json();
    const history = (payload && (payload.data || payload.history)) || [];

    if (Array.isArray(history)) {
      metricsHistory.timestamps = [];
      metricsHistory.cpu = [];
      metricsHistory.ram = [];

      console.debug("loadMetricsHistory returned", history.length, "points");
      history.forEach((point) => {
        const time = point.timestamp
          ? new Date(point.timestamp).toLocaleTimeString()
          : new Date().toLocaleTimeString();
        metricsHistory.timestamps.push(time);
        metricsHistory.cpu.push(typeof point.cpu === "number" ? point.cpu : 0);
        metricsHistory.ram.push(
          typeof point.ram_percent === "number"
            ? point.ram_percent
            : typeof point.ram === "number"
              ? point.ram
              : 0,
        );
      });
      updateMainChart();
    }
  } catch (e) {
    console.error("Failed to load metrics history", e);
  }
}

/**
 * Change la période d'affichage du graphique principal.
 * Appelée depuis l'attribut `onchange` dans le template (`#chart-period`).
 */
function updateChartPeriod(value) {
  console.debug("updateChartPeriod called with", value);
  const v = Number(value) || 60;
  metricsHistoryLimit = v;
  performanceSettings.chartPoints = Math.max(10, Math.min(1000, v));
  try {
    const sel = document.getElementById("chart-period");
    if (sel) sel.value = String(v);
  } catch (e) {}
  loadMetricsHistory(metricsHistoryLimit);
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

async function loadSystemMetrics() {
  // Évite les appels trop fréquents

  const now = Date.now();

  if (now - lastMetricsUpdate < 5000) return;

  lastMetricsUpdate = now;

  try {
    const response = await apiFetch("/api/metrics/system");

    const data = await response.json();

    const cpuPercent = data.cpu?.percent || 0;

    const ramUsed = data.memory?.used_gb || 0;

    const ramTotal = data.memory?.total_gb || 0;

    const ramPercent = data.memory?.percent || 0;

    const diskUsed = data.disk?.used_gb || 0;

    const diskTotal = data.disk?.total_gb || 0;

    const diskPercent = data.disk?.percent || 0;

    // Batch DOM updates

    requestAnimationFrame(() => {
      updateElement("dash-cpu", cpuPercent.toFixed(1) + "%");

      updateElement(
        "dash-ram",
        `${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GB`,
      );

      updateElement(
        "dash-disk",
        `${diskUsed.toFixed(0)} / ${diskTotal.toFixed(0)} GB`,
      );

      updateElement("mini-cpu", cpuPercent.toFixed(0) + "%");

      updateElement("mini-ram", ramPercent.toFixed(0) + "%");

      updateElement("mini-disk", diskPercent.toFixed(0) + "%");

      const diskProgress = document.getElementById("disk-progress");

      if (diskProgress) diskProgress.style.width = diskPercent + "%";
    });

    // Limiter l'historique selon le mode de performance

    const time = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    metricsHistory.cpu.push(cpuPercent);

    metricsHistory.ram.push(ramPercent);

    metricsHistory.timestamps.push(time);

    const maxHistory = performanceSettings.chartPoints;

    if (metricsHistory.cpu.length > maxHistory) {
      metricsHistory.cpu.shift();

      metricsHistory.ram.shift();

      metricsHistory.timestamps.shift();
    }

    if (metricsLoaded) {
      updateMainChart();
    } else {
      metricsLoaded = true;

      updateMainChart();
    }
  } catch (error) {
    console.error("Erreur metriques:", error);
  }
}

function updateElement(id, value) {
  const el = document.getElementById(id);

  if (el) el.textContent = value;
}

// ================================

// CHARTS

// ================================

function initCharts() {
  // Ne pas initialiser le chart en mode ECO

  if (performanceSettings.mode === "eco") return;

  const mainCtx = document.getElementById("main-chart");

  if (!mainCtx || typeof Chart === "undefined") return;

  // Désactiver les animations en mode balanced

  const animationConfig =
    performanceSettings.mode === "balanced"
      ? { duration: 0 }
      : { duration: 400, easing: "easeOutQuart" };

  mainChart = new Chart(mainCtx, {
    type: "line",

    data: {
      labels: [],

      datasets: [
        {
          label: "CPU %",

          data: [],

          borderColor: "#3b82f6",

          backgroundColor: "rgba(59, 130, 246, 0.08)",

          fill: true,

          tension: 0.3,

          borderWidth: 2,

          pointRadius: 0,

          pointHoverRadius: 4,
        },

        {
          label: "RAM %",

          data: [],

          borderColor: "#10b981",

          backgroundColor: "rgba(16, 185, 129, 0.08)",

          fill: true,

          tension: 0.3,

          borderWidth: 2,

          pointRadius: 0,

          pointHoverRadius: 4,
        },
      ],
    },

    options: {
      responsive: true,

      maintainAspectRatio: false,

      animation: animationConfig,

      interaction: {
        intersect: false,

        mode: "index",
      },

      plugins: {
        legend: {
          position: "top",

          labels: { color: "#666666", font: { size: 12 } },
        },
      },

      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },

          ticks: { color: "#666666", maxTicksLimit: 8, font: { size: 10 } },
        },

        y: {
          min: 0,

          max: 100,

          grid: { color: "rgba(255, 255, 255, 0.04)" },

          ticks: { color: "#666666", font: { size: 10 } },
        },
      },
    },
  });
}

function updateMainChart() {
  if (!mainChart) return;

  mainChart.data.labels = metricsHistory.timestamps;

  mainChart.data.datasets[0].data = metricsHistory.cpu;

  mainChart.data.datasets[1].data = metricsHistory.ram;

  mainChart.update("none"); // 'none' désactive l'animation pour cette mise à jour
}

// ================================

// SERVER LIST

// ================================

let lastServerList = [];

async function loadServerList(forceRefresh = false) {
  try {
    const response = await apiFetch("/api/servers");

    const servers = await response.json();

    // Ne reconstruire le DOM que si la liste a change ou si forceRefresh

    const serversChanged =
      forceRefresh ||
      JSON.stringify(servers) !== JSON.stringify(lastServerList);

    lastServerList = servers;

    // Rien à créer ici — la création de serveur est gérée par `createServer()`.
    // Cette fonction se contente de récupérer et d'afficher la liste des serveurs.

    // Dashboard table - seulement si change

    const serversTable = document.getElementById("servers-table");

    if (serversTable && serversChanged) {
      if (servers.length === 0) {
        serversTable.innerHTML =
          '<p class="empty-message">Aucun serveur. Crez-en un !</p>';
      } else {
        serversTable.innerHTML = `<table><thead><tr><th>Nom</th><th>Statut</th><th>Actions</th></tr></thead><tbody>

                    ${servers.map((server) => `<tr><td><i class="fas fa-server"></i> ${server}</td><td><span class="status-dot-small" id="status-${server}"></span></td><td><button class="btn-table" onclick="selectServer('${server}')"><i class="fas fa-eye"></i></button></td></tr>`).join("")}

                </tbody></table>`;
      }
    }

    // Sidebar server list - seulement si change
    const serverListEl = document.getElementById("server-list");
    if (serverListEl && serversChanged) {
      if (servers.length === 0) {
        serverListEl.innerHTML = '<p class="empty-message">Aucun serveur.</p>';
      } else {
        serverListEl.innerHTML = servers
          .map((server) => {
            const safe = ("" + server).replace(/'/g, "\\'");
            return `<div class="server-item" onclick="selectServer('${safe}')"><i class="fas fa-server"></i><span>${escapeHtml(server)}</span></div>`;
          })
          .join("");
      }
    }

    // Servers grid - seulement si change

    const serversGrid = document.getElementById("servers-grid");

    if (serversGrid && serversChanged) {
      if (servers.length === 0) {
        serversGrid.innerHTML =
          '<p class="empty-message">Aucun serveur. Crez-en un !</p>';
      } else {
        serversGrid.innerHTML = servers
          .map(
            (server) => `

                    <div class="server-card" onclick="selectServer('${server}')">

                        <div class="server-card-header"><i class="fas fa-server"></i><h3>${server}</h3></div>

                        <div class="server-card-status" id="card-status-${server}"><span class="status-dot offline"></span><span>Hors ligne</span></div>

                    </div>

                `,
          )
          .join("");
      }
    }

    // Mettre a jour les compteurs

    updateElement("dash-servers-total", servers.length);

    updateElement("dash-servers-online", 0);

    // Mettre a jour les statuts en arrie¨re-plan sans bloquer

    if (servers.length > 0) {
      updateAllServerStatuses(servers);
    }
  } catch (error) {
    console.error("Erreur chargement serveurs:", error);
  }
}

async function updateAllServerStatuses(servers) {
  let onlineCount = 0;

  for (const server of servers) {
    try {
      const statusRes = await apiFetch(`/api/server/${server}/status`);

      const status = await statusRes.json();

      const isOnline = status.running;

      if (isOnline) onlineCount++;

      // Mise a jour silencieuse des indicateurs

      const statusDot = document.getElementById(`status-${server}`);

      if (statusDot)
        statusDot.className = `status-dot-small ${isOnline ? "online" : "offline"}`;

      const cardStatus = document.getElementById(`card-status-${server}`);

      if (cardStatus) {
        cardStatus.innerHTML = `<span class="status-dot ${isOnline ? "online" : "offline"}"></span><span>${isOnline ? "En ligne" : "Hors ligne"}</span>`;
      }
    } catch (e) {
      console.warn("update server card status failed", server, e);
    }
  }

  updateElement("dash-servers-online", onlineCount);
}

function selectServer(serverName) {
  currentServer = serverName;

  showSection("servers");

  const listView = document.getElementById("servers-list-view");

  const detailView = document.getElementById("server-detail-view");

  const detailName = document.getElementById("detail-server-name");

  if (listView) listView.style.display = "none";

  if (detailView) detailView.style.display = "block";

  if (detailName) detailName.textContent = serverName;

  // Mettre a jour l'adresse du serveur

  updateServerAddressDisplay(serverName, "25565");

  try {
    reloadServerIcon(serverName);
  } catch (e) {
    console.warn("selectServer: reloadServerIcon failed", e);
  }

  document.querySelectorAll(".server-item").forEach((item) => {
    item.classList.toggle("active", item.textContent.trim() === serverName);
  });

  updateStatus();

  // Fetch server config to set loader/version context and adapt tabs
  (async () => {
    // Lock map to prevent race overwrites: serverName -> timestamp until which detection is locked
    // Use globalThis to avoid temporal-dead-zone when this block is entered multiple times
    const __serverContextLocks = (globalThis.__serverContextLocks =
      globalThis.__serverContextLocks || {});

    async function applyServerConfigContext(
      serverName,
      config,
      authoritative = false,
    ) {
      try {
        const now = Date.now();
        // If not authoritative and we are locked, skip applying to avoid overwrite
        if (
          !authoritative &&
          __serverContextLocks[serverName] &&
          now < __serverContextLocks[serverName]
        ) {
          console.debug(
            "applyServerConfigContext: skip due to active lock",
            serverName,
            { now, lockUntil: __serverContextLocks[serverName] },
          );
          return;
        }
        // If authoritative, set a short lock period to avoid races
        if (authoritative) __serverContextLocks[serverName] = now + 10000; // 10s

        // Détection robuste du type de serveur (prefer explicit config when present)
        let serverType =
          (config && (config.server_type || config.serverType)) || null;
        // Only override version if present in config (do not null out existing value)
        if (config && (config.version || config.mc_version))
          currentServerMcVersion =
            config.version || config.mc_version || currentServerMcVersion;

        // Si le type n'est pas stocké, essayer via plugins/mods installés
        if (!serverType) {
          try {
            const pluginsResp = await apiFetch(
              `/api/server/${serverName}/plugins/installed`,
            );
            const plugins = await pluginsResp.json();
            if (Array.isArray(plugins) && plugins.length > 0) {
              serverType = "paper";
            }
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
              // Déduire par config
              if (config.forge_version) serverType = "forge";
              else if (config.loader_version || config.server_type === "fabric")
                serverType = "fabric";
              else serverType = "fabric"; // Si on a des mods mais pas de config forge, c'est probablement fabric
            }
          } catch (e) {
            console.warn(
              "serverConfig: failed to check installed mods for",
              serverName,
              e,
            );
          }
        }

        // Fallback si le nom contient "fabric"
        if (
          serverName.toLowerCase().includes("fabric") &&
          serverType === "paper"
        ) {
          serverType = "fabric";
        }

        // Fallback final
        if (!serverType) serverType = "paper";

        // If the config explicitly provides server_type or loader_version, prefer it
        if (config && config.server_type) {
          serverType = config.server_type;
        }
        if (serverType === "forge") currentServerLoader = "forge";
        else if (serverType === "fabric") currentServerLoader = "fabric";
        else if (serverType === "neoforge") currentServerLoader = "neoforge";
        else if (serverType === "quilt") currentServerLoader = "quilt";
        else if (serverType === "paper") currentServerLoader = null;
        // If serverType is still null and not authoritative, do not force it to paper here
        if (!serverType && !authoritative) {
          console.debug(
            "applyServerConfigContext: leaving type unset (non-authoritative)",
          );
        }
        // Also prefer explicit loader_version / forge_version for completeness
        if (config && config.loader_version) currentServerLoader = "fabric";

        console.log("Server context updated:", {
          serverName,
          serverType,
          currentServerLoader,
          currentServerMcVersion,
        });

        const modsTab = document.querySelector('.tab[data-view="mods"]');
        const pluginsTab = document.querySelector('.tab[data-view="plugins"]');
        // If authoritative, enforce tab visibility strictly; otherwise only show probable tabs
        if (modsTab)
          modsTab.style.display =
            serverType && serverType !== "paper"
              ? ""
              : authoritative
                ? "none"
                : modsTab.style.display;
        if (pluginsTab)
          pluginsTab.style.display =
            serverType === "paper"
              ? ""
              : authoritative
                ? "none"
                : pluginsTab.style.display;

        const activeTab = document.querySelector(".tab.active")?.dataset?.view;
        if (activeTab === "mods") loadModsForCurrentServer("");
      } catch (e) {
        console.warn("applyServerConfigContext failed", e);
      }
    }

    try {
      const r = await apiFetch(`/api/server/${serverName}/config`);
      const config = await r.json();
      console.debug(
        "selectServer: initial config (type, keys):",
        typeof config,
        Object.keys(config || {}),
        config,
      );
      // Do not apply initial (possibly incomplete) context yet to avoid UI flicker.
      // Wait for authoritative fresh config and manager_config.json fallback below before applying context.

      // Use authoritative config from server and ensure UI is synced: re-fetch and re-apply (cache-busted)
      try {
        const cfgRes = await apiFetch(
          `/api/server/${serverName}/config?t=${Date.now()}`,
        );
        const cfgFresh = await cfgRes.json();
        console.debug(
          "selectServer: fetched config (fresh):",
          typeof cfgFresh,
          Object.keys(cfgFresh || {}),
          cfgFresh,
        );
        populateServerMetaUI(cfgFresh);
        // If the config lacks explicit server_type/version, try reading manager_config.json directly
        if (
          (!cfgFresh || !cfgFresh.server_type || !cfgFresh.version) &&
          currentServer
        ) {
          try {
            console.debug(
              "selectServer: config missing server_type/version, trying to read manager_config.json",
            );
            const mf = await apiFetch(
              `/api/server/${encodeURIComponent(serverName)}/files/read?path=manager_config.json`,
            );
            const mfj = await mf.json();
            if (mfj && mfj.status === "success" && mfj.content) {
              try {
                const parsed = JSON.parse(mfj.content);
                console.debug(
                  "selectServer: manager_config.json parsed",
                  parsed,
                );
                // Merge parsed into cfgFresh for UI
                const merged = Object.assign({}, cfgFresh || {}, parsed || {});
                populateServerMetaUI(merged);
                // Save last fetched merged config for manual application by the user
                (globalThis._lastServerConfigFetched =
                  globalThis._lastServerConfigFetched || {})[serverName] =
                  merged;
                try {
                  const btn = document.getElementById("btn-apply-server-meta");
                  if (btn) btn.disabled = false;
                } catch (e) {}
                showToast(
                  "info",
                  'Méthode: méta récupérée depuis manager_config.json — pressez "Mettre à jour" pour appliquer',
                );
              } catch (e) {
                console.warn(
                  "selectServer: manager_config.json parse failed",
                  e,
                );
              }
            } else {
              console.warn(
                "selectServer: manager_config.json not found or empty",
                mfj,
              );
            }
          } catch (e) {
            console.warn("selectServer: failed reading manager_config.json", e);
          }
        }
        // display debug info in UI for easier diagnosis
        try {
          const dbg = document.getElementById("server-config-debug");
          if (dbg) {
            dbg.style.display = "block";

            try {
              const jsonPre = dbg.querySelector(".server-config-json");
              if (jsonPre) {
                // Create rows for well-known keys and present them nicely
                const rows = [];
                const add = (k, v, icon) =>
                  rows.push(
                    `<div style=\"display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.02)\"><div style=\"width:28px;text-align:center;color:#94a3b8\">${icon || "•"}</div><div style=\"flex:1;color:#cbd5e1\"><div style=\"font-size:0.85em;color:#9fb4d4\">${escapeHtml(k)}</div><div style=\"font-weight:600;color:#e6eef8\">${escapeHtml(String(v === undefined || v === null ? "—" : v))}</div></div></div>`,
                  );
                add(
                  "Max joueurs",
                  cfgFresh["max-players"] || cfgFresh["max_players"] || "—",
                  '<i class="fas fa-users" style="color:#94a3b8"></i>',
                );
                add(
                  "Port",
                  cfgFresh["server-port"] || cfgFresh["port"] || "—",
                  '<i class="fas fa-network-wired" style="color:#94a3b8"></i>',
                );
                // Fetch installed mods count asynchronously
                try {
                  (async () => {
                    try {
                      const modsResp = await apiFetch(
                        `/api/server/${encodeURIComponent(serverName)}/mods`,
                      );
                      const modsData = await modsResp.json();
                      const mods = modsData.mods || modsData || [];
                      add(
                        "Mods installés",
                        Array.isArray(mods) ? mods.length : "—",
                        '<i class="fas fa-cubes" style="color:#94a3b8"></i>',
                      );
                      jsonPre.innerHTML =
                        rows.join("") +
                        `<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:8px\">`;
                    } catch (e) {
                      jsonPre.innerHTML =
                        rows.join("") +
                        `<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:8px\">`;
                    }
                  })();
                } catch (e) {
                  jsonPre.innerHTML =
                    rows.join("") +
                    `<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:8px\">`;
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
        await applyServerConfigContext(serverName, cfgFresh);
        // Inform user if mismatch
        if (
          (cfgFresh.server_type === "fabric" ||
            cfgFresh.loader_version ||
            cfgFresh.forge_version) &&
          (currentServerLoader === null || currentServerLoader === "paper")
        ) {
          showToast(
            "warning",
            "Attention: la configuration indique un serveur moddé, mais le système le détecte comme Paper — je force l'affichage.",
          );
        }
        // Warn if config clearly says modded but detection ended up paper
        if (
          (cfgFresh.server_type === "fabric" ||
            cfgFresh.loader_version ||
            cfgFresh.forge_version) &&
          (currentServerLoader === null || currentServerLoader === "paper")
        ) {
          console.warn(
            "selectServer: config indicates modded server but detected as paper",
            { cfgFresh, currentServerLoader },
          );
        }
        // Store the authoritative config for possible manual apply
        (globalThis._lastServerConfigFetched =
          globalThis._lastServerConfigFetched || {})[serverName] = cfgFresh;
        try {
          const btn = document.getElementById("btn-apply-server-meta");
          if (btn) btn.disabled = false;
        } catch (e) {}
      } catch (e) {
        console.warn("selectServer: failed to re-fetch config for UI sync", e);
        populateServerMetaUI(config);
      }
    } catch (e) {
      console.warn("Erreur recuperation config:", e);
    }
  })();

  startStatusPolling();

  switchTab("console");
}

function showServersList() {
  currentServer = null;

  stopStatusPolling();

  stopLogStream();

  const listView = document.getElementById("servers-list-view");

  const detailView = document.getElementById("server-detail-view");

  if (listView) listView.style.display = "block";

  if (detailView) detailView.style.display = "none";

  document
    .querySelectorAll(".server-item")
    .forEach((item) => item.classList.remove("active"));

  // Ne pas recharger la liste automatiquement pour eviter les flashs
}

// ================================

// STATUS POLLING

// ================================

function startStatusPolling() {
  stopStatusPolling();

  // Mise a jour toutes les 30 secondes

  statusInterval = setInterval(updateStatus, 30000);
}

function stopStatusPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

// Fetch and update server status UI for the currently selected server
async function updateStatus() {
  if (!currentServer) return;
  try {
    const response = await apiFetch(`/api/server/${currentServer}/status`);
    const status = await response.json();

    const badge = document.getElementById("detail-status");
    const statusText = document.getElementById("detail-status-text");
    const startBtn = document.getElementById("btn-start");
    const stopBtn = document.getElementById("btn-stop");
    const restartBtn = document.getElementById("btn-restart");

    if (status.running) {
      if (badge) badge.className = "status-badge online";
      if (statusText) statusText.textContent = "EN LIGNE";
      if (startBtn) startBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "flex";
      if (restartBtn) restartBtn.disabled = false;
      updateElement("stat-cpu", (status.cpu || 0).toFixed(1) + "%");
      updateElement("stat-ram", (status.ram_mb || 0) + " MB");
      updateElement("stat-players", status.players || "0");
      updateElement("stat-tps", status.tps || "20.0");
    } else {
      if (badge) badge.className = "status-badge offline";
      if (statusText) statusText.textContent = "HORS LIGNE";
      if (startBtn) startBtn.style.display = "flex";
      if (stopBtn) stopBtn.style.display = "none";
      if (restartBtn) restartBtn.disabled = true;
      updateElement("stat-cpu", "0%");
      updateElement("stat-ram", "0 MB");
      updateElement("stat-players", "0");
      updateElement("stat-tps", "0");
    }
  } catch (error) {
    console.error("Erreur statut:", error);
  }
}

async function searchModsAdmin() {
  const query = document.getElementById("mods-search-input-panel")?.value;
  const container = document.getElementById("mods-results-container");

  if (!query) return;

  if (container) container.innerHTML = '<div class="loader"></div>';

  try {
    const res = await apiFetch(`/api/mods/search`, {
      method: "POST",
      body: JSON.stringify({ query: query, limit: 10 }),
    });
    const data = await res.json();

    if (container) container.innerHTML = "";

    if (Array.isArray(data.hits)) {
      data.hits.forEach((mod) => {
        const row = document.createElement("div");
        row.className = "mod-row";
        row.innerHTML = `<div class="mod-left"><img src="${mod.icon_url || "/static/img/default_icon.svg"}" style="width:48px;height:48px;border-radius:4px;margin-right:10px"></div><div class="mod-body"><strong>${escapeHtml(mod.name)}</strong><div class="muted">${escapeHtml(mod.slug)}</div></div><div class="mod-actions"><button class="btn-sm" onclick="installMod('${mod.slug}')">Installer</button></div>`;
        container.appendChild(row);
      });
    } else {
      if (container)
        container.innerHTML = '<p class="text-muted">Aucun resultats</p>';
    }
  } catch (e) {
    if (container) container.innerHTML = '<p class="text-error">Erreur</p>';
  }
}

// Load mods for the currently selected server (uses currentServerLoader and currentServerMcVersion)
async function loadModsForCurrentServer(query) {
  let container = document.getElementById("mods-results-container");
  console.debug("loadModsForCurrentServer called", {
    currentServer,
    currentServerLoader,
    currentServerMcVersion,
    query,
  });
  // Defensive: recreate search box and container if missing (DOM may be altered)
  try {
    const view = document.getElementById("view-mods");
    if (view && !view.querySelector(".search-box")) {
      const header = document.createElement("div");
      header.className = "search-box";
      header.innerHTML = `
                <input type="text" id="mods-search-input-panel" placeholder="Rechercher un mod..." onkeyup="if(event.key === 'Enter') searchMods(this.value)">
                <button class="btn-primary" onclick="searchModsAdmin()"><i class="fas fa-search"></i></button>
            `;
      const firstChild = view.querySelector(".card-header") || view.firstChild;
      if (firstChild && firstChild.parentNode)
        firstChild.parentNode.insertBefore(header, firstChild.nextSibling);
    }
    if (!container) {
      const view = document.getElementById("view-mods");
      if (view) {
        const c = document.createElement("div");
        c.id = "mods-results-container";
        c.className = "settings-grid";
        c.style =
          "margin-top:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;";
        view.appendChild(c);
      }
    }
  } catch (e) {
    console.warn("loadModsForCurrentServer: defensive DOM repair failed", e);
  }
  // refresh reference in case we created it
  container = document.getElementById("mods-results-container");
  if (!container) return;
  if (!container) return;
  container.innerHTML = '<div class="loader"></div>';
  // If no server selected, show a global mods manager with server selector
  if (!currentServer) {
    container.innerHTML = '<div class="loader"></div>'; // keep loader while fetching servers
    try {
      // Fetch available servers for selection
      const r = await apiFetch("/api/servers");
      const servers = (await r.json()) || [];
      let html = `
                <div class="mods-global-header" style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
                    <select id="mods-target-server" style="min-width:220px"><option value="">-- Sélectionner un serveur (optionnel) --</option>${servers.map((s) => `<option value="${s}">${escapeHtml(s)}</option>`).join("")}</select>
                    <input id="mods-global-search" type="text" placeholder="Rechercher un mod..." style="flex:1" />
                    <button class="btn-primary" id="mods-global-search-btn">Rechercher</button>
                    <button class="btn-secondary" id="mods-global-refresh-btn">Rafraîchir</button>
                </div>
                <div id="mods-global-results" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px"></div>
            `;
      container.innerHTML = html;

      const searchInput = document.getElementById("mods-global-search");
      document
        .getElementById("mods-global-search-btn")
        .addEventListener("click", () =>
          loadGlobalMods(searchInput.value || ""),
        );
      document
        .getElementById("mods-global-refresh-btn")
        .addEventListener("click", () =>
          loadGlobalMods(searchInput.value || ""),
        );
      document
        .getElementById("mods-target-server")
        .addEventListener("change", () =>
          loadGlobalMods(searchInput.value || ""),
        );

      // initial load
      await loadGlobalMods(query || "");
    } catch (e) {
      console.error("Erreur loading global mods manager:", e);
      container.innerHTML = '<p class="text-error">Erreur</p>';
    }
    return;
  }

  try {
    const q = query || "";
    const loader = currentServerLoader || "";
    const version = currentServerMcVersion || "";
    const resp = await apiFetch(
      `/api/mods/search?q=${encodeURIComponent(q)}&loader=${encodeURIComponent(loader)}&version=${encodeURIComponent(version)}`,
    );
    const data = await resp.json();
    let hits = data.results || data.result || data.hits || [];
    console.debug("mods search response", {
      loader,
      version,
      q,
      resultKeys: Object.keys(data || {}),
      hitsCount: Array.isArray(hits) ? hits.length : 0,
    });

    // If no search hits, fall back to popular mods for the loader/version
    if (!Array.isArray(hits) || hits.length === 0) {
      try {
        const pop = await apiFetch(
          `/api/mods/popular?loader=${encodeURIComponent(loader)}&version=${encodeURIComponent(version)}&limit=30`,
        );
        const popData = await pop.json();
        hits = popData.results || popData.result || popData.hits || [];
        console.debug("mods popular fallback response", {
          loader,
          version,
          resultKeys: Object.keys(popData || {}),
          hitsCount: Array.isArray(hits) ? hits.length : 0,
        });
        if (Array.isArray(hits) && hits.length > 0) {
          // prepend a small notice
          container.innerHTML =
            '<p class="muted">Aucun résultat direct — affichage des mods populaires pour ce loader.</p>';
        }
      } catch (e) {
        console.warn("fallback to popular mods failed", e);
      }
    }

    if (!Array.isArray(hits) || hits.length === 0) {
      container.innerHTML = '<p class="text-muted">Aucun mod trouvé</p>';
      return;
    }

    // If server is Fabric (or has mods installed), provide an upload zone and installed mods list
    let html = "";
    // Ensure we check for 'fabric' loader correctly; but also treat servers with installed mods as 'fabric manager' capable
    let isFabric = loader === "fabric" || currentServerLoader === "fabric";
    if (!isFabric) {
      try {
        const probe = await apiFetch(`/api/server/${currentServer}/mods`);
        const probeData = await probe.json();
        const probeInstalled = Array.isArray(probeData.mods)
          ? probeData.mods
          : [];
        if (probeInstalled.length > 0) isFabric = true;
      } catch (e) {
        /* ignore */
      }
    }

    if (isFabric) {
      html += `
                <div class="mods-fabric-manager" style="grid-column: 1 / -1; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="margin:0"><i class="fas fa-microchip"></i> Gestionnaire Fabric</h4>
                        <div>
                            <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                                <i class="fas fa-upload"></i> Uploader un mod (.jar)
                                <input type="file" id="fabric-mod-upload" accept=".jar" style="display:none" onchange="handleModUpload(this.files)">
                            </label>
                        </div>
                    </div>
                    <div id="fabric-installed-mods" class="installed-mods-list" style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="loader-small"></div> Chargement des mods installés...
                    </div>
                </div>
            `;
    }

    html += hits
      .slice(0, 30)
      .map(
        (h) => `
            <div class="mod-card">
                <div class="mod-left"><img src="${h.icon_url || "/static/img/default_icon.svg"}" style="width:48px;height:48px;border-radius:4px;margin-right:10px"></div>
                <div class="mod-body"><strong>${escapeHtml(h.name)}</strong><div class="muted">${escapeHtml(h.slug)}</div></div>
                <div class="mod-actions"><button class="btn-sm" onclick="openInstallModModal('${h.slug.replace("'", "\\'")}', '${escapeHtmlAttr(h.name)}')">Installer</button></div>
            </div>
        `,
      )
      .join("");

    container.innerHTML = html;

    // If fabric, fetch installed mods and render
    if (isFabric) {
      try {
        const r2 = await apiFetch(`/api/server/${currentServer}/mods`);
        const d2 = await r2.json();
        const installed = Array.isArray(d2.mods)
          ? d2.mods
          : d2.status === "success" && Array.isArray(d2.mods)
            ? d2.mods
            : [];
        const el = document.getElementById("fabric-installed-mods");
        console.debug("installed mods fetched", {
          currentServer,
          installedCount: Array.isArray(installed) ? installed.length : 0,
          raw: d2,
        });
        if (el) {
          if (installed.length === 0) {
            el.innerHTML =
              '<p class="text-muted" style="font-size:0.9em; margin:0;">Aucun mod détecté dans le dossier /mods</p>';
          } else {
            el.innerHTML = installed
              .map(
                (m) => `
                            <div class="installed-mod-row" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:4px;">
                                <span style="font-family:monospace; font-size:0.9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${escapeHtml(m.filename || m.name || String(m))}</span>
                                <button class="btn-danger btn-sm" style="padding:2px 8px;" onclick="uninstallMod('${escapeHtmlAttr(m.filename || m.name || "")}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        `,
              )
              .join("");
          }
        }
      } catch (e) {
        console.warn("fetch installed mods failed", e);
        const el = document.getElementById("fabric-installed-mods");
        if (el)
          el.innerHTML =
            '<p class="text-error">Erreur lors du chargement des mods installés</p>';
      }
    }
  } catch (e) {
    console.error("Erreur loading mods for server:", e);
    container.innerHTML = '<p class="text-error">Erreur</p>';
  }
}

// Load mods globally (used when no currentServer selected)
async function loadGlobalMods(query) {
  const container = document.getElementById("mods-global-results");
  if (!container) return;
  container.innerHTML = '<div class="loader"></div>';
  try {
    const serverSelect = document.getElementById("mods-target-server");
    const targetServer = serverSelect?.value || null;
    const loader = targetServer
      ? (
          await (
            await apiFetch(
              `/api/server/${encodeURIComponent(targetServer)}/config`,
            )
          ).json()
        ).loader_version || null
      : "";
    const version = targetServer
      ? (
          await (
            await apiFetch(
              `/api/server/${encodeURIComponent(targetServer)}/config`,
            )
          ).json()
        ).version || null
      : "";

    const resp = await apiFetch(
      `/api/mods/search?q=${encodeURIComponent(query || "")}&loader=${encodeURIComponent(loader || "")}&version=${encodeURIComponent(version || "")}`,
    );
    const data = await resp.json();
    const hits = data.result || data.results || data.hits || [];

    if (!Array.isArray(hits) || hits.length === 0) {
      container.innerHTML = '<p class="text-muted">Aucun mod trouvé</p>';
      return;
    }

    container.innerHTML = hits
      .slice(0, 30)
      .map(
        (h) => `
            <div class="mod-card">
                <div class="mod-left"><img src="${h.icon_url || "/static/img/default_icon.svg"}" style="width:48px;height:48px;border-radius:4px;margin-right:10px"></div>
                <div class="mod-body"><strong>${escapeHtml(h.name)}</strong><div class="muted">${escapeHtml(h.slug)}</div></div>
                <div class="mod-actions"><button class="btn-sm" onclick="openInstallModModal('${h.slug.replace("'", "\\'")}', '${escapeHtmlAttr(h.name)}')">Installer</button></div>
            </div>
        `,
      )
      .join("");
  } catch (e) {
    console.error("Erreur loading global mods:", e);
    container.innerHTML = '<p class="text-error">Erreur</p>';
  }
}

async function openInstallModModal(projectId, projectName) {
  const modalId = "install-mod-modal";
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement("div");
    modal.id = modalId;
    modal.className = "modal";
    modal.innerHTML = `
            <div class="modal-content modal-medium">
                <div class="modal-header"><h3>Installer <span id="im-name"></span></h3><button class="btn-close" onclick="closeInstallModModal()"><i class="fas fa-times"></i></button></div>
                <div class="modal-body">
                    <p>Sélectionnez une version compatible :</p>
                    <select id="im-version-select" class="setting-select" style="width:100%"></select>
                </div>
                <div class="modal-actions"><button class="btn-secondary" onclick="closeInstallModModal()">Annuler</button><button class="btn-primary" id="im-install-btn">Installer</button></div>
            </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById("im-name").textContent = projectName;
  document.getElementById("im-version-select").innerHTML =
    "<option>Chargement...</option>";
  modal.classList.add("show");

  try {
    // Determine target server (currentServer or selected in modal)
    let targetServer = currentServer || null;
    const sel = document.getElementById("im-version-select");

    async function fetchAndPopulateVersionsForServer(serverName) {
      try {
        const cfgResp = await apiFetch(
          `/api/server/${encodeURIComponent(serverName)}/config`,
        );
        const cfg = await cfgResp.json();
        const loader = cfg.loader_version || cfg.server_type || "";
        const version = cfg.version || cfg.mc_version || "";
        const r = await apiFetch(
          `/api/mods/compatible?project_id=${encodeURIComponent(projectId)}&loader=${encodeURIComponent(loader)}&version=${encodeURIComponent(version)}`,
        );
        const d = await r.json();
        const versions = d.versions || d || [];
        const installBtn = document.getElementById("im-install-btn");
        if (Array.isArray(versions) && versions.length > 0) {
          sel.innerHTML = versions
            .map((v) => {
              const id =
                v.id || v.version_id || v.version_number || JSON.stringify(v);
              const label = v.version_number || v.version || v.name || id;
              return `<option value="${id}">${escapeHtml(label)}</option>`;
            })
            .join("");
          if (installBtn) installBtn.disabled = false;
          // enable install button only when a real selection is present
          sel.addEventListener("change", () => {
            if (installBtn) installBtn.disabled = !sel.value;
          });
        } else {
          sel.innerHTML =
            '<option value="">Sélectionnez une version compatible</option>';
          if (installBtn) installBtn.disabled = true;
        }
      } catch (e) {
        console.warn("fetchAndPopulateVersionsForServer failed", e);
        sel.innerHTML =
          '<option value="">Erreur récupération versions</option>';
      }
    }

    // If no currentServer, insert a server selector into the modal
    if (!targetServer) {
      try {
        const serversResp = await apiFetch("/api/servers");
        const servers = (await serversResp.json()) || [];
        const container = modal.querySelector(".modal-body");
        const selectHtml = `<div style="margin-bottom:8px">Serveur cible: <select id="im-target-server"><option value="">-- Sélectionner --</option>${servers.map((s) => `<option value="${s}">${escapeHtml(s)}</option>`).join("")}</select></div>`;
        container.insertAdjacentHTML("afterbegin", selectHtml);
        const targetSelect = document.getElementById("im-target-server");
        targetSelect.addEventListener("change", async () => {
          const sv = targetSelect.value || null;
          targetServer = sv;
          if (sv) await fetchAndPopulateVersionsForServer(sv);
        });
        // Pre-select first server if available
        if (servers.length > 0) {
          targetServer = servers[0];
          document.getElementById("im-target-server").value = targetServer;
          await fetchAndPopulateVersionsForServer(targetServer);
        }
      } catch (e) {
        console.warn("openInstallModModal: failed to load servers", e);
      }
    } else {
      // We have a currentServer; populate versions for it
      await fetchAndPopulateVersionsForServer(targetServer);
    }

    document.getElementById("im-install-btn").onclick = async () => {
      const selEl = document.getElementById("im-version-select");
      const selVal = selEl ? selEl.value || null : null;
      if (!targetServer) {
        showToast("error", "Sélectionnez un serveur cible");
        return;
      }
      // Require a selected compatible version
      if (!selVal) {
        showToast("error", "Sélectionnez une version compatible");
        return;
      }

      // Close modal immediately and show installation toast to improve UX
      try {
        closeInstallModModal();
      } catch (e) {}
      showToast("info", "Installation en cours...");

      try {
        const cfgResp = await apiFetch(
          `/api/server/${encodeURIComponent(targetServer)}/config`,
        );
        const cfg = await cfgResp.json();
        const payload = {
          project_id: projectId,
          version_id: selVal,
          loader: cfg.loader_version || cfg.server_type,
          mc_version: cfg.version || cfg.mc_version,
        };
        console.debug("modal install payload", { targetServer, payload });
        const res = await apiFetch(
          `/api/server/${encodeURIComponent(targetServer)}/mods/install`,
          { method: "POST", body: JSON.stringify(payload) },
        );
        const result = await res.json();
        const ok =
          result && (result.status === "success" || result.success === true);
        if (ok) {
          showToast("success", result.message || "Mod installé");
          // Refresh installed mods UI for the current server view if applicable
          try {
            if (targetServer === currentServer) await refreshInstalledMods();
          } catch (e) {
            console.warn("refreshInstalledMods after modal install failed", e);
          }
          // Refresh the mods lists (global or server view)
          try {
            if (targetServer === currentServer) loadModsForCurrentServer("");
            else loadGlobalMods("");
          } catch (e) {
            console.warn("refresh mods view after install failed", e);
          }
        } else {
          showToast("error", result.message || "Erreur installation");
        }
      } catch (e) {
        console.error("modal install apiFetch failed", e);
        // Attempt raw fetch to capture server response for debugging
        try {
          const raw = await fetch(
            `/api/server/${encodeURIComponent(targetServer)}/mods/install`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": getCsrfToken(),
              },
              body: JSON.stringify(payload),
            },
          );
          const text = await raw.text();
          console.error("modal install raw response", raw.status, text);
          showToast("error", `Erreur installation (${raw.status})`);
        } catch (rawErr) {
          console.error("modal install raw fetch failed", rawErr);
          showToast("error", "Erreur API");
        }
      }
    };
  } catch (e) {
    console.error("Erreur compat versions:", e);
    document.getElementById("im-version-select").innerHTML =
      '<option value="">Erreur</option>';
  }
}

function closeInstallModModal() {
  const m = document.getElementById("install-mod-modal");
  if (m) m.classList.remove("show");
}

// ================================

// SERVER ACTIONS

// ================================

async function serverAction(action) {
  if (!currentServer) return;

  try {
    showToast(
      "info",
      `${action === "start" ? "Demarrage" : action === "stop" ? "Arreªt" : "Redemarrage"} en cours...`,
    );

    const response = await apiFetch(`/api/server/${currentServer}/${action}`, {
      method: "POST",

      credentials: "include",
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", result.message || "Action effectuée");

      setTimeout(() => {
        try {
          updateStatus();
        } catch (e) {
          console.warn("updateStatus after action failed", e);
        }
        try {
          loadLogs();
        } catch (e) {
          console.warn("loadLogs after action failed", e);
        }
      }, 1000);
      try {
        const activeTab = document.querySelector(".tab.active")?.dataset?.view;
        if (activeTab === "console") startLogStream();
      } catch (e) {
        console.warn("startLogStream check failed", e);
      }
    } else {
      showToast("error", result.message || "Action echoue");
    }
  } catch (error) {
    console.error("Erreur action:", error);

    showToast("error", "Erreur lors de l'action");
  }
}

async function backupServer() {
  if (!currentServer) return;

  try {
    showToast("info", "Creation de la sauvegarde...");

    const response = await apiFetch(`/api/server/${currentServer}/backup`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Sauvegarde cree");

      const backupsView = document.getElementById("view-backups");

      if (backupsView && backupsView.classList.contains("active"))
        loadBackups();
    } else {
      showToast("error", result.message || "Erreur sauvegarde");
    }
  } catch (error) {
    console.error("Erreur backup:", error);

    showToast("error", "Erreur lors de la sauvegarde");
  }
}

async function deleteServer() {
  if (!currentServer) return;

  if (
    !confirm(
      `Supprimer le serveur "${currentServer}" ?\n\nCette action est irreversible !`,
    )
  )
    return;

  const serverToDelete = currentServer;

  try {
    showToast("info", "Suppression en cours...");

    const response = await apiFetch(`/api/server/${serverToDelete}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Serveur supprime");

      // Reset current server

      currentServer = null;

      // Reset lastServerList pour forcer le refresh

      lastServerList = [];

      // Recharger la liste des serveurs avec force refresh

      await loadServerList(true);

      // Retourner a la vue liste

      showServersList();
    } else {
      showToast("error", result.message || "Erreur suppression");
    }
  } catch (error) {
    console.error("Erreur suppression:", error);

    showToast("error", "Erreur lors de la suppression");
  }
}

// ================================

// TABS

// ================================

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

  if (view) view.classList.add("active");

  if (tab) tab.classList.add("active");

  if (view) {
    try {
      view.style.display = "block";
    } catch (e) {}
  }

  if (viewName === "console") startLogStream();
  if (viewName === "files") loadFiles("");
  else stopLogStream();

  if (viewName === "players") loadPlayers();

  if (viewName === "plugins") loadInstalledPlugins();

  if (viewName === "mods") loadModsForCurrentServer("");

  if (viewName === "config") loadConfig();

  if (viewName === "backups") loadBackups();

  if (viewName === "stats") refreshServerStats();
}

// ================================

// CONSOLE

// ================================

function startLogStream() {
  stopLogStream();

  loadLogs();

  // Mise a jour des logs toutes les 5 secondes

  logInterval = setInterval(loadLogs, 5000);
}

function stopLogStream() {
  if (logInterval) {
    clearInterval(logInterval);
    logInterval = null;
  }
}

async function loadLogs() {
  if (!currentServer) return;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/logs`);

    const data = await response.json();

    allLogs = data.logs || [];

    renderLogs();
  } catch (error) {
    console.error("Erreur logs:", error);
  }
}

// Optimized log rendering with virtual scrolling consideration

let logRenderPending = false;

function renderLogs() {
  if (logRenderPending) return;

  logRenderPending = true;

  requestAnimationFrame(() => {
    logRenderPending = false;

    const logsDiv = document.getElementById("logs");

    if (!logsDiv) return;

    const searchTerm =
      document.getElementById("log-search")?.value.toLowerCase() || "";

    let filteredLogs = allLogs.filter((line) => {
      if (logFilter !== "all") {
        if (
          logFilter === "error" &&
          !line.includes("ERROR") &&
          !line.includes("SEVERE")
        )
          return false;

        if (logFilter === "warn" && !line.includes("WARN")) return false;

        if (logFilter === "info" && !line.includes("INFO")) return false;
      }

      if (searchTerm && !line.toLowerCase().includes(searchTerm)) return false;

      return true;
    });

    // Limiter le nombre de logs affichés pour les performances

    const maxLogs = performanceSettings.maxLogLines;

    if (filteredLogs.length > maxLogs) {
      filteredLogs = filteredLogs.slice(-maxLogs);
    }

    if (filteredLogs.length === 0) {
      logsDiv.innerHTML = '<div class="log-empty">Aucun log</div>';

      return;
    }

    // Utiliser DocumentFragment pour de meilleures performances

    const fragment = document.createDocumentFragment();

    filteredLogs.forEach((line) => {
      const div = document.createElement("div");

      div.className = "log-line";

      if (line.includes("ERROR") || line.includes("SEVERE"))
        div.className += " error";
      else if (line.includes("WARN")) div.className += " warning";
      else if (line.includes("INFO")) div.className += " info";

      div.textContent = line;

      fragment.appendChild(div);
    });

    logsDiv.innerHTML = "";

    logsDiv.appendChild(fragment);

    if (autoScroll) logsDiv.scrollTop = logsDiv.scrollHeight;
  });
}

function filterLogs(filter) {
  logFilter = filter;

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });

  renderLogs();
}

// Debounce pour la recherche

let searchTimeout = null;

function searchLogs() {
  clearTimeout(searchTimeout);

  searchTimeout = setTimeout(renderLogs, 200);
}

// Amélioration 24: handleCommandInput amélioré est défini plus haut

async function sendCommand(cmd) {
  try {
    if (!currentServer) return;
    // If a command is supplied, use it; otherwise read from the input field
    let command = typeof cmd === "string" && cmd.trim() ? cmd.trim() : null;
    const input = document.getElementById("cmd-input");
    if (!command) {
      command = input ? input.value.trim() : "";
    }
    if (!command) return;

    // Amélioration 25: Ajouter à l'historique
    if (command !== commandHistory[0]) {
      commandHistory.unshift(command);
      if (commandHistory.length > MAX_COMMAND_HISTORY) {
        commandHistory.pop();
      }
      saveCommandHistory();
    }
    commandHistoryIndex = -1;

    // Amélioration 26: Incrémenter les stats
    sessionStats.commandsSent++;
    sessionStats.apiCalls++;

    try {
      const response = await apiFetch(`/api/server/${currentServer}/command`, {
        method: "POST",

        body: JSON.stringify({ command }),
      });
      const result = await response.json();
      if (result.status === "success") {
        try {
          if (input) input.value = "";
        } catch (e) {}

        // Amélioration 27: Afficher la commande dans la console
        appendCommandToConsole(command);

        setTimeout(loadLogs, 500);
      } else {
        showToast("error", result.message || "Erreur");
      }
    } catch (error) {
      console.error("Erreur commande:", error);
      sessionStats.errors++;
      showToast("error", "Erreur envoi commande");
    }
  } catch (error) {
    // Defensive catch for ReferenceError (e.g., input undefined) or other sync errors
    console.error("sendCommand top-level error:", error);
    sessionStats.errors++;
    try {
      showToast("error", "Erreur envoi commande");
    } catch (e) {}
  }
}

// Amélioration 28: Afficher la commande envoyée dans la console
function appendCommandToConsole(command) {
  const logsDiv = document.getElementById("logs");
  if (logsDiv) {
    const cmdLine = document.createElement("div");
    cmdLine.className = "log-line log-command";
    cmdLine.innerHTML = `<span class="cmd-prompt-inline">></span> ${escapeHtml(command)}`;
    logsDiv.appendChild(cmdLine);
    if (autoScroll) {
      logsDiv.scrollTop = logsDiv.scrollHeight;
    }
  }
}

// Amélioration 29: Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ================================

// PLAYERS

// ================================

let currentPlayerName = null;
let currentPlayerUUID = null;
let onlinePlayersCache = []; // Liste des joueurs en ligne

async function loadPlayers() {
  if (!currentServer) return;

  sessionStats.apiCalls++;

  try {
    // Récupérer les joueurs en ligne via RCON ou logs
    let onlinePlayers = [];
    try {
      const onlineResp = await apiFetch(
        `/api/server/${currentServer}/online-players`,
      );
      if (onlineResp.ok) {
        const contentType = onlineResp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const onlineData = await onlineResp.json();
          onlinePlayers = onlineData.players || [];
        }
      }
    } catch (e) {
      console.warn("Impossible de récupérer les joueurs en ligne:", e);
    }
    onlinePlayersCache = onlinePlayers.map((p) =>
      p.name ? p.name.toLowerCase() : p.toLowerCase(),
    );

    // Récupérer tous les joueurs (usercache.json)
    const response = await apiFetch(`/api/server/${currentServer}/players`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Réponse invalide");
    }

    const allPlayers = await response.json();
    const grid = document.getElementById("players-grid");
    if (!grid) return;

    // Mettre à jour le compteur
    const onlineCount = onlinePlayers.length;
    const totalCount = allPlayers ? allPlayers.length : 0;
    updatePlayerTabCount(onlineCount, totalCount);

    if (!allPlayers || allPlayers.length === 0) {
      grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>Aucun joueur n'a encore rejoint ce serveur</p>
                    <small>Les joueurs apparaîtront ici après leur première connexion</small>
                </div>
            `;
      return;
    }

    // Cache des joueurs
    allPlayers.forEach((p) => {
      cachedPlayers[p.name] = { ...p, lastSeen: Date.now() };
    });

    // Trier: en ligne d'abord, puis par nom
    const sortedPlayers = [...allPlayers].sort((a, b) => {
      const aOnline = isPlayerOnline(a.name);
      const bOnline = isPlayerOnline(b.name);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    grid.innerHTML = sortedPlayers
      .map((player) => {
        const isOnline = isPlayerOnline(player.name);
        const statusClass = isOnline ? "online" : "offline";
        const statusIcon = isOnline ? "circle" : "circle";
        const statusColor = isOnline ? "#4CAF50" : "#666";
        const statusText = isOnline ? "En ligne" : "Hors ligne";

        return `
            <div class="player-card ${statusClass}" onclick="openPlayerModal('${player.name}', '${player.uuid}')" style="cursor:pointer">
                <div class="player-status-indicator" style="background:${statusColor}" title="${statusText}"></div>
                <img src="https://mc-heads.net/avatar/${player.name}/48" 
                     alt="${player.name}" 
                     class="player-avatar"
                     loading="lazy"
                     onerror="this.src='https://mc-heads.net/avatar/MHF_Steve/48'">
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-status ${statusClass}">
                        <i class="fas fa-${statusIcon}" style="color:${statusColor}"></i> ${statusText}
                    </span>
                </div>
                <div class="player-actions">
                    ${
                      isOnline
                        ? `
                        <button onclick="event.stopPropagation(); sendWhisperToPlayer('${player.name}')" title="Message" class="btn-small btn-success">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button onclick="event.stopPropagation(); playerAction('${player.name}', 'kick')" title="Kick" class="btn-small btn-warning">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    `
                        : ""
                    }
                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'op')" title="OP" class="btn-small">
                        <i class="fas fa-crown"></i>
                    </button>
                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'ban')" title="Ban" class="btn-small btn-danger">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
            `;
      })
      .join("");
  } catch (error) {
    console.error("Erreur joueurs:", error);
    sessionStats.errors++;

    const grid = document.getElementById("players-grid");
    if (grid) {
      grid.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erreur de chargement des joueurs</p>
                    <button onclick="loadPlayers()" class="btn-retry">
                        <i class="fas fa-sync"></i> Réessayer
                    </button>
                </div>
            `;
    }
  }
}

// Vérifier si un joueur est en ligne
function isPlayerOnline(playerName) {
  if (!playerName) return false;
  return onlinePlayersCache.includes(playerName.toLowerCase());
}

// Mettre à jour le compteur de joueurs dans l'onglet
function updatePlayerTabCount(onlineCount, totalCount) {
  const tab = document.querySelector('.tab[data-view="players"]');
  if (tab) {
    const icon = tab.querySelector("i");
    const iconHtml = icon ? icon.outerHTML : '<i class="fas fa-users"></i>';
    if (totalCount > 0) {
      tab.innerHTML = `${iconHtml} Joueurs <span class="badge-counter">${onlineCount}/${totalCount}</span>`;
    } else {
      tab.innerHTML = `${iconHtml} Joueurs`;
    }
  }
}

// Envoyer un message privé
function sendWhisperToPlayer(playerName) {
  const message = prompt(`Message à ${playerName}:`);
  if (message && message.trim()) {
    executeCommand(`tell ${playerName} ${message.trim()}`);
  }
}

// Exécuter une commande silencieuse
async function executeCommand(command) {
  if (!currentServer) return;

  try {
    await apiFetch(`/api/server/${currentServer}/command`, {
      method: "POST",

      body: JSON.stringify({ command }),
    });
  } catch (error) {
    console.error("Erreur commande:", error);
  }
}

async function openPlayerModal(name, uuid) {
  currentPlayerName = name;
  currentPlayerUUID = uuid;

  // Mettre a jour le header du modal
  const avatar = document.getElementById("player-modal-avatar");
  const nameEl = document.getElementById("player-modal-name");
  const uuidEl = document.getElementById("player-modal-uuid");

  if (avatar) avatar.src = `https://mc-heads.net/body/${name}/100`;
  if (nameEl) nameEl.textContent = name;
  if (uuidEl) uuidEl.textContent = uuid || "UUID inconnu";

  // Afficher le modal
  const modal = document.getElementById("player-modal");
  if (modal) modal.classList.add("show");

  // Charger les details du joueur
  await loadPlayerDetails(uuid);
}

function closePlayerModal() {
  const modal = document.getElementById("player-modal");
  if (modal) modal.classList.remove("show");

  currentPlayerName = null;

  currentPlayerUUID = null;
}

async function loadPlayerDetails(uuid) {
  if (!currentServer || !uuid) return;

  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/player/${uuid}`,
    );

    const data = await response.json();

    // Mettre à jour les stats avec interface interactive
    const healthValue = data.health || 20;
    const foodValue = data.food || 20;
    const xpLevel = data.xp_level || 0;

    // Barre de vie interactive
    const healthContainer = document.getElementById("player-health-container");
    if (healthContainer) {
      healthContainer.innerHTML = renderHealthBar(
        healthValue,
        currentPlayerName,
      );
    } else {
      document.getElementById("player-health").textContent = healthValue;
    }

    // Barre de faim interactive
    const foodContainer = document.getElementById("player-food-container");
    if (foodContainer) {
      foodContainer.innerHTML = renderFoodBar(foodValue, currentPlayerName);
    } else {
      document.getElementById("player-food").textContent = foodValue;
    }

    document.getElementById("player-xp").textContent = xpLevel;

    document.getElementById("player-deaths").textContent =
      data.stats?.deaths || 0;

    document.getElementById("player-playtime").textContent =
      data.stats?.play_time || "0h 0m";

    if (data.position) {
      document.getElementById("player-pos").textContent =
        `${data.position.x}, ${data.position.y}, ${data.position.z}`;
    } else {
      document.getElementById("player-pos").textContent = "N/A";
    }

    // Afficher l'inventaire avec textures améliorées

    renderInventory("player-inventory", data.inventory || [], 36);

    renderInventory("player-enderchest", data.enderchest || [], 27);

    renderArmor(data.armor || [], data.offhand);
  } catch (error) {
    console.error("Erreur chargement details joueur:", error);

    showToast("error", "Impossible de charger les details du joueur");
  }
}

/**
 * Rend la barre de vie interactive avec coeurs Minecraft
 */
function renderHealthBar(health, playerName) {
  const maxHealth = 20;
  const fullHearts = Math.floor(health / 2);
  const halfHeart = health % 2 === 1;
  const emptyHearts = Math.floor((maxHealth - health) / 2);

  let hearts = "";

  // Coeurs pleins
  for (let i = 0; i < fullHearts; i++) {
    hearts += '<span class="mc-heart full">❤</span>';
  }
  // Demi coeur
  if (halfHeart) {
    hearts += '<span class="mc-heart half">💔</span>';
  }
  // Coeurs vides
  for (let i = 0; i < emptyHearts; i++) {
    hearts += '<span class="mc-heart empty">🖤</span>';
  }

  const isOnline = isPlayerOnline(playerName);
  const disabledAttr = isOnline ? "" : "disabled";
  const disabledClass = isOnline ? "" : "disabled";

  return `
        <div class="mc-stat-bar health-bar">
            <div class="hearts-display">${hearts}</div>
            <div class="stat-controls">
                <button class="btn-stat-control btn-heal ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'health', -2)" title="Retirer 1 coeur" ${disabledAttr}>
                    <i class="fas fa-minus"></i>
                </button>
                <span class="stat-value">${health}/20</span>
                <button class="btn-stat-control btn-heal ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'health', 2)" title="Ajouter 1 coeur" ${disabledAttr}>
                    <i class="fas fa-plus"></i>
                </button>
                <button class="btn-stat-control btn-full-heal ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'health', 20)" title="Soigner complètement" ${disabledAttr}>
                    <i class="fas fa-heart"></i> Max
                </button>
            </div>
            ${!isOnline ? '<span class="stat-offline-notice">Joueur hors ligne</span>' : ""}
        </div>
    `;
}

/**
 * Rend la barre de faim interactive avec jambons Minecraft
 */
function renderFoodBar(food, playerName) {
  const maxFood = 20;
  const fullFood = Math.floor(food / 2);
  const halfFood = food % 2 === 1;
  const emptyFood = Math.floor((maxFood - food) / 2);

  let foodIcons = "";

  // Nourriture pleine
  for (let i = 0; i < fullFood; i++) {
    foodIcons += '<span class="mc-food full">🍖</span>';
  }
  // Demi nourriture
  if (halfFood) {
    foodIcons += '<span class="mc-food half">🍗</span>';
  }
  // Nourriture vide
  for (let i = 0; i < emptyFood; i++) {
    foodIcons += '<span class="mc-food empty">🦴</span>';
  }

  const isOnline = isPlayerOnline(playerName);
  const disabledAttr = isOnline ? "" : "disabled";
  const disabledClass = isOnline ? "" : "disabled";

  return `
        <div class="mc-stat-bar food-bar">
            <div class="food-display">${foodIcons}</div>
            <div class="stat-controls">
                <button class="btn-stat-control btn-food ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'food', -2)" title="Affamer" ${disabledAttr}>
                    <i class="fas fa-minus"></i>
                </button>
                <span class="stat-value">${food}/20</span>
                <button class="btn-stat-control btn-food ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'food', 2)" title="Nourrir" ${disabledAttr}>
                    <i class="fas fa-plus"></i>
                </button>
                <button class="btn-stat-control btn-full-food ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'food', 20)" title="Rassasier complètement" ${disabledAttr}>
                    <i class="fas fa-drumstick-bite"></i> Max
                </button>
            </div>
            ${!isOnline ? '<span class="stat-offline-notice">Joueur hors ligne</span>' : ""}
        </div>
    `;
}

/**
 * Modifie les stats d'un joueur (vie ou faim) via commande
 */
async function modifyPlayerStat(playerName, stat, amount) {
  if (!currentServer || !playerName) return;

  try {
    let command = "";

    if (stat === "health") {
      if (amount === 20) {
        // Soigner complètement
        command = `effect give ${playerName} minecraft:instant_health 1 10`;
      } else if (amount > 0) {
        // Ajouter de la vie
        command = `effect give ${playerName} minecraft:instant_health 1 0`;
      } else {
        // Retirer de la vie
        command = `damage ${playerName} ${Math.abs(amount)}`;
      }
    } else if (stat === "food") {
      if (amount === 20) {
        // Rassasier complètement
        command = `effect give ${playerName} minecraft:saturation 1 10`;
      } else if (amount > 0) {
        // Nourrir
        command = `effect give ${playerName} minecraft:saturation 1 0`;
      } else {
        // Affamer
        command = `effect give ${playerName} minecraft:hunger 5 1`;
      }
    }

    if (command) {
      const response = await apiFetch(`/api/server/${currentServer}/command`, {
        method: "POST",

        body: JSON.stringify({ command }),
      });

      if (response.ok) {
        showNotification(
          `${stat === "health" ? "Vie" : "Faim"} modifiée pour ${playerName}`,
          "success",
        );
        // Recharger les détails du joueur après un délai
        setTimeout(() => loadPlayerDetails(currentPlayerUUID), 1000);
      } else {
        throw new Error("Commande échouée");
      }
    }
  } catch (error) {
    console.error("Erreur modification stat:", error);
    showNotification("Impossible de modifier les stats du joueur", "error");
  }
}

/**
 * URLs des textures Minecraft avec fallbacks multiples (sources fiables 2024)
 */
const TEXTURE_SOURCES = [
  // Source 1: MinecraftItems API - Direct CDN
  (id) =>
    `https://minecraftitemids.com/item/32/${id.replace("minecraft:", "")}.png`,
  // Source 2: GitHub Raw - PrismarineJS assets
  (id) =>
    `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20/items/${id.replace("minecraft:", "")}.png`,
  // Source 3: Alternative GitHub
  (id) =>
    `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20/assets/minecraft/textures/item/${id.replace("minecraft:", "")}.png`,
  // Source 4: Fallback vers image par défaut
  (id) =>
    `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' fill='%23666'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='12'>?</text></svg>`,
];

// Cache pour éviter les requêtes répétées
const textureCache = new Map();
const failedTextures = new Set();

function getItemImageUrl(itemId) {
  // Clean up item ID
  const id = itemId.replace("minecraft:", "").toLowerCase();

  // Vérifier le cache
  if (textureCache.has(id)) {
    return textureCache.get(id);
  }

  // Retourner la première source (les fallbacks sont gérés par handleItemImageError)
  return TEXTURE_SOURCES[0](id);
}

function handleItemImageError(img, itemId) {
  const id = itemId.replace("minecraft:", "").toLowerCase();

  if (!img.dataset.fallbackIndex) {
    img.dataset.fallbackIndex = 1;
  }

  const idx = Number.parseInt(img.dataset.fallbackIndex);
  if (idx < TEXTURE_SOURCES.length) {
    img.dataset.fallbackIndex = idx + 1;
    img.src = TEXTURE_SOURCES[idx](id);
  } else {
    // Afficher une icône par défaut avec le nom
    img.style.display = "none";
    const parent = img.parentElement;
    if (parent && !parent.querySelector(".item-fallback")) {
      const fallback = document.createElement("div");
      fallback.className = "item-fallback";
      fallback.innerHTML = `<i class="fas fa-cube"></i><span>${formatItemName(id).substring(0, 8)}</span>`;
      parent.appendChild(fallback);
    }
  }
}

/**
 * Rend l'inventaire d'un joueur avec grille Minecraft style
 * @param {string} containerId - ID du conteneur HTML
 * @param {Array} items - Liste des items {slot, id, count}
 * @param {number} slots - Nombre total de slots (36 pour inventaire, 27 pour enderchest)
 */
function renderInventory(containerId, items, slots) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Map des items par slot
  const itemMap = new Map();
  let totalItems = 0;

  items.forEach((item) => {
    itemMap.set(item.slot, item);
    totalItems += item.count || 1;
  });

  const invType = containerId.includes("enderchest")
    ? "enderchest"
    : "inventory";
  const usedSlots = items.length;

  // Construction du HTML
  let slotsHtml = "";
  for (let i = 0; i < slots; i++) {
    const item = itemMap.get(i);
    if (item) {
      const itemName = formatItemName(item.id);
      slotsHtml += `
                <div class="inv-slot has-item" title="${itemName} x${item.count}">
                    <img src="${getItemImageUrl(item.id)}" 
                         onerror="handleItemImageError(this, '${item.id}')"
                         alt="${itemName}">
                    ${item.count > 1 ? `<span class="item-count">${item.count}</span>` : ""}
                </div>`;
    } else {
      slotsHtml += '<div class="inv-slot"></div>';
    }
  }

  container.innerHTML = `
        <div class="inventory-header">
            <span class="inventory-count">
                <i class="fas fa-box"></i> ${usedSlots}/${slots} slots • ${totalItems} items
            </span>
            <button class="btn-add-item" onclick="openAddItemModal('${invType}')">
                <i class="fas fa-plus"></i> Ajouter
            </button>
        </div>
        <div class="inventory-grid">${slotsHtml}</div>
    `;
}

/**
 * Ouvre le modal pour ajouter un item
 */
function openAddItemModal(invType, slot = null) {
  // Créer le modal s'il n'existe pas
  let modal = document.getElementById("add-item-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "add-item-modal";
    modal.className = "modal";
    modal.innerHTML = `
            <div class="modal-content modal-medium">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> Ajouter un item</h3>
                    <button class="btn-close" onclick="closeAddItemModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="add-item-form">
                        <div class="form-group">
                            <label>Rechercher un item</label>
                            <div class="search-input-wrapper">
                                <i class="fas fa-search"></i>
                                <input type="text" id="item-search-input" 
                                       placeholder="Ex: diamond_sword, netherite_pickaxe..."
                                       oninput="searchMinecraftItems(this.value)">
                            </div>
                        </div>
                        
                        <div class="item-categories">
                            <button class="category-btn active" onclick="filterItemCategory('all', this)">Tous</button>
                            <button class="category-btn" onclick="filterItemCategory('weapons', this)">Armes</button>
                            <button class="category-btn" onclick="filterItemCategory('tools', this)">Outils</button>
                            <button class="category-btn" onclick="filterItemCategory('armor', this)">Armure</button>
                            <button class="category-btn" onclick="filterItemCategory('blocks', this)">Blocs</button>
                            <button class="category-btn" onclick="filterItemCategory('food', this)">Nourriture</button>
                            <button class="category-btn" onclick="filterItemCategory('misc', this)">Divers</button>
                        </div>
                        
                        <div class="items-grid" id="items-search-results">
                            <!-- Items seront affichés ici -->
                        </div>
                        
                        <div class="selected-item-preview" id="selected-item-preview" style="display: none;">
                            <div class="preview-content">
                                <img id="preview-item-img" src="" alt="">
                                <div class="preview-info">
                                    <strong id="preview-item-name"></strong>
                                    <span id="preview-item-id"></span>
                                </div>
                            </div>
                            <div class="quantity-selector">
                                <label>Quantité:</label>
                                <button class="qty-btn" onclick="adjustItemQuantity(-10)">-10</button>
                                <button class="qty-btn" onclick="adjustItemQuantity(-1)">-</button>
                                <input type="number" id="item-quantity" value="1" min="1" max="64">
                                <button class="qty-btn" onclick="adjustItemQuantity(1)">+</button>
                                <button class="qty-btn" onclick="adjustItemQuantity(10)">+10</button>
                                <button class="qty-btn qty-max" onclick="setItemQuantity(64)">64</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeAddItemModal()">Annuler</button>
                    <button class="btn-primary" id="btn-give-item" onclick="giveItemToPlayer()" disabled>
                        <i class="fas fa-gift"></i> Donner l'item
                    </button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);
  }

  // Stocker le type d'inventaire et le slot
  modal.dataset.invType = invType;
  modal.dataset.slot = slot !== null ? slot : "";

  // Afficher le modal
  modal.classList.add("show");

  // Charger les items populaires par défaut
  loadPopularItems();

  // Focus sur la recherche
  setTimeout(() => {
    document.getElementById("item-search-input").focus();
  }, 100);
}

/**
 * Ferme le modal d'ajout d'item
 */
function closeAddItemModal() {
  const modal = document.getElementById("add-item-modal");
  if (modal) {
    modal.classList.remove("show");
    // Reset
    document.getElementById("item-search-input").value = "";
    document.getElementById("selected-item-preview").style.display = "none";
    document.getElementById("btn-give-item").disabled = true;
    selectedItemToGive = null;
  }
}

// Item sélectionné pour donner
let selectedItemToGive = null;

/**
 * Liste des items Minecraft populaires par catégorie
 */
const MINECRAFT_ITEMS = {
  weapons: [
    "diamond_sword",
    "netherite_sword",
    "iron_sword",
    "golden_sword",
    "stone_sword",
    "wooden_sword",
    "bow",
    "crossbow",
    "trident",
    "mace",
  ],
  tools: [
    "diamond_pickaxe",
    "netherite_pickaxe",
    "iron_pickaxe",
    "golden_pickaxe",
    "stone_pickaxe",
    "diamond_axe",
    "netherite_axe",
    "iron_axe",
    "diamond_shovel",
    "netherite_shovel",
    "diamond_hoe",
    "netherite_hoe",
    "shears",
    "flint_and_steel",
    "fishing_rod",
  ],
  armor: [
    "diamond_helmet",
    "diamond_chestplate",
    "diamond_leggings",
    "diamond_boots",
    "netherite_helmet",
    "netherite_chestplate",
    "netherite_leggings",
    "netherite_boots",
    "iron_helmet",
    "iron_chestplate",
    "iron_leggings",
    "iron_boots",
    "golden_helmet",
    "golden_chestplate",
    "golden_leggings",
    "golden_boots",
    "elytra",
    "shield",
    "turtle_helmet",
  ],
  blocks: [
    "diamond_block",
    "netherite_block",
    "iron_block",
    "gold_block",
    "emerald_block",
    "obsidian",
    "crying_obsidian",
    "glowstone",
    "sea_lantern",
    "beacon",
    "tnt",
    "end_crystal",
    "respawn_anchor",
    "enchanting_table",
    "anvil",
  ],
  food: [
    "golden_apple",
    "enchanted_golden_apple",
    "cooked_beef",
    "cooked_porkchop",
    "golden_carrot",
    "bread",
    "cake",
    "cookie",
    "pumpkin_pie",
    "suspicious_stew",
  ],
  misc: [
    "ender_pearl",
    "eye_of_ender",
    "blaze_rod",
    "nether_star",
    "dragon_egg",
    "totem_of_undying",
    "elytra",
    "firework_rocket",
    "experience_bottle",
    "name_tag",
    "diamond",
    "netherite_ingot",
    "emerald",
    "lapis_lazuli",
    "redstone",
  ],
};

/**
 * Charge les items populaires
 */
function loadPopularItems() {
  const container = document.getElementById("items-search-results");
  if (!container) return;

  // Afficher tous les items populaires
  const allItems = [
    ...MINECRAFT_ITEMS.weapons.slice(0, 4),
    ...MINECRAFT_ITEMS.tools.slice(0, 4),
    ...MINECRAFT_ITEMS.armor.slice(0, 4),
    ...MINECRAFT_ITEMS.food.slice(0, 4),
    ...MINECRAFT_ITEMS.misc.slice(0, 4),
  ];

  displayItemsGrid(allItems);
}

/**
 * Filtre les items par catégorie
 */
function filterItemCategory(category, btn) {
  // Update active button
  document
    .querySelectorAll(".category-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  let items;
  if (category === "all") {
    items = [
      ...MINECRAFT_ITEMS.weapons,
      ...MINECRAFT_ITEMS.tools,
      ...MINECRAFT_ITEMS.armor,
      ...MINECRAFT_ITEMS.food,
      ...MINECRAFT_ITEMS.misc,
    ];
  } else {
    items = MINECRAFT_ITEMS[category] || [];
  }

  displayItemsGrid(items);
}

/**
 * Recherche des items Minecraft
 */
function searchMinecraftItems(query) {
  if (!query || query.length < 2) {
    loadPopularItems();
    return;
  }

  const searchTerm = query.toLowerCase().replace(/\s+/g, "_");
  const allItems = [
    ...MINECRAFT_ITEMS.weapons,
    ...MINECRAFT_ITEMS.tools,
    ...MINECRAFT_ITEMS.armor,
    ...MINECRAFT_ITEMS.blocks,
    ...MINECRAFT_ITEMS.food,
    ...MINECRAFT_ITEMS.misc,
  ];

  const filtered = allItems.filter((item) => item.includes(searchTerm));

  // Si pas de résultat dans la liste, permettre l'entrée manuelle
  if (filtered.length === 0) {
    displayItemsGrid([searchTerm], true);
  } else {
    displayItemsGrid(filtered);
  }
}

/**
 * Affiche la grille d'items
 */
function displayItemsGrid(items, isCustom = false) {
  const container = document.getElementById("items-search-results");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<div class="no-items">Aucun item trouvé</div>';
    return;
  }

  let html = "";
  items.forEach((item) => {
    const itemName = formatItemName(item);
    html += `
            <div class="item-option ${isCustom ? "custom-item" : ""}" 
                 onclick="selectItemToGive('${item}')"
                 title="${itemName}">
                <img src="${getItemImageUrl(item)}" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                     alt="${itemName}">
                <div class="item-fallback-icon" style="display:none;">
                    <i class="fas fa-cube"></i>
                </div>
                <span class="item-option-name">${itemName}</span>
            </div>
        `;
  });

  container.innerHTML = html;
}

/**
 * Sélectionne un item à donner
 */
function selectItemToGive(itemId) {
  selectedItemToGive = itemId;

  // Afficher la preview
  const preview = document.getElementById("selected-item-preview");
  preview.style.display = "flex";

  document.getElementById("preview-item-img").src = getItemImageUrl(itemId);
  document.getElementById("preview-item-name").textContent =
    formatItemName(itemId);
  document.getElementById("preview-item-id").textContent =
    `minecraft:${itemId}`;
  document.getElementById("item-quantity").value = 1;

  // Activer le bouton
  document.getElementById("btn-give-item").disabled = false;

  // Highlight l'item sélectionné
  document
    .querySelectorAll(".item-option")
    .forEach((el) => el.classList.remove("selected"));
  event.currentTarget.classList.add("selected");
}

/**
 * Ajuste la quantité d'item
 */
function adjustItemQuantity(delta) {
  const input = document.getElementById("item-quantity");
  let value = Number.parseInt(input.value) + delta;
  value = Math.max(1, Math.min(64, value));
  input.value = value;
}

/**
 * Définit la quantité d'item
 */
function setItemQuantity(value) {
  document.getElementById("item-quantity").value = value;
}

/**
 * Donne l'item au joueur via commande
 */
async function giveItemToPlayer() {
  if (!selectedItemToGive || !currentPlayerName || !currentServer) {
    showToast("error", "Erreur: informations manquantes");
    return;
  }

  const quantity =
    Number.parseInt(document.getElementById("item-quantity").value) || 1;
  const command = `give ${currentPlayerName} minecraft:${selectedItemToGive} ${quantity}`;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/command`, {
      method: "POST",

      body: JSON.stringify({ command }),
    });

    if (response.ok) {
      showToast(
        "success",
        `${formatItemName(selectedItemToGive)} x${quantity} donné à ${currentPlayerName}`,
      );
      closeAddItemModal();

      // Rafraîchir l'inventaire après un délai
      setTimeout(() => {
        if (currentPlayerUUID) {
          loadPlayerDetails(currentPlayerUUID);
        }
      }, 1000);
    } else {
      throw new Error("Erreur commande");
    }
  } catch (error) {
    console.error("Erreur give item:", error);
    showToast("error", "Impossible de donner l'item");
  }
}

/**
 * Ouvre le menu contextuel pour un item
 */
function openItemContextMenu(event, invType, slot, itemId, count) {
  event.stopPropagation();

  // Supprimer ancien menu
  const oldMenu = document.getElementById("item-context-menu");
  if (oldMenu) oldMenu.remove();

  const itemName = formatItemName(itemId);

  const menu = document.createElement("div");
  menu.id = "item-context-menu";
  menu.className = "context-menu";
  menu.innerHTML = `
        <div class="context-menu-header">
            <img src="${getItemImageUrl(itemId)}" alt="${itemName}">
            <div>
                <strong>${itemName}</strong>
                <span>x${count}</span>
            </div>
        </div>
        <div class="context-menu-actions">
            <button onclick="clearInventorySlot(${slot}, '${itemId}')">
                <i class="fas fa-trash"></i> Supprimer
            </button>
            <button onclick="giveMoreOfItem('${itemId}')">
                <i class="fas fa-plus"></i> En donner plus
            </button>
            <button onclick="copyItemCommand('${itemId}')">
                <i class="fas fa-copy"></i> Copier commande
            </button>
        </div>
    `;

  // Positionner le menu
  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.zIndex = "10000";

  document.body.appendChild(menu);

  // Fermer au clic ailleurs
  setTimeout(() => {
    document.addEventListener("click", function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    });
  }, 10);
}

/**
 * Supprime un item du slot (via clear)
 */
async function clearInventorySlot(slot, itemId) {
  if (!currentPlayerName || !currentServer) return;

  const itemName = itemId.replace("minecraft:", "");
  const command = `clear ${currentPlayerName} ${itemId} 64`;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/command`, {
      method: "POST",

      body: JSON.stringify({ command }),
    });

    if (response.ok) {
      showToast(
        "success",
        `${formatItemName(itemName)} supprimé de l'inventaire`,
      );

      // Fermer le menu contextuel
      const menu = document.getElementById("item-context-menu");
      if (menu) menu.remove();

      // Rafraîchir l'inventaire
      setTimeout(() => {
        if (currentPlayerUUID) {
          loadPlayerDetails(currentPlayerUUID);
        }
      }, 500);
    }
  } catch (error) {
    showToast("error", "Erreur lors de la suppression");
  }
}

/**
 * Donne plus d'un item existant
 */
function giveMoreOfItem(itemId) {
  const menu = document.getElementById("item-context-menu");
  if (menu) menu.remove();

  openAddItemModal("inventory");

  // Pré-sélectionner l'item
  setTimeout(() => {
    selectItemToGive(itemId.replace("minecraft:", ""));
  }, 200);
}

/**
 * Copie la commande give pour un item
 */
function copyItemCommand(itemId) {
  const command = `/give @p ${itemId} 1`;
  navigator.clipboard.writeText(command).then(() => {
    showToast("success", "Commande copiée!");
  });

  const menu = document.getElementById("item-context-menu");
  if (menu) menu.remove();
}

function renderArmor(armor, offhand) {
  const container = document.getElementById("player-armor");

  if (!container) return;

  const armorSlots = [
    { slot: 103, name: "Casque", icon: "hard-hat" },

    { slot: 102, name: "Plastron", icon: "tshirt" },

    { slot: 101, name: "Jambieres", icon: "socks" },

    { slot: 100, name: "Bottes", icon: "shoe-prints" },
  ];

  const armorMap = {};

  armor.forEach((item) => {
    armorMap[item.slot] = item;
  });

  let html = "";

  armorSlots.forEach((slot) => {
    const item = armorMap[slot.slot];

    if (item) {
      const itemName = formatItemName(item.id);

      html += `

                <div class="armor-slot has-item" title="${itemName}">

                    <img src="${getItemImageUrl(item.id)}" 

                         onerror="handleItemImageError(this, '${item.id}')"

                         alt="${slot.name}">

                    <span>${slot.name}</span>

                </div>

            `;
    } else {
      html += `

                <div class="armor-slot">

                    <i class="fas fa-${slot.icon}"></i>

                    <span>${slot.name}</span>

                </div>

            `;
    }
  });

  // Offhand

  if (offhand) {
    const offhandName = formatItemName(offhand.id);

    html += `

            <div class="armor-slot has-item" title="${offhandName}">

                <img src="${getItemImageUrl(offhand.id)}" 

                     onerror="handleItemImageError(this, '${offhand.id}')"

                     alt="Offhand">

                <span>Seconde main</span>

            </div>

        `;
  } else {
    html += `

            <div class="armor-slot">

                <i class="fas fa-hand-paper"></i>

                <span>Seconde main</span>

            </div>

        `;
  }

  container.innerHTML = html;
}

function formatItemName(id) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function switchInventoryTab(tab) {
  // Desactiver tous les onglets

  document
    .querySelectorAll(".inv-tab")
    .forEach((t) => t.classList.remove("active"));

  document
    .querySelectorAll(".inventory-container")
    .forEach((c) => (c.style.display = "none"));

  // Activer l'onglet selectionne (utiliser l'élément passé si disponible)
  try {
    if (typeof el !== "undefined" && el && el.classList)
      el.classList.add("active");
    else {
      const fallback = document.querySelector(`.inv-tab[onclick*="${tab}"]`);
      if (fallback) fallback.classList.add("active");
    }
  } catch (e) {
    console.warn("switchInventoryTab: failed to set active tab", e);
  }

  const view = document.getElementById(`${tab}-view`);
  if (view) view.style.display = "block";
}

async function playerAction(pseudo, action) {
  if (!currentServer) return;

  // Confirmation pour les actions dangereuses

  if (action === "ban" && !confirm(`Voulez-vous vraiment bannir ${pseudo} ?`))
    return;

  if (
    action === "kick" &&
    !confirm(`Voulez-vous vraiment expulser ${pseudo} ?`)
  )
    return;

  if (action === "kill" && !confirm(`Voulez-vous vraiment tuer ${pseudo} ?`))
    return;

  if (
    action === "clear" &&
    !confirm(`Voulez-vous vraiment vider l'inventaire de ${pseudo} ?`)
  )
    return;

  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/player/action`,
      {
        method: "POST",

        body: JSON.stringify({ pseudo, act: action }),
      },
    );

    const result = await response.json();

    if (result.status === "success") {
      const actionNames = {
        op: "OP accorde e ",

        deop: "OP retire de",

        kick: "Expulse:",

        ban: "Banni:",

        kill: "Tue:",

        clear: "Inventaire vide:",

        gm_s: "Mode survie pour",

        gm_c: "Mode creatif pour",
      };

      showToast("success", `${actionNames[action] || action} ${pseudo}`);

      loadPlayers();

      // Recharger les details si le modal est ouvert

      if (currentPlayerUUID) {
        await loadPlayerDetails(currentPlayerUUID);
      }
    } else {
      showToast("error", result.message || "Action echoue");
    }
  } catch (error) {
    console.error("Erreur action joueur:", error);

    showToast("error", "Erreur lors de l'action");
  }
}

// ================================

// PLUGINS - Amélioré

// ================================

async function loadInstalledPlugins() {
  if (!currentServer) return;

  // Amélioration 36: Stats de session
  sessionStats.apiCalls++;

  const container = document.getElementById("installed-plugins");
  if (!container) {
    console.warn("Conteneur installed-plugins non trouvé");
    return;
  }

  // Afficher le loading
  container.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Chargement des plugins...</p>
        </div>
    `;

  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/plugins/installed`,
    );

    // Vérifier le Content-Type avant de parser
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      console.error("Réponse non-JSON:", contentType);
      container.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erreur de chargement</p>
                    <small>Le serveur n'a pas retourné des données valides</small>
                </div>
            `;
      return;
    }

    const plugins = await response.json();

    // Amélioration 37: Mettre à jour le compteur dans l'onglet
    const pluginCount = Array.isArray(plugins) ? plugins.length : 0;
    updatePluginTabCount(pluginCount);

    if (!plugins || !Array.isArray(plugins) || plugins.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-puzzle-piece"></i>
                    <p>Aucun plugin installé</p>
                    <small>Recherchez des plugins ci-dessous</small>
                </div>
            `;
      return;
    }

    container.innerHTML = plugins
      .map(
        (plugin) => `
            <div class="plugin-card installed">
                <div class="plugin-info">
                    <div class="plugin-icon"><i class="fas fa-puzzle-piece"></i></div>
                    <div class="plugin-details">
                        <h4>${escapeHtml(plugin.name || "Inconnu")}</h4>
                        <span class="plugin-meta">
                            <span class="plugin-size">${plugin.size_mb || 0} MB</span>
                            ${plugin.version ? `<span class="plugin-version">v${escapeHtml(plugin.version)}</span>` : ""}
                        </span>
                    </div>
                </div>
                <div class="plugin-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); reloadPlugin('${escapeHtml(plugin.name)}')" title="Recharger">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="btn-danger-sm" onclick="uninstallPlugin('${escapeHtml(plugin.name)}')" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Erreur plugins:", error);
    sessionStats.errors++;
    container.innerHTML = `
            <div class="empty-state error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur de chargement</p>
                <small>${escapeHtml(error.message || "Erreur inconnue")}</small>
            </div>
        `;
  }
}

// Amélioration 38: Mettre à jour le compteur de plugins
function updatePluginTabCount(count) {
  const tab = document.querySelector('.tab[data-view="plugins"]');
  if (tab) {
    const icon = tab.querySelector("i");
    const iconHtml = icon
      ? icon.outerHTML
      : '<i class="fas fa-puzzle-piece"></i>';
    tab.innerHTML = `${iconHtml} Plugins ${count > 0 ? `<span class="badge-counter">${count}</span>` : ""}`;
  }
}

// Amélioration 39: Recharger un plugin
async function reloadPlugin(pluginName) {
  if (!currentServer) return;

  try {
    // Envoyer la commande de reload
    await executeCommand(`plugman reload ${pluginName}`);
    showToast("success", `Plugin ${pluginName} rechargé`);
  } catch (error) {
    showToast("error", "Erreur rechargement plugin");
  }
}

// Amélioration 40: Recherche de plugins avec debounce
const debouncedSearchPlugins = debounce(async () => {
  const query = document.getElementById("plugin-search")?.value.trim();
  if (query && query.length >= 3) {
    await searchPlugins();
  }
}, 500);

async function searchPlugins() {
  const query = document.getElementById("plugin-search")?.value.trim();
  if (!query) {
    showToast("info", "Entrez un terme de recherche");
    return;
  }

  sessionStats.apiCalls++;

  try {
    showToast("info", "Recherche en cours...");
    const response = await apiFetch(
      `/api/plugins/search?q=${encodeURIComponent(query)}`,
      {
        credentials: "include",
      },
    );
    const data = await response.json();
    const plugins = data.result || [];
    const container = document.getElementById("search-results");
    if (!container) return;

    if (plugins.length === 0) {
      container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Aucun plugin trouvé pour "${escapeHtml(query)}"</p>
                </div>
            `;
      return;
    }

    container.innerHTML = plugins
      .map(
        (plugin) => `
            <div class="plugin-card search-result">
                <div class="plugin-info">
                    <div class="plugin-icon"><i class="fas fa-puzzle-piece"></i></div>
                    <div class="plugin-details">
                        <h4>${escapeHtml(plugin.name)}</h4>
                        <p class="plugin-desc">${escapeHtml(plugin.description || "Pas de description")}</p>
                        <span class="plugin-meta">
                            <span><i class="fas fa-download"></i> ${plugin.stats?.downloads || 0}</span>
                            <span><i class="fas fa-star"></i> ${plugin.stats?.stars || 0}</span>
                        </span>
                    </div>
                </div>
                <button class="btn-primary-sm" onclick="installPlugin('${plugin.namespace?.owner || ""}/${plugin.namespace?.slug || plugin.name}', '${escapeHtml(plugin.name)}')" title="Installer">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `,
      )
      .join("");
    showToast("success", `${plugins.length} plugin(s) trouvé(s)`);
  } catch (error) {
    console.error("Erreur recherche:", error);

    showToast("error", "Erreur de recherche");
  }
}

async function installPlugin(slug, name) {
  if (!currentServer) return;

  try {
    showToast("info", `Installation de ${name}...`);

    // Amélioration Sécurité 6: S'assurer que le token CSRF est présent
    await ensureCsrfToken();

    const response = await apiFetch(
      `/api/server/${currentServer}/plugins/install`,
      {
        method: "POST",
        body: JSON.stringify({ slug }),
      },
    );

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", `${name} installé avec succès`);
      loadInstalledPlugins();
    } else {
      showToast("error", result.message || "Installation échouée");
    }
  } catch (error) {
    console.error("Erreur installation:", error);
    showToast("error", `Erreur installation: ${error.message}`);
  }
}

// Amélioration Sécurité 7: Désinstallation avec CSRF robuste
async function uninstallPlugin(name) {
  if (!currentServer) return;
  if (!confirm(`Désinstaller ${name} ?`)) return;

  try {
    await ensureCsrfToken();

    const response = await apiFetch(
      `/api/server/${currentServer}/plugins/uninstall`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", `${name} désinstallé`);
      loadInstalledPlugins();
    } else {
      showToast("error", result.message || "Erreur de désinstallation");
    }
  } catch (error) {
    console.error("Erreur désinstallation:", error);
    showToast("error", `Erreur: ${error.message}`);
  }
}

async function uploadPlugin(file) {
  if (!currentServer || !file) return;

  if (!file.name.endsWith(".jar")) {
    showToast("error", "Le fichier doit eªtre un .jar");

    return;
  }

  try {
    showToast("info", `Upload de ${file.name}...`);

    const formData = new FormData();

    formData.append("plugin", file);

    // Ensure CSRF token is fresh and include it
    await ensureCsrfToken();
    const _csrf = getCsrfToken();
    if (_csrf) formData.append("csrf_token", _csrf);

    const response = await apiFetch(
      `/api/server/${currentServer}/plugins/upload`,
      {
        method: "POST",
        body: formData,
        headers: { "X-CSRF-Token": _csrf },
      },
    );

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", `${file.name} installe avec succe¨s`);

      loadInstalledPlugins();
    } else {
      showToast("error", result.message || "Erreur upload");
    }
  } catch (error) {
    console.error("Erreur upload plugin:", error);

    showToast("error", "Erreur lors de l'upload");
  }

  // Reset input

  document.getElementById("plugin-upload").value = "";
}

// ================================

// CONFIGURATION - Améliorée
// ================================

// Amélioration 41: Traductions françaises des propriétés server.properties
const CONFIG_LABELS = {
  motd: "Message d'accueil (MOTD)",
  "server-port": "Port du serveur",
  "max-players": "Nombre max de joueurs",
  "white-list": "Liste blanche activée",
  "online-mode": "Mode en ligne (anti-crack)",
  pvp: "Combat PvP activé",
  difficulty: "Difficulté du jeu",
  gamemode: "Mode de jeu par défaut",
  "allow-nether": "Nether activé",
  "allow-end": "End activé",
  "view-distance": "Distance de vue (chunks)",
  "simulation-distance": "Distance simulation (chunks)",
  "spawn-protection": "Protection du spawn (blocs)",
  "level-seed": "Seed du monde",
  "level-name": "Nom du monde",
  "level-type": "Type de monde",
  "allow-flight": "Vol autorisé (anti-kick)",
  "enforce-whitelist": "Forcer la whitelist",
  "spawn-monsters": "Apparition des monstres",
  "spawn-animals": "Apparition des animaux",
  "spawn-npcs": "Apparition des PNJ",
  hardcore: "Mode Hardcore",
  "enable-command-block": "Blocs de commande activés",
  "generate-structures": "Génération des structures",
  "max-world-size": "Taille max du monde",
  "player-idle-timeout": "Timeout inactivité (min)",
  "op-permission-level": "Niveau permission OP",
  "enable-rcon": "RCON activé",
  "rcon.port": "Port RCON",
  "rcon.password": "Mot de passe RCON",
  "enable-query": "Query activé",
  "query.port": "Port Query",
  "server-ip": "IP du serveur (vide = toutes)",
  "network-compression-threshold": "Seuil compression réseau",
  "max-tick-time": "Temps max par tick (ms)",
  "use-native-transport": "Transport natif Linux",
  "prevent-proxy-connections": "Bloquer les proxys",
  "enable-status": "Statut serveur activé",
  "broadcast-console-to-ops": "Console visible par OPs",
  "broadcast-rcon-to-ops": "RCON visible par OPs",
  "function-permission-level": "Niveau permission fonctions",
  "rate-limit": "Limite de requêtes",
  "sync-chunk-writes": "Écriture chunks synchrone",
  "resource-pack": "URL du resource pack",
  "resource-pack-sha1": "SHA1 du resource pack",
  "require-resource-pack": "Resource pack obligatoire",
  "entity-broadcast-range-percentage": "Portée diffusion entités (%)",
  "force-gamemode": "Forcer le mode de jeu",
  "hide-online-players": "Cacher joueurs en ligne",
};

async function loadConfig() {
  if (!currentServer) return;

  sessionStats.apiCalls++;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/config`);
    const config = await response.json();
    const grid = document.getElementById("config-grid");
    if (!grid) return;

    // Amélioration 42: Trier les clés alphabétiquement
    const sortedEntries = Object.entries(config).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    grid.innerHTML = sortedEntries
      .map(([key, value]) => {
        const label = CONFIG_LABELS[key] || key;
        const inputId = `config-${key.replace(/\./g, "-")}`;
        const isBoolean =
          typeof value === "boolean" || value === "true" || value === "false";
        const isNumber =
          !Number.isNaN(Number(value)) && value !== "" && !isBoolean;

        // Amélioration 43: Types d'input adaptés
        if (isBoolean) {
          const checked = value === true || value === "true";
          return `
                    <div class="config-item config-toggle">
                        <label class="config-label">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <label class="switch">
                            <input type="checkbox" id="${inputId}" data-key="${key}" ${checked ? "checked" : ""}>
                            <span class="switch-slider"></span>
                        </label>
                    </div>
                `;
        } else if (isNumber) {
          return `
                    <div class="config-item">
                        <label class="config-label" for="${inputId}">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <input type="number" id="${inputId}" class="config-input" value="${escapeHtml(String(value))}" data-key="${key}">
                    </div>
                `;
        } else {
          // Amélioration 44: Textarea pour valeurs longues
          const isLong = key === "motd" || String(value).length > 50;
          if (isLong) {
            return `
                        <div class="config-item config-wide">
                            <label class="config-label" for="${inputId}">
                                <span class="config-name">${label}</span>
                                <span class="config-key">${key}</span>
                            </label>
                            <textarea id="${inputId}" class="config-textarea" data-key="${key}" rows="2">${escapeHtml(String(value))}</textarea>
                        </div>
                    `;
          }
          return `
                    <div class="config-item">
                        <label class="config-label" for="${inputId}">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <input type="text" id="${inputId}" class="config-input" value="${escapeHtml(String(value))}" data-key="${key}">
                    </div>
                `;
        }
      })
      .join("");
  } catch (error) {
    console.error("Erreur config:", error);
    sessionStats.errors++;
  }
}

async function saveConfig() {
  if (!currentServer) return;

  sessionStats.apiCalls++;

  try {
    const config = {};

    // Amélioration 45: Récupérer inputs, checkboxes et textareas
    document
      .querySelectorAll("#config-grid input, #config-grid textarea")
      .forEach((el) => {
        const key = el.dataset.key;
        if (key) {
          if (el.type === "checkbox") {
            config[key] = el.checked;
          } else {
            config[key] = el.value;
          }
        }
      });

    const response = await apiFetch(`/api/server/${currentServer}/config`, {
      method: "POST",

      body: JSON.stringify(config),
    });
    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Configuration sauvegardée");
      playNotificationSound("success");
      // Also update server meta if meta inputs are present
      try {
        const metaVersion = document.getElementById(
          "server-meta-version",
        )?.value;
        const metaType = document.getElementById("server-meta-type")?.value;
        const metaLoader = document.getElementById("server-meta-loader")?.value;
        const metaForge = document.getElementById("server-meta-forge")?.value;
        if (metaVersion || metaType || metaLoader || metaForge) {
          await apiJson(`/api/server/${currentServer}/meta`, {
            method: "POST",
            body: JSON.stringify({
              version: metaVersion,
              server_type: metaType,
              loader_version: metaLoader,
              forge_version: metaForge,
            }),
          });
          showToast("success", "Méta serveur mise à jour");
        }
      } catch (e) {
        console.warn("Erreur sauvegarde meta:", e);
      }
    } else {
      showToast("error", result.message || "Erreur");
    }
  } catch (error) {
    console.error("Erreur sauvegarde config:", error);
    sessionStats.errors++;
    showToast("error", "Erreur sauvegarde");
  }
}

// Sauvegarder manuellement la méta du serveur (version/type/loader/forge)
async function saveServerMetaFromUI() {
  if (!currentServer) return showToast("error", "Sélectionnez un serveur");
  const versionEl = document.getElementById("server-meta-version");
  const typeEl = document.getElementById("server-meta-type");
  const loaderEl = document.getElementById("server-meta-loader");
  const forgeEl = document.getElementById("server-meta-forge");

  const payload = {
    version: versionEl ? versionEl.value.trim() : undefined,
    server_type: typeEl ? typeEl.value : undefined,
    loader_version: loaderEl ? loaderEl.value.trim() : undefined,
    forge_version: forgeEl ? forgeEl.value.trim() : undefined,
  };

  try {
    await apiJson(`/api/server/${currentServer}/meta`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("success", "Méta serveur mise à jour");
    // Refresh server list and detail so visible badge updates immediately
    await loadServerList(true);
    try {
      selectServer(currentServer);
    } catch (e) {
      console.warn(
        "saveServerMetaFromUI: selecting server after save failed",
        e,
      );
    }
  } catch (e) {
    showToast("error", e.message || "Erreur sauvegarde méta");
  }
}

function populateServerMetaUI(cfg) {
  try {
    const versionEl = document.getElementById("server-meta-version");
    const typeEl = document.getElementById("server-meta-type");
    const loaderEl = document.getElementById("server-meta-loader");
    const forgeEl = document.getElementById("server-meta-forge");
    // Prefer explicit cfg fields, else fall back to global context
    const v = cfg.version || cfg.mc_version || currentServerMcVersion || "";
    const t =
      cfg.server_type ||
      (cfg.loader_version ? "fabric" : cfg.forge_version ? "forge" : null) ||
      currentServerLoader ||
      "paper";
    if (versionEl) versionEl.value = v;
    if (typeEl) typeEl.value = t;
    if (loaderEl) loaderEl.value = cfg.loader_version || "";
    if (forgeEl) forgeEl.value = cfg.forge_version || "";
    // Visible badge in server detail view
    try {
      const badge = document.getElementById("server-version-text");
      if (badge) {
        const v2 = v || "";
        const t2 = t || "";
        badge.textContent = (t2 ? t2 + ": " : "") + (v2 || "—");
      }
    } catch (e) {
      console.warn("populateServerMetaUI: failed to set visible badge", e);
    }
    // Enforce tab visibility depending on server type/loader
    try {
      const modsTab = document.querySelector('.tab[data-view="mods"]');
      const pluginsTab = document.querySelector('.tab[data-view="plugins"]');
      const isModdedExplicit =
        (t && t !== "paper") ||
        (cfg &&
          (cfg.loader_version ||
            cfg.forge_version ||
            (cfg.server_type && cfg.server_type !== "paper"))) ||
        (currentServerLoader && currentServerLoader !== null);
      // Helper to set UI state
      const setServerModeUI = (isModded) => {
        try {
          if (modsTab && pluginsTab) {
            if (isModded) {
              modsTab.style.display = "";
              pluginsTab.style.display = "none";
              const imp = document.getElementById("btn-import-mod");
              if (imp) imp.style.display = "";
            } else {
              modsTab.style.display = "none";
              pluginsTab.style.display = "";
              const imp = document.getElementById("btn-import-mod");
              if (imp) imp.style.display = "none";
            }
          }
        } catch (e) {}
      };

      if (t === "paper") {
        // Explicit Paper: always hide Mods
        setServerModeUI(false);
      } else if (isModdedExplicit) {
        setServerModeUI(true);
      } else {
        // No explicit meta; check installed mods to determine mode
        (async () => {
          try {
            const modsResp = await apiFetch(
              `/api/server/${encodeURIComponent(cfg.name || currentServer)}/mods`,
            );
            const modsData = await modsResp.json();
            const mods = modsData.mods || modsData || [];
            // If server config indicates Paper, do not switch to Mods even if mods exist
            let explicitCfg = {};
            try {
              const cfgRes = await apiFetch(
                `/api/server/${encodeURIComponent(cfg.name || currentServer)}/config`,
              );
              explicitCfg = await cfgRes.json();
            } catch (e) {}
            const explicitType =
              explicitCfg.server_type || explicitCfg.serverType || null;
            if (explicitType === "paper") {
              setServerModeUI(false);
            } else {
              setServerModeUI(Array.isArray(mods) && mods.length > 0);
            }
          } catch (e) {
            // Fallback: do not change UI
            setServerModeUI(false);
          }
        })();
      }
    } catch (e) {
      console.warn("populateServerMetaUI: failed to set tabs", e);
    }
  } catch (e) {
    console.warn("populateServerMetaUI: failed to populate UI fields", e);
  }
}

// Global helper to toggle Mods/Plugins tabs and import visibility
function setServerModeUI(isModded) {
  try {
    const modsTab = document.querySelector('.tab[data-view="mods"]');
    const pluginsTab = document.querySelector('.tab[data-view="plugins"]');
    const imp = document.getElementById("btn-import-mod");
    if (modsTab && pluginsTab) {
      if (isModded) {
        modsTab.style.display = "";
        pluginsTab.style.display = "none";
        if (imp) imp.style.display = "";
      } else {
        modsTab.style.display = "none";
        pluginsTab.style.display = "";
        if (imp) imp.style.display = "none";
      }
    }
  } catch (e) {
    console.warn("setServerModeUI failed", e);
  }
}
globalThis.setServerModeUI = setServerModeUI;

// Manual update: apply the last fetched config (manager_config.json or authoritative) as server meta
async function manualUpdateServerConfig() {
  if (!currentServer) {
    showToast("error", "Aucun serveur sélectionné");
    return;
  }
  const last = (globalThis._lastServerConfigFetched || {})[currentServer];
  if (!last) {
    showToast("error", "Aucune configuration récupérée à appliquer");
    return;
  }
  const payload = {};
  if (last.version) payload.version = last.version;
  if (last.server_type) payload.server_type = last.server_type;
  if (last.loader_version) payload.loader_version = last.loader_version;
  if (last.forge_version) payload.forge_version = last.forge_version;
  if (Object.keys(payload).length === 0) {
    showToast("error", "La configuration ne contient pas de méta à appliquer");
    return;
  }
  try {
    await apiJson(`/api/server/${encodeURIComponent(currentServer)}/meta`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("success", "Méta appliquée avec succès");
    // Re-fetch authoritative config and re-apply
    const cfgRes = await apiFetch(
      `/api/server/${encodeURIComponent(currentServer)}/config?t=${Date.now()}`,
    );
    const cfg = await cfgRes.json();
    populateServerMetaUI(cfg);
    await applyServerConfigContext(currentServer, cfg, true);
    try {
      const btn = document.getElementById("btn-apply-server-meta");
      if (btn) btn.disabled = true;
    } catch (e) {}
  } catch (e) {
    console.warn("manualUpdateServerConfig failed", e);
    showToast("error", "Erreur lors de l'application de la méta");
  }
}
globalThis.manualUpdateServerConfig = manualUpdateServerConfig;

// ================================
// BACKUPS - Amélioré
// ================================

async function loadBackups() {
  if (!currentServer) return;

  sessionStats.apiCalls++;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/backups`);
    const backups = await response.json();

    const container = document.getElementById("backups-list");

    if (!container) return;

    if (!backups || backups.length === 0) {
      container.innerHTML = '<p class="empty-message">Aucune sauvegarde</p>';

      return;
    }

    container.innerHTML = backups
      .map(
        (backup) => `

            <div class="backup-item">

                <i class="fas fa-archive"></i>

                <div class="backup-info"><span class="backup-name">${backup.name}</span><span class="backup-date">${backup.date || "N/A"}</span></div>

                <span class="backup-size">${backup.size || "N/A"}</span>

                <div class="backup-actions">

                    <button class="btn-restore" onclick="restoreBackup('${backup.name}')" title="Restaurer">

                        <i class="fas fa-undo"></i>

                    </button>

                    <button class="btn-delete-backup" onclick="deleteBackup('${backup.name}')" title="Supprimer">

                        <i class="fas fa-trash"></i>

                    </button>

                </div>

            </div>

        `,
      )
      .join("");
  } catch (error) {
    console.error("Erreur backups:", error);
  }
}

async function deleteBackup(backupName) {
  if (!currentServer) return;

  if (
    !confirm(
      `Supprimer la sauvegarde "${backupName}" ?\n\nCette action est irreversible !`,
    )
  )
    return;

  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/backups/${encodeURIComponent(backupName)}`,
      {
        method: "DELETE",
      },
    );

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Sauvegarde supprime");

      loadBackups();
    } else {
      showToast("error", result.message || "Erreur suppression");
    }
  } catch (error) {
    console.error("Erreur suppression backup:", error);

    showToast("error", "Erreur lors de la suppression");
  }
}

/* duplicate restoreBackup removed */ async function __restoreBackup_removed(
  backupName,
) {
  if (!currentServer) return;

  if (
    !confirm(
      `Restaurer la sauvegarde "${backupName}" ?\n\nLe serveur sera arreªte et les fichiers actuels seront remplaces.`,
    )
  )
    return;

  showToast("info", "Restauration en cours...");

  try {
    const response = await apiFetch(`/api/server/${currentServer}/restore`, {
      method: "POST",

      body: JSON.stringify({ backup: backupName }),
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Sauvegarde restaure");
    } else {
      showToast("error", result.message || "Erreur restauration");
    }
  } catch (error) {
    console.error("Erreur restauration:", error);

    showToast("error", "Erreur lors de la restauration");
  }
}

function openScheduleModal() {
  document.getElementById("schedule-modal")?.classList.add("show");
}

function closeScheduleModal() {
  document.getElementById("schedule-modal")?.classList.remove("show");
}

async function saveSchedule(event) {
  event.preventDefault();

  if (!currentServer) return;

  const config = {
    enabled: true,

    type: document.getElementById("schedule-type")?.value || "daily",

    retention: Number.parseInt(
      document.getElementById("schedule-retention")?.value || 7,
    ),

    compress: true,
  };

  try {
    const response = await apiFetch(`/api/server/${currentServer}/schedule`, {
      method: "POST",

      body: JSON.stringify(config),
    });

    const result = await response.json();

    if (result.success) {
      showToast("success", "Planification sauvegarde");

      closeScheduleModal();
    } else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur schedule:", error);
  }
}

// ================================

// NOTIFICATIONS

// ================================

async function loadNotifications() {
  try {
    const response = await apiFetch("/api/notifications");

    const data = await response.json();

    const notifications = data.notifications || [];

    const unreadCount = notifications.filter((n) => !n.read).length;

    const badge = document.getElementById("notif-badge");

    if (badge) {
      badge.textContent = unreadCount;

      badge.style.display = unreadCount > 0 ? "flex" : "none";
    }

    const container = document.getElementById("notifications-list");

    if (container) {
      if (notifications.length === 0) {
        container.innerHTML =
          '<p class="empty-message">Aucune notification</p>';
      } else {
        container.innerHTML = notifications
          .map(
            (n) => `

                    <div class="notification-item ${n.read ? "" : "unread"} ${n.severity || ""}">

                        <div class="notif-icon"><i class="fas fa-${getNotifIcon(n.type)}"></i></div>

                        <div class="notif-content"><strong>${n.title}</strong><p>${n.message}</p><span class="notif-time">${formatTime(n.timestamp)}</span></div>

                    </div>

                `,
          )
          .join("");
      }
    }

    const activityList = document.getElementById("activity-list");

    if (activityList) {
      const recent = notifications.slice(0, 5);

      if (recent.length === 0) {
        activityList.innerHTML =
          '<p class="empty-message">Aucune activite recente</p>';
      } else {
        activityList.innerHTML = recent
          .map(
            (n) => `

                    <div class="activity-item"><i class="fas fa-${getNotifIcon(n.type)} ${n.severity || ""}"></i><span>${n.title}</span><span class="time">${formatTime(n.timestamp)}</span></div>

                `,
          )
          .join("");
      }
    }
  } catch (error) {
    console.error("Erreur notifications:", error);
  }
}

function getNotifIcon(type) {
  const icons = {
    server_start: "play-circle",
    server_stop: "stop-circle",
    crash: "exclamation-triangle",
    backup: "download",
    alert: "bell",
    info: "info-circle",
  };

  return icons[type] || "bell";
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  const diff = (new Date() - date) / 1000;

  if (diff < 60) return "e€ l'instant";

  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;

  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;

  return date.toLocaleDateString();
}

async function markAllNotificationsRead() {
  try {
    await apiFetch("/api/notifications/read", { method: "POST" });

    loadNotifications();

    showToast("success", "Notifications marques comme lues");
  } catch (error) {
    console.error("Erreur:", error);
  }
}

async function clearNotifications() {
  if (!confirm("Supprimer toutes les notifications ?")) return;

  try {
    await apiFetch("/api/notifications/clear", { method: "POST" });

    loadNotifications();

    showToast("success", "Notifications supprimes");
  } catch (error) {
    console.error("Erreur:", error);
  }
}

// ================================

// SETTINGS

// ================================

async function loadSettings() {
  if (currentUser?.role === "admin") await loadUsers();

  // Charger les parame¨tres sauvegardes

  const savedSettings = JSON.parse(localStorage.getItem("appSettings") || "{}");

  // Appliquer les parame¨tres

  if (savedSettings.animations !== undefined) {
    document.getElementById("animations-toggle").checked =
      savedSettings.animations;

    toggleAnimations(savedSettings.animations);
  }

  if (savedSettings.defaultRam) {
    document.getElementById("default-ram").value = savedSettings.defaultRam;
  }

  if (savedSettings.defaultPort) {
    document.getElementById("default-port").value = savedSettings.defaultPort;
  }

  if (savedSettings.sounds !== undefined) {
    document.getElementById("sounds-toggle").checked = savedSettings.sounds;
  }
}

function toggleAnimations(enabled) {
  document.body.style.setProperty(
    "--transition-smooth",
    enabled ? "0.3s cubic-bezier(0.4, 0, 0.2, 1)" : "0s",
  );

  document.body.style.setProperty(
    "--transition-bounce",
    enabled ? "0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "0s",
  );

  saveSettings();
}

function toggleBrowserNotifications(enabled) {
  if (enabled && "Notification" in globalThis) {
    Notification.requestPermission().then((permission) => {
      if (permission !== "granted") {
        document.getElementById("browser-notif-toggle").checked = false;

        showToast("error", "Notifications non autorises");
      } else {
        showToast("success", "Notifications actives");
      }
    });
  }

  saveSettings();
}

function saveSettings() {
  const settings = {
    animations: document.getElementById("animations-toggle")?.checked ?? true,

    defaultRam: document.getElementById("default-ram")?.value || "2048",

    defaultPort: document.getElementById("default-port")?.value || "25565",

    sounds: document.getElementById("sounds-toggle")?.checked ?? true,

    autoBackup: document.getElementById("auto-backup-toggle")?.checked ?? false,

    backupFrequency:
      document.getElementById("backup-frequency")?.value || "daily",

    backupRetention: document.getElementById("backup-retention")?.value || "7",
  };

  localStorage.setItem("appSettings", JSON.stringify(settings));
}

// ================================
// ACCOUNT / PASSWORD
// ================================

function _validatePasswordStrength(pwd) {
  if (!pwd || pwd.length < 8)
    return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Z]/.test(pwd)) return "Le mot de passe doit contenir une majuscule.";
  if (!/\d/.test(pwd)) return "Le mot de passe doit contenir un chiffre.";
  return null;
}

async function changePassword() {
  const oldPassword =
    (document.getElementById("old-password") || {}).value || "";
  const newPassword =
    (document.getElementById("new-password") || {}).value || "";
  const confirm =
    (document.getElementById("confirm-password") || {}).value || "";

  if (!oldPassword || !newPassword || !confirm) {
    showToast("error", "Veuillez remplir tous les champs");
    return;
  }

  if (newPassword !== confirm) {
    showToast("error", "Les mots de passe ne correspondent pas");
    return;
  }

  const strengthErr = _validatePasswordStrength(newPassword);
  if (strengthErr) {
    showToast("error", strengthErr);
    return;
  }

  try {
    await ensureCsrfToken();
    const res = await apiFetch("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", data.message || "Mot de passe modifié");
      const o = document.getElementById("old-password");
      if (o) o.value = "";
      const n = document.getElementById("new-password");
      if (n) n.value = "";
      const c = document.getElementById("confirm-password");
      if (c) c.value = "";
      try {
        if (currentUser && currentUser.username === "admin") {
          localStorage.setItem("admin_default_changed", "1");
        }
      } catch (e) {
        console.warn("storing admin_default_changed failed", e);
      }
    } else {
      showToast(
        "error",
        data.message || "Erreur lors du changement de mot de passe",
      );
    }
  } catch (e) {
    console.error("Erreur changePassword:", e);
    showToast("error", "Erreur API");
  }
}

async function loadUsers() {
  try {
    const response = await apiFetch("/api/auth/users");

    const data = await response.json();

    const container = document.getElementById("users-list");

    if (!container) return;

    const users = data.users || [];

    container.innerHTML = users
      .map(
        (user) => `

            <div class="user-item">

                <div class="user-info"><i class="fas fa-user"></i><span>${user.username}</span><span class="user-role-badge ${user.role}">${user.role}</span></div>

                ${user.username !== "admin" ? `<button class="btn-danger-sm" onclick="deleteUser('${user.username}')"><i class="fas fa-trash"></i></button>` : ""}

            </div>

        `,
      )
      .join("");
  } catch (error) {
    console.error("Erreur users:", error);
  }
}

function openUserModal() {
  document.getElementById("user-modal")?.classList.add("show");
}

function closeUserModal() {
  document.getElementById("user-modal")?.classList.remove("show");
}

async function createUser(event) {
  event.preventDefault();

  const username = document.getElementById("new-username")?.value.trim();

  const password = document.getElementById("new-user-password")?.value;

  const role = document.getElementById("new-role")?.value || "user";

  try {
    const response = await apiFetch("/api/auth/users", {
      method: "POST",

      body: JSON.stringify({ username, password, role }),
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Utilisateur cre");

      closeUserModal();

      loadUsers();

      if (document.getElementById("new-username"))
        document.getElementById("new-username").value = "";

      if (document.getElementById("new-user-password"))
        document.getElementById("new-user-password").value = "";
    } else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur creation user:", error);
  }
}

async function deleteUser(username) {
  if (!confirm(`Supprimer l'utilisateur ${username} ?`)) return;

  try {
    const response = await apiFetch(`/api/auth/users/${username}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", "Utilisateur supprime");

      loadUsers();
    } else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur suppression user:", error);
  }
}

async function testDiscord() {
  const webhook = document.getElementById("discord-webhook")?.value.trim();

  if (!webhook) {
    showToast("error", "Entrez une URL de webhook");
    return;
  }

  try {
    const response = await apiFetch("/api/notifications/test/discord", {
      method: "POST",

      body: JSON.stringify({ webhook_url: webhook }),
    });

    const result = await response.json();

    if (result.success) showToast("success", "Message de test envoye");
    else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur test Discord:", error);
  }
}

// ================================

// MODALS

// ================================

async function loadVersions() {
  try {
    const serverType = document.getElementById("server-type")?.value || "paper";
    const select = document.getElementById("server-version");
    if (!select) return;

    if (serverType === "paper") {
      const response = await apiFetch("/api/papermc/versions");
      const data = await response.json();
      const versions = Array.isArray(data)
        ? data
        : data?.versions || data?.result || [];
      select.innerHTML = versions
        .map((v) => `<option value="${v}">${v}</option>`)
        .join("");
      select.onchange = function () {
        /* nothing for paper */
      };
      document.getElementById("forge-version-group").style.display = "none";
      document.getElementById("fabric-loader-group").style.display = "none";
    } else if (serverType === "forge" || serverType === "neoforge") {
      const endpoint =
        serverType === "forge"
          ? "/api/forge/versions"
          : "/api/neoforge/versions";
      const r = await apiFetch(endpoint);
      const d = await r.json();
      // d may be { versions: [...] } or an object mapping mc_version -> metadata
      let mcVersions = [];
      if (Array.isArray(d)) mcVersions = d;
      else if (Array.isArray(d.versions)) mcVersions = d.versions;
      else if (d && typeof d.versions === "object")
        mcVersions = Object.keys(d.versions);
      else if (d && typeof d === "object") mcVersions = Object.keys(d);

      select.innerHTML = mcVersions
        .map((v) => `<option value="${v}">${v}</option>`)
        .join("");
      select.onchange = function () {
        if (this.value) loadForgeBuilds(this.value);
      };
      document.getElementById("forge-version-group").style.display = "block";
      document.getElementById("fabric-loader-group").style.display = "none";
      // load builds for first version
      if (mcVersions.length > 0) loadForgeBuilds(mcVersions[0]);
    } else if (serverType === "fabric") {
      const r = await apiFetch("/api/fabric/versions");
      const d = await r.json();
      // fabric API may return several shapes: array, {game:[], loader:[]}, or {versions:{game:[], loader:[]}}
      let versions = [];
      if (Array.isArray(d)) versions = d;
      else if (Array.isArray(d.game)) versions = d.game;
      else if (d && d.versions) {
        if (Array.isArray(d.versions.game)) versions = d.versions.game;
        else if (Array.isArray(d.versions)) versions = d.versions;
      }

      if (!Array.isArray(versions) || versions.length === 0) {
        console.warn("Fabric versions response has unexpected shape:", d);
        select.innerHTML =
          '<option value="">(Aucune version disponible)</option>';
        document.getElementById("fabric-loader-group").style.display = "none";
      } else {
        select.innerHTML = versions
          .map((v) => `<option value="${v}">${v}</option>`)
          .join("");
        select.onchange = function () {
          if (this.value) loadFabricLoaders(this.value);
        };
        document.getElementById("fabric-loader-group").style.display = "block";
        document.getElementById("forge-version-group").style.display = "none";
        loadFabricLoaders(versions[0]);
      }
    } else if (serverType === "quilt") {
      const r = await apiFetch("/api/quilt/versions");
      const d = await r.json();
      const gameVersions = d.game || [];
      const loaders = d.loader || [];
      select.innerHTML = gameVersions
        .map((v) => `<option value="${v}">${v}</option>`)
        .join("");
      select.onchange = function () {
        /* quilt: loaders are populated separately */
      };
      document.getElementById("fabric-loader-group").style.display = "block";
      document.getElementById("forge-version-group").style.display = "none";
      const loaderSelect = document.getElementById("fabric-loader");
      if (loaderSelect)
        loaderSelect.innerHTML = loaders
          .map((l) => `<option value="${l}">${l}</option>`)
          .join("");
    } else {
      // default to papermc
      const response = await apiFetch("/api/papermc/versions");
      const versions = await response.json();
      select.innerHTML = versions
        .map((v) => `<option value="${v}">${v}</option>`)
        .join("");
      select.onchange = function () {
        /* default */
      };
      document.getElementById("forge-version-group").style.display = "none";
      document.getElementById("fabric-loader-group").style.display = "none";
    }
  } catch (error) {
    console.error("Erreur versions:", error);
  }
}

function openModal() {
  document.getElementById("create-modal")?.classList.add("show");
  // initialize modal fields
  selectedMods = [];
  renderSelectedMods();
  try {
    document.getElementById("mod-job-status").style.display = "none";
  } catch (e) {
    console.warn("hide mod-job-status failed", e);
  }
  // load versions and reset selects
  loadVersions();
}

function closeModal() {
  document.getElementById("create-modal")?.classList.remove("show");
}

async function createServer(event) {
  event.preventDefault();

  const name = document.getElementById("server-name-input")?.value.trim();

  const version = document.getElementById("server-version")?.value;

  const ramMin = document.getElementById("ram-min")?.value || "1024";

  const ramMax = document.getElementById("ram-max")?.value || "2048";

  if (!name || !version) {
    showToast("error", "Remplissez tous les champs");
    return;
  }

  try {
    closeModal();

    showToast("info", "Creation du serveur...");

    const response = await apiFetch("/api/create", {
      method: "POST",

      body: JSON.stringify({
        name,
        version,
        ram_min: ramMin + "M",
        ram_max: ramMax + "M",
        server_type: document.getElementById("server-type")?.value || "paper",
        loader_version: document.getElementById("fabric-loader")?.value || null,
        forge_version: document.getElementById("forge-version")?.value || null,
      }),
    });

    const result = await response.json();

    if (result.status === "success") {
      showToast("success", `Serveur ${name} créé !`);

      // Refresh la liste et sélectionner immédiatement le nouveau serveur
      // Force save meta from UI values to ensure version/type are persisted
      try {
        const payload = {
          version: version,
          server_type: document.getElementById("server-type")?.value || "paper",
          loader_version:
            document.getElementById("fabric-loader")?.value || undefined,
          forge_version:
            document.getElementById("forge-version")?.value || undefined,
        };
        await apiJson(`/api/server/${encodeURIComponent(name)}/meta`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // Re-fetch authoritative config and update UI so we never show stale values
        try {
          const cfgRes = await apiFetch(
            `/api/server/${encodeURIComponent(name)}/config`,
          );
          const cfg = await cfgRes.json();
          console.debug("createServer: server config after create", cfg);
          populateServerMetaUI(cfg);
        } catch (e) {
          console.warn("createServer: fetch config after meta save failed", e);
          try {
            populateServerMetaUI(payload);
          } catch (e2) {}
        }
      } catch (e) {
        console.warn("createServer: auto-save meta failed", e);
      }

      await loadServerList(true);
      try {
        selectServer(name);
      } catch (e) {
        console.warn("createServer: selecting new server failed", e);
      }
      if (document.getElementById("server-name-input"))
        document.getElementById("server-name-input").value = "";
    } else {
      showToast("error", result.message || "Erreur creation");
    }
  } catch (error) {
    console.error("Erreur creation:", error);

    showToast("error", "Erreur lors de la creation");
  }
}

// ================================

// TOAST NOTIFICATIONS

// ================================

function showToast(type, message) {
  const container =
    document.getElementById("toast-container") || createToastContainer();

  const toast = document.createElement("div");

  toast.className = `toast ${type}`;

  const icons = {
    success: "check-circle",
    error: "exclamation-circle",
    info: "info-circle",
    warning: "exclamation-triangle",
  };

  toast.innerHTML = `<i class="fas fa-${icons[type] || "info-circle"}"></i><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");

    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  let container = document.getElementById("toast-container");

  if (!container) {
    container = document.createElement("div");

    container.id = "toast-container";

    document.body.appendChild(container);
  }

  return container;
}

// Ancien alias pour compatibilite

function showNotification(type, title, message) {
  showToast(type, message || title);
}

// ================================

// UTILITIES

// ================================

function escapeHtml(text) {
  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}

function refreshAll() {
  loadServerList();

  loadSystemMetrics();

  loadNotifications();

  showToast("success", "Donnes actualises");
}

// ================================

// INTERNATIONALIZATION (i18n) - Enhanced System

// ================================

// Langues supportées
const SUPPORTED_LANGUAGES = {
  fr: { name: "Français", flag: "🇫🇷" },
  en: { name: "English", flag: "🇬🇧" },
  es: { name: "Español", flag: "🇪🇸" },
};

/**
 * Fonction globale de traduction - utilisable partout
 * @param {string} key - Clé de traduction (ex: 'nav.dashboard')
 * @param {object} params - Paramètres pour interpolation (ex: {n: 5})
 * @returns {string} - Texte traduit ou clé si non trouvé
 */
function t(key, params = {}) {
  let text = getTranslation(key);
  if (!text) return key; // Retourne la clé si traduction non trouvée

  // Interpolation des paramètres {n}, {name}, etc.
  for (const [param, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${param}\\}`, "g"), value);
  }
  return text;
}

// Alias pour compatibilité
globalThis.t = t;
globalThis.__ = t;

async function changeLanguage(lang) {
  try {
    if (!SUPPORTED_LANGUAGES[lang]) {
      console.warn(`Language ${lang} not supported, falling back to 'fr'`);
      lang = "fr";
    }

    const response = await apiFetch(`/api/i18n/translations?lang=${lang}`);
    if (!response.ok) throw new Error("Language not found");

    const data = await response.json();
    translations = data.translations || data;
    currentLang = lang;
    localStorage.setItem("language", lang);

    // Mettre à jour l'attribut lang du HTML
    document.documentElement.lang = lang;

    applyTranslations();
    updateLanguageSelector();

    showToast(
      "success",
      `${SUPPORTED_LANGUAGES[lang].flag} ${SUPPORTED_LANGUAGES[lang].name}`,
    );
  } catch (error) {
    console.error("Language change error:", error);
    showToast("error", "Language change failed");
  }
}

function applyTranslations() {
  // Traduire les éléments avec data-i18n (textContent)
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = t(key);
    if (text && text !== key) {
      el.textContent = text;
    }
  });

  // Traduire les placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const text = t(key);
    if (text && text !== key) {
      el.placeholder = text;
    }
  });

  // Traduire les titres (tooltips)
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const text = t(key);
    if (text && text !== key) {
      el.title = text;
    }
  });

  // Traduire les valeurs d'attributs aria-label
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    const text = t(key);
    if (text && text !== key) {
      el.setAttribute("aria-label", text);
    }
  });

  // Traduire le titre de la page
  const pageTitle = t("app.title");
  if (pageTitle && pageTitle !== "app.title") {
    document.title = pageTitle;
  }
}

function getTranslation(key) {
  const keys = key.split(".");
  let value = translations;
  for (const k of keys) {
    if (value && value[k] !== undefined) {
      value = value[k];
    } else {
      return null;
    }
  }
  return typeof value === "string" ? value : null;
}

function updateLanguageSelector() {
  // Mettre à jour tous les sélecteurs de langue
  document.querySelectorAll(".lang-select, #lang-select").forEach((select) => {
    select.value = currentLang;
  });

  // Mettre à jour le bouton de langue si présent
  const langBtn = document.getElementById("current-lang");
  if (langBtn && SUPPORTED_LANGUAGES[currentLang]) {
    langBtn.innerHTML = `${SUPPORTED_LANGUAGES[currentLang].flag} ${currentLang.toUpperCase()}`;
  }
}

function createLanguageDropdown() {
  let html = '<div class="language-dropdown">';
  for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
    const active = code === currentLang ? "active" : "";
    html += `<button class="lang-option ${active}" onclick="changeLanguage('${code}')">
            ${info.flag} ${info.name}
        </button>`;
  }
  html += "</div>";
  return html;
}

function toggleLanguageDropdown() {
  const dropdown = document.getElementById("lang-dropdown");
  if (dropdown) {
    dropdown.classList.toggle("show");
  }
}

async function loadLanguage() {
  const savedLang =
    localStorage.getItem("language") ||
    navigator.language.split("-")[0] ||
    "fr";
  const langToUse = SUPPORTED_LANGUAGES[savedLang] ? savedLang : "fr";

  // Mettre à jour les sélecteurs
  document.querySelectorAll(".lang-select, #lang-select").forEach((select) => {
    select.value = langToUse;
  });

  await changeLanguage(langToUse);
}

// ================================

// SERVER ADDRESS / SUBDOMAIN SYSTEM

// ================================

function getServerAddress(serverName) {
  const config = JSON.parse(
    localStorage.getItem("serverAddressConfig") || "{}",
  );

  if (config.useSubdomain && config.domain) {
    return `${serverName}.${config.domain}`;
  } else if (config.customIP) {
    return config.customIP;
  }

  // Par defaut, utiliser localhost

  return "localhost";
}

function getServerPort(serverName) {
  // TODO: Recuperer le port depuis server.properties

  return "25565";
}

function getFullServerAddress(serverName) {
  const address = getServerAddress(serverName);

  const port = getServerPort(serverName);

  return port === "25565" ? address : `${address}:${port}`;
}

function copyServerAddress(serverName) {
  const address = getFullServerAddress(serverName);

  navigator.clipboard
    .writeText(address)
    .then(() => {
      showToast("success", `Adresse copie: ${address}`);
    })
    .catch(() => {
      showToast("error", "Impossible de copier");
    });
}

function copyCurrentServerAddress() {
  if (currentServer) {
    copyServerAddress(currentServer);
  }
}

function updateServerAddressDisplay(serverName, port) {
  const addressDisplay = document.getElementById("server-address-display");

  const addressText = document.getElementById("server-address-text");

  if (addressDisplay && addressText) {
    const address = getServerAddress(serverName);

    const fullAddress =
      port && port !== "25565" ? `${address}:${port}` : address;

    addressText.textContent = fullAddress;

    addressDisplay.style.display = "flex";
  }
}

function saveAddressConfig() {
  const config = {
    useSubdomain: document.getElementById("use-subdomain")?.checked || false,

    domain: document.getElementById("custom-domain")?.value || "",

    customIP: document.getElementById("custom-ip")?.value || "",
  };

  localStorage.setItem("serverAddressConfig", JSON.stringify(config));

  showToast("success", "Configuration d'adresse sauvegarde");
}

function loadAddressConfig() {
  const config = JSON.parse(
    localStorage.getItem("serverAddressConfig") || "{}",
  );

  const useSubdomain = document.getElementById("use-subdomain");

  const customDomain = document.getElementById("custom-domain");

  const customIP = document.getElementById("custom-ip");

  if (useSubdomain) useSubdomain.checked = config.useSubdomain || false;

  if (customDomain) customDomain.value = config.domain || "";

  if (customIP) customIP.value = config.customIP || "";

  toggleAddressMode();
}

function toggleAddressMode() {
  const useSubdomain = document.getElementById("use-subdomain")?.checked;

  const subdomainConfig = document.getElementById("subdomain-config");

  const ipConfig = document.getElementById("ip-config");

  if (subdomainConfig)
    subdomainConfig.style.display = useSubdomain ? "block" : "none";

  if (ipConfig) ipConfig.style.display = useSubdomain ? "none" : "block";

  updateAddressPreview();
}

function updateAddressPreview() {
  const domain =
    document.getElementById("custom-domain")?.value || "monserveur.fr";

  const preview = document.querySelector(".address-preview strong");

  if (preview) {
    preview.textContent = `[nom-serveur].${domain}`;
  }
}

async function detectPublicIP() {
  try {
    showToast("info", "Detection de l'IP publique...");

    const response = await fetch("https://api.ipify.org?format=json");

    const data = await response.json();

    const ipInput = document.getElementById("custom-ip");

    if (ipInput && data.ip) {
      ipInput.value = data.ip;

      showToast("success", `IP detecte: ${data.ip}`);
    }
  } catch (error) {
    console.error("Erreur detection IP:", error);

    showToast("error", "Impossible de detecter l'IP publique");
  }
}

// Fermer modals en cliquant dehors

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.classList.remove("show");
  }
});

// ================================
// KEYBOARD SHORTCUTS
// ================================

document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
    if (e.ctrlKey && e.key === "Enter" && e.target.id === "cmd-input") {
      e.preventDefault();
      sendCommand();
    }
    return;
  }

  if (e.key === "Escape") {
    document
      .querySelectorAll(".modal.show")
      .forEach((m) => m.classList.remove("show"));
    return;
  }

  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    if (currentServer) toggleServer();
  }

  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    const modal = document.getElementById("modal-create");
    if (modal) modal.classList.add("show");
  }

  if (e.key >= "1" && e.key <= "5" && !e.ctrlKey && !e.altKey) {
    const tabs = ["console", "players", "plugins", "config", "backups"];
    const idx = Number.parseInt(e.key) - 1;
    if (tabs[idx]) showTab(tabs[idx]);
  }
});

// ================================
// DRAG & DROP UPLOAD
// ================================

function initDragDrop() {
  document.querySelectorAll(".content").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () =>
      zone.classList.remove("drag-over"),
    );

    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      if (!currentServer) {
        showToast("error", "Select a server");
        return;
      }
      for (const file of e.dataTransfer.files) await handleFileDrop(file);
    });
  });
}

async function handleFileDrop(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  // Ensure CSRF token is fresh before uploading
  await ensureCsrfToken();
  const formData = new FormData();

  if (ext === "jar") {
    formData.append("plugin", file);
    const csrf = getCsrfToken();
    if (csrf) formData.append("csrf_token", csrf);
    showToast("info", "Uploading " + file.name);
    const resp = await apiFetch(
      "/api/server/" + currentServer + "/plugins/upload",
      {
        method: "POST",
        body: formData,
        headers: { "X-CSRF-Token": getCsrfToken() },
      },
    );
    if (resp.ok) {
      showToast("success", "Plugin installed");
      loadInstalledPlugins();
    }
  } else if (ext === "zip") {
    formData.append("world", file);
    const csrf = getCsrfToken();
    if (csrf) formData.append("csrf_token", csrf);
    const resp = await apiFetch(
      "/api/server/" + currentServer + "/worlds/import",
      { method: "POST", body: formData },
    );
    if (resp.ok) showToast("success", "World imported");
  }
}

// Drag styling
const ds = document.createElement("style");
ds.textContent =
  ".drag-over { border: 2px dashed var(--primary) !important; background: rgba(99,102,241,0.1) !important; }";
document.head.appendChild(ds);

// ================================
// DISK USAGE
// ================================

async function loadDiskUsage() {
  if (!currentServer) return;
  const resp = await apiFetch("/api/server/" + currentServer + "/disk");
  const data = await resp.json();
  if (data.status === "success") {
    const el = document.getElementById("disk-usage");
    if (el) el.textContent = data.usage.total_mb + " MB";
  }
}

// ================================
// WORLDS
// ================================

async function loadWorlds() {
  if (!currentServer) return;
  const resp = await apiFetch("/api/server/" + currentServer + "/worlds");
  const data = await resp.json();
  const container = document.getElementById("worlds-list");
  if (!container) return;
  if (data.worlds && data.worlds.length > 0) {
    container.innerHTML = data.worlds
      .map(
        (w) =>
          '<div class="backup-item"><i class="fas fa-globe"></i>' +
          '<div class="backup-info"><span class="backup-name">' +
          w.name +
          "</span>" +
          '<span class="backup-date">' +
          w.size_mb +
          " MB</span></div></div>",
      )
      .join("");
  } else {
    container.innerHTML = '<div class="empty-message">No worlds</div>';
  }
}

// ================================
// FILE BROWSER
// ================================

// ================================
// TUNNEL MANAGER - MULTI-PROVIDER (Gratuit, sans compte)
// Supporte: localhost.run, Serveo, Bore, Cloudflare, Manuel
// ================================

let tunnelPolling = null;
let tunnelRetryCount = 0;
const TUNNEL_MAX_RETRIES = 15;
const TUNNEL_POLL_INTERVAL = 3000;
let selectedProvider = "localhost.run";
let availableProviders = [];

// Charger les providers disponibles
async function loadTunnelProviders() {
  try {
    const resp = await apiFetch("/api/tunnel/providers");
    if (resp.ok) {
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await resp.json();
        availableProviders = data.providers || [];
      }
    }
  } catch (e) {
    console.warn("Erreur chargement providers:", e);
    // Providers par défaut
    availableProviders = [
      {
        id: "localhost.run",
        name: "localhost.run",
        description: "SSH, gratuit",
        status: "recommended",
      },
      {
        id: "serveo",
        name: "Serveo",
        description: "SSH, gratuit",
        status: "available",
      },
      {
        id: "bore",
        name: "Bore",
        description: "TCP léger",
        status: "available",
      },
      {
        id: "manual",
        name: "Port Manuel",
        description: "Redirection manuelle",
        status: "available",
      },
    ];
  }
}

async function startTunnel(provider = null) {
  const btn =
    document.getElementById("btn-tunnel") ||
    document.getElementById("btn-playit");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Démarrage...';
  }

  tunnelRetryCount = 0;
  const useProvider = provider || selectedProvider;

  try {
    const resp = await apiFetch("/api/tunnel/start", {
      method: "POST",

      body: JSON.stringify({ port: 25565, provider: useProvider }),
    });

    if (resp.status === 401) {
      showToast("error", "Session expirée, reconnectez-vous");
      globalThis.location.href = "/login";
      return;
    }

    // Vérifier le Content-Type avant de parser en JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      // Le serveur a renvoyé du HTML (probablement une erreur ou redirection)
      const text = await resp.text();
      console.error("Réponse non-JSON:", text.substring(0, 200));
      throw new Error(
        "Le serveur a renvoyé une réponse invalide. Vérifiez que vous êtes connecté.",
      );
    }

    const data = await resp.json();

    // Afficher le modal
    showTunnelModal();

    if (data.status === "success" && data.address) {
      showTunnelAddress(data.address, data.provider);
      startTunnelPolling();
    } else if (data.status === "starting") {
      showTunnelLoading(`Connexion à ${data.provider || useProvider}...`);
      startTunnelPolling();
    } else if (data.status === "error") {
      showTunnelError(data.message || "Erreur inconnue");
    } else if (data.instructions) {
      // Mode manuel avec instructions
      showTunnelManual(data);
    } else {
      showTunnelLoading("Connexion au tunnel...");
      startTunnelPolling();
    }
  } catch (e) {
    console.error("Tunnel error:", e);
    showToast("error", "Erreur: " + e.message);
    showTunnelError("Impossible de démarrer: " + e.message);
  } finally {
    updateTunnelButton();
  }
}

async function stopTunnel() {
  const btn = document.querySelector("#modal-tunnel .btn-danger");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Arrêt...';
  }

  try {
    const resp = await apiFetch("/api/tunnel/stop", { method: "POST" });
    if (resp.ok) {
      showToast("success", "Tunnel arrêté");
    }
    stopTunnelPolling();
    hideTunnelModal();
  } catch (e) {
    showToast("error", "Erreur: " + e.message);
  } finally {
    updateTunnelButton();
  }
}

function startTunnelPolling() {
  stopTunnelPolling();
  tunnelPolling = setInterval(checkTunnelStatus, TUNNEL_POLL_INTERVAL);
  setTimeout(checkTunnelStatus, 500);
}

function stopTunnelPolling() {
  if (tunnelPolling) {
    clearInterval(tunnelPolling);
    tunnelPolling = null;
  }
  tunnelRetryCount = 0;
}

async function checkTunnelStatus() {
  try {
    const resp = await apiFetch("/api/tunnel/status");

    if (!resp.ok) {
      tunnelRetryCount++;
      if (tunnelRetryCount >= TUNNEL_MAX_RETRIES) {
        stopTunnelPolling();
        showTunnelError("Timeout: impossible de récupérer le statut");
      }
      return;
    }

    // Vérifier le Content-Type
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.error("Réponse non-JSON pour /api/tunnel/status");
      tunnelRetryCount++;
      return;
    }

    const data = await resp.json();
    tunnelRetryCount = 0;

    if (data.status === "running" && data.address) {
      showTunnelAddress(data.address, data.provider);
    } else if (data.status === "connecting") {
      showTunnelLoading("Connexion en cours...");
    } else if (data.status === "stopped" || data.status === "inactive") {
      // Ne pas fermer le modal - l'utilisateur veut peut-être démarrer un tunnel
      stopTunnelPolling();
      // Afficher l'état "prêt à démarrer" au lieu de fermer
    } else if (data.status === "error") {
      showTunnelError(data.error || "Erreur du tunnel");
      stopTunnelPolling();
    }

    updateTunnelButton(data.running);
  } catch (e) {
    tunnelRetryCount++;
    if (tunnelRetryCount >= TUNNEL_MAX_RETRIES) {
      stopTunnelPolling();
      showTunnelError("Connexion perdue");
    }
  }
}

async function updateTunnelButton(running) {
  if (running === undefined) {
    try {
      const resp = await apiFetch("/api/tunnel/status");
      if (resp.ok) {
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await resp.json();
          running = data.running;
        } else {
          running = false;
        }
      }
    } catch (e) {
      running = false;
    }
  }

  // Support pour les deux IDs de bouton
  const btn =
    document.getElementById("btn-tunnel") ||
    document.getElementById("btn-playit");
  if (!btn) return;

  btn.disabled = false;
  if (running) {
    btn.innerHTML = '<i class="fas fa-globe"></i> Tunnel Actif';
    btn.classList.add("active");
    btn.onclick = showTunnelModal;
  } else {
    btn.innerHTML = '<i class="fas fa-share-alt"></i> Partager Serveur';
    btn.classList.remove("active");
    btn.onclick = () => showTunnelModal(true);
  }
}

function showTunnelModal(showProviders = false) {
  const modal = document.getElementById("tunnel-modal");
  if (!modal) {
    console.error("Modal tunnel non trouvé");
    return;
  }

  // Reset l'état du modal
  const statusEl = document.getElementById("tunnel-status");
  const addressBox = document.getElementById("tunnel-address-box");
  const actionsEl = document.getElementById("tunnel-actions");
  const manualConfig = document.getElementById("manual-tunnel-config");
  const providersSection = modal.querySelector(".tunnel-providers");

  // Afficher les providers par défaut
  if (providersSection) providersSection.style.display = "block";
  if (manualConfig) manualConfig.style.display = "none";
  if (actionsEl) actionsEl.style.display = "none";
  if (addressBox) addressBox.style.display = "none";

  // Mettre à jour le statut
  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-globe"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Prêt à partager</span>
                <span class="tunnel-provider-name">Sélectionnez un provider</span>
            </div>
        `;
    statusEl.className = "tunnel-status ready";
  }

  // Vérifier le statut actuel du tunnel
  checkTunnelStatus();

  modal.style.display = "flex";
  modal.classList.add("show");
}

function closeTunnelModal() {
  const modal = document.getElementById("tunnel-modal");
  if (modal) {
    modal.classList.remove("show");
    setTimeout(() => (modal.style.display = "none"), 300);
  }
}

function getProviderIcon(id) {
  const icons = {
    "localhost.run": '<i class="fas fa-terminal"></i>',
    serveo: '<i class="fas fa-server"></i>',
    bore: '<i class="fas fa-bolt"></i>',
    cloudflared: '<i class="fas fa-cloud"></i>',
    manual: '<i class="fas fa-cogs"></i>',
  };
  return icons[id] || '<i class="fas fa-globe"></i>';
}

function selectProvider(id) {
  selectedProvider = id;
  document.querySelectorAll(".provider-card").forEach((el) => {
    el.classList.toggle("selected", el.getAttribute("onclick")?.includes(id));
  });
}

function hideTunnelModal() {
  closeTunnelModal();
}

function showManualTunnel() {
  const manualConfig = document.getElementById("manual-tunnel-config");
  if (manualConfig) {
    manualConfig.style.display =
      manualConfig.style.display === "none" ? "block" : "none";
  }
}

function setManualTunnel() {
  const address = document.getElementById("manual-address")?.value?.trim();
  if (!address) {
    showToast("error", "Entrez une adresse");
    return;
  }

  // Afficher l'adresse manuelle
  const addressBox = document.getElementById("tunnel-address-box");
  const tunnelAddress = document.getElementById("tunnel-address");
  const actionsEl = document.getElementById("tunnel-actions");
  const statusEl = document.getElementById("tunnel-status");

  if (tunnelAddress) tunnelAddress.value = address;
  if (addressBox) addressBox.style.display = "block";
  if (actionsEl) actionsEl.style.display = "flex";

  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-check-circle" style="color: var(--success-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Configuration manuelle</span>
                <span class="tunnel-provider-name">Port forwarding</span>
            </div>
        `;
    statusEl.className = "tunnel-status active";
  }

  document.getElementById("manual-tunnel-config").style.display = "none";
  showToast("success", "Adresse configurée !");
}

function showTunnelLoading(message = "Connexion...") {
  const statusEl = document.getElementById("tunnel-status");
  const actionsEl = document.getElementById("tunnel-actions");
  const providersSection = document.querySelector(".tunnel-providers");

  if (providersSection) providersSection.style.display = "none";
  if (actionsEl) actionsEl.style.display = "none";

  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-circle-notch fa-spin"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">${message}</span>
                <span class="tunnel-provider-name">Veuillez patienter...</span>
            </div>
        `;
    statusEl.className = "tunnel-status loading";
  }
}

function showTunnelError(message) {
  const statusEl = document.getElementById("tunnel-status");
  const actionsEl = document.getElementById("tunnel-actions");
  const providersSection = document.querySelector(".tunnel-providers");

  if (providersSection) providersSection.style.display = "block";
  if (actionsEl) actionsEl.style.display = "none";

  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-exclamation-triangle" style="color: var(--error-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Erreur</span>
                <span class="tunnel-provider-name">${message}</span>
            </div>
        `;
    statusEl.className = "tunnel-status error";
  }

  showToast("error", message);
}

function showTunnelAddress(address, provider) {
  const statusEl = document.getElementById("tunnel-status");
  const addressBox = document.getElementById("tunnel-address-box");
  const tunnelAddress = document.getElementById("tunnel-address");
  const actionsEl = document.getElementById("tunnel-actions");
  const providersSection = document.querySelector(".tunnel-providers");

  if (providersSection) providersSection.style.display = "none";
  if (addressBox) addressBox.style.display = "block";
  if (actionsEl) actionsEl.style.display = "flex";
  if (tunnelAddress) tunnelAddress.value = address;

  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-check-circle" style="color: var(--success-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Tunnel Actif !</span>
                <span class="tunnel-provider-name">${provider || selectedProvider || "localhost.run"}</span>
            </div>
        `;
    statusEl.className = "tunnel-status active";
  }

  showToast("success", "Tunnel activé ! Adresse : " + address);
}

function showTunnelManual(data) {
  const statusEl = document.getElementById("tunnel-status");
  const addressBox = document.getElementById("tunnel-address-box");
  const tunnelAddress = document.getElementById("tunnel-address");
  const actionsEl = document.getElementById("tunnel-actions");

  if (addressBox) addressBox.style.display = "block";
  if (actionsEl) actionsEl.style.display = "flex";
  if (tunnelAddress) tunnelAddress.value = data.address || "";

  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-cog" style="color: var(--warning-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Configuration Manuelle</span>
                <span class="tunnel-provider-name">${data.message || "Redirection de port"}</span>
            </div>
        `;
    statusEl.className = "tunnel-status manual";
  }
}

function copyTunnelAddress() {
  const addr = document.getElementById("tunnel-address");
  if (addr) {
    // Fonctionne avec input ou code element
    const text = addr.value || addr.textContent || "";
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("success", "Adresse copiée!"))
      .catch(() => showToast("error", "Erreur de copie"));
  }
}

// Alias pour compatibilité avec l'ancien code Playit
const startPlayitTunnel = startTunnel;
const stopPlayitTunnel = stopTunnel;
const showPlayitModal = () => showTunnelModal(true);
const hidePlayitModal = hideTunnelModal;
const updatePlayitButton = updateTunnelButton;
function copyPlayitAddress() {
  copyTunnelAddress();
}

// Alias pour compatibilité avec le HTML
function openTunnelModal() {
  showTunnelModal(true);
}

// Initialiser les providers au chargement
document.addEventListener("DOMContentLoaded", loadTunnelProviders);

// Init drag drop on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDragDrop);
} else {
  initDragDrop();
}

// -----------------------------
// Runtime error / rejection capture
// Adds a small in-page overlay so users without a console can report errors
// -----------------------------
function _createJsErrorOverlay() {
  if (document.getElementById("js-error-overlay")) return;
  const container = document.createElement("div");
  container.id = "js-error-overlay";
  document.body.appendChild(container);
}

function _showJsError(title, details) {
  _createJsErrorOverlay();
  const root = document.getElementById("js-error-overlay");
  const card = document.createElement("div");
  card.className = "js-error-card";
  card.innerHTML = `<h4>${title}</h4><pre>${details}</pre>`;

  const actions = document.createElement("div");
  actions.className = "js-error-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "js-error-btn";
  copyBtn.textContent = "Copier l'erreur";
  copyBtn.onclick = () => {
    try {
      navigator.clipboard.writeText(title + "\n\n" + details);
      showToast("info", "Erreur copiée dans le presse-papiers");
    } catch (e) {
      showToast("error", "Impossible de copier");
    }
  };

  const closeBtn = document.createElement("button");
  closeBtn.className = "js-error-btn";
  closeBtn.textContent = "Fermer";
  closeBtn.onclick = () => {
    card.remove();
    if (!document.getElementById("js-error-overlay")?.childElementCount) {
      document.getElementById("js-error-overlay")?.remove();
    }
  };

  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);
  root.appendChild(card);
}

globalThis.addEventListener("error", function (ev) {
  try {
    const msg = ev.message || "Erreur JS";
    const src = ev.filename
      ? `${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}`
      : "";
    const stack =
      ev.error && ev.error.stack ? ev.error.stack : `${msg}\n${src}`;
    _showJsError("Erreur JavaScript", stack);
    console.error("Captured error:", ev.error || ev);
  } catch (e) {
    console.error("Error while showing error overlay", e);
  }
});

globalThis.addEventListener("unhandledrejection", function (ev) {
  try {
    const reason = ev.reason
      ? ev.reason.stack || JSON.stringify(ev.reason)
      : "Rejected promise";
    _showJsError("Unhandled Promise Rejection", String(reason));
    console.error("Unhandled rejection:", ev.reason);
  } catch (e) {
    console.error("Error while showing rejection overlay", e);
  }
});

// =====================================================
// AMÉLIORATION 31: Export des logs de la console
// =====================================================
function exportConsoleLogs(format = "txt") {
  const output = document.getElementById("console-output");
  if (!output) {
    showToast("error", "Console non disponible");
    return;
  }

  const logs = output.innerText || output.textContent;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `minecraft-logs-${currentServer}-${timestamp}.${format}`;

  let content = logs;
  if (format === "json") {
    const lines = logs.split("\n").filter((l) => l.trim());
    content = JSON.stringify(
      {
        server: currentServer,
        timestamp: new Date().toISOString(),
        logs: lines,
      },
      null,
      2,
    );
  } else if (format === "html") {
    content = `<!DOCTYPE html><html><head><title>Logs ${currentServer}</title><style>body{background:#1a1a2e;color:#0f0;font-family:monospace;padding:20px;}pre{white-space:pre-wrap;}</style></head><body><h1>Logs: ${currentServer}</h1><p>Date: ${new Date().toLocaleString()}</p><pre>${logs.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
  }

  const blob = new Blob([content], {
    type: format === "json" ? "application/json" : "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast("success", `Logs exportés: ${filename}`);
}

// =====================================================
// AMÉLIORATION 32: Recherche dans les logs
// =====================================================
function highlightLogs(query) {
  const output = document.getElementById("console-output");
  if (!output || !query.trim()) return;

  const spans = output.querySelectorAll("span");
  let count = 0;
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

  spans.forEach((span) => {
    const original = span.dataset.original || span.textContent;
    span.dataset.original = original;

    if (regex.test(original)) {
      span.innerHTML = original.replace(
        regex,
        '<mark class="log-highlight">$&</mark>',
      );
      count++;
    } else {
      span.textContent = original;
    }
  });

  showToast("info", `${count} occurrence(s) trouvée(s)`);
}

function clearLogSearch() {
  const output = document.getElementById("console-output");
  if (!output) return;

  output.querySelectorAll("span").forEach((span) => {
    if (span.dataset.original) {
      span.textContent = span.dataset.original;
    }
  });
}

// =====================================================
// AMÉLIORATION 33: Statistiques du serveur améliorées
// =====================================================
const serverStats = {
  startTime: null,
  commands: 0,
  errors: 0,
  warnings: 0,
  playerJoins: 0,

  reset() {
    this.startTime = new Date();
    this.commands = 0;
    this.errors = 0;
    this.warnings = 0;
    this.playerJoins = 0;
  },

  trackLog(line) {
    if (/error|exception|failed/i.test(line)) this.errors++;
    if (/warn/i.test(line)) this.warnings++;
    if (/joined the game/i.test(line)) this.playerJoins++;
  },

  getUptime() {
    if (!this.startTime) return "0s";
    const diff = Math.floor((Date.now() - this.startTime) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}h ${m}m ${s}s`;
  },

  getSummary() {
    return {
      uptime: this.getUptime(),
      commands: this.commands,
      errors: this.errors,
      warnings: this.warnings,
      playerJoins: this.playerJoins,
    };
  },
};

// =====================================================
// AMÉLIORATION 34: Templates de serveur prédéfinis
// =====================================================
const SERVER_TEMPLATES = {
  survival: {
    name: "Survie Classique",
    config: {
      gamemode: "survival",
      difficulty: "normal",
      pvp: "true",
      "spawn-monsters": "true",
      "spawn-animals": "true",
      "max-players": "20",
    },
  },
  creative: {
    name: "Créatif",
    config: {
      gamemode: "creative",
      difficulty: "peaceful",
      pvp: "false",
      "spawn-monsters": "false",
      "max-players": "10",
    },
  },
  hardcore: {
    name: "Hardcore",
    config: {
      gamemode: "survival",
      difficulty: "hard",
      hardcore: "true",
      pvp: "true",
      "spawn-monsters": "true",
      "max-players": "10",
    },
  },
  minigames: {
    name: "Mini-jeux",
    config: {
      gamemode: "adventure",
      difficulty: "normal",
      pvp: "true",
      "spawn-monsters": "false",
      "max-players": "50",
      "allow-flight": "true",
    },
  },
  roleplay: {
    name: "Roleplay",
    config: {
      gamemode: "survival",
      difficulty: "normal",
      pvp: "false",
      "spawn-monsters": "true",
      "max-players": "30",
      "white-list": "true",
    },
  },
};

function applyServerTemplate(templateId) {
  const template = SERVER_TEMPLATES[templateId];
  if (!template) {
    showToast("error", "Template non trouvé");
    return;
  }

  if (
    !confirm(
      `Appliquer le template "${template.name}" ? Les valeurs actuelles seront remplacées.`,
    )
  ) {
    return;
  }

  Object.entries(template.config).forEach(([key, value]) => {
    const input = document.querySelector(`[data-config-key="${key}"]`);
    if (input) {
      if (input.type === "checkbox") {
        input.checked = value === "true";
      } else {
        input.value = value;
      }
    }
  });

  showToast("success", `Template "${template.name}" appliqué`);
}

// =====================================================
// AMÉLIORATION 35: Gestion des favoris de plugins
// =====================================================
const pluginFavorites = {
  key: "mcpanel_plugin_favorites",

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "[]");
    } catch (e) {
      console.warn("pluginFavorites.load failed", e);
      return [];
    }
  },

  save(favorites) {
    localStorage.setItem(this.key, JSON.stringify(favorites));
  },

  toggle(pluginName) {
    const favs = this.load();
    const idx = favs.indexOf(pluginName);
    if (idx === -1) {
      favs.push(pluginName);
      showToast("success", `${pluginName} ajouté aux favoris`);
    } else {
      favs.splice(idx, 1);
      showToast("info", `${pluginName} retiré des favoris`);
    }
    this.save(favs);
    return idx === -1;
  },

  isFavorite(pluginName) {
    return this.load().includes(pluginName);
  },
};

// =====================================================
// AMÉLIORATION 36: Confirmation avant actions critiques
// =====================================================
function confirmAction(message, callback) {
  const modal = document.createElement("div");
  modal.className = "modal confirm-modal";
  modal.innerHTML = `
        <div class="modal-content confirm-content">
            <div class="confirm-icon">⚠️</div>
            <h3 class="confirm-title">Confirmation requise</h3>
            <p class="confirm-message">${message}</p>
            <div class="confirm-buttons">
                <button class="btn-cancel" onclick="this.closest('.modal').remove()">Annuler</button>
                <button class="btn-confirm" id="confirm-action-btn">Confirmer</button>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
  modal.style.display = "flex";

  document.getElementById("confirm-action-btn").onclick = () => {
    modal.remove();
    callback();
  };

  setTimeout(() => modal.classList.add("show"), 10);
}

// =====================================================
// AMÉLIORATION 37: Mode maintenance du serveur
// =====================================================
function toggleMaintenanceMode(serverName) {
  const isEnabled =
    localStorage.getItem(`maintenance_${serverName}`) === "true";

  if (!isEnabled) {
    confirmAction(
      "Activer le mode maintenance ? Les joueurs ne pourront plus se connecter.",
      () => {
        localStorage.setItem(`maintenance_${serverName}`, "true");
        sendCommand("kick @a Mode maintenance activé");
        showToast("warning", "Mode maintenance activé");
        updateMaintenanceUI(true);
      },
    );
  } else {
    localStorage.setItem(`maintenance_${serverName}`, "false");
    showToast("success", "Mode maintenance désactivé");
    updateMaintenanceUI(false);
  }
}

function updateMaintenanceUI(enabled) {
  const btn = document.getElementById("maintenance-btn");
  if (btn) {
    btn.classList.toggle("active", enabled);
    btn.innerHTML = enabled ? "🔧 Maintenance ON" : "🔧 Maintenance OFF";
  }
}

// =====================================================
// AMÉLIORATION 38: Minuterie et rappels
// =====================================================
const serverTimers = {
  timers: [],

  add(name, minutes, callback) {
    const id = Date.now();
    const timer = {
      id,
      name,
      endTime: Date.now() + minutes * 60000,
      callback,
      interval: setInterval(() => this.check(id), 1000),
    };
    this.timers.push(timer);
    showToast("info", `Minuterie "${name}" créée: ${minutes} min`);
    return id;
  },

  check(id) {
    const timer = this.timers.find((t) => t.id === id);
    if (!timer) return;

    const remaining = timer.endTime - Date.now();
    if (remaining <= 0) {
      this.remove(id);
      timer.callback();
      showToast("warning", `⏰ Minuterie "${timer.name}" terminée!`);
    }
  },

  remove(id) {
    const idx = this.timers.findIndex((t) => t.id === id);
    if (idx !== -1) {
      clearInterval(this.timers[idx].interval);
      this.timers.splice(idx, 1);
    }
  },

  getAll() {
    return this.timers.map((t) => ({
      id: t.id,
      name: t.name,
      remaining: Math.max(0, Math.floor((t.endTime - Date.now()) / 1000)),
    }));
  },
};

// =====================================================
// AMÉLIORATION 39: Raccourcis de commandes personnalisés
// =====================================================
const customShortcuts = {
  key: "mcpanel_shortcuts",

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "{}");
    } catch (e) {
      console.warn("customShortcuts.load failed", e);
      return {};
    }
  },

  save(shortcuts) {
    localStorage.setItem(this.key, JSON.stringify(shortcuts));
  },

  add(alias, command) {
    const shortcuts = this.load();
    shortcuts[alias] = command;
    this.save(shortcuts);
    showToast("success", `Raccourci "/${alias}" créé`);
  },

  remove(alias) {
    const shortcuts = this.load();
    delete shortcuts[alias];
    this.save(shortcuts);
    showToast("info", `Raccourci "/${alias}" supprimé`);
  },

  expand(input) {
    const shortcuts = this.load();
    for (const [alias, cmd] of Object.entries(shortcuts)) {
      if (input.startsWith(`/${alias}`)) {
        return input.replace(`/${alias}`, cmd);
      }
    }
    return input;
  },
};

// =====================================================
// AMÉLIORATION 40: Préréglages de RAM
// =====================================================
const RAM_PRESETS = {
  low: { min: 512, max: 1024, label: "Faible (1 Go)" },
  medium: { min: 1024, max: 2048, label: "Moyen (2 Go)" },
  high: { min: 2048, max: 4096, label: "Élevé (4 Go)" },
  extreme: { min: 4096, max: 8192, label: "Extrême (8 Go)" },
  dedicated: { min: 8192, max: 16384, label: "Dédié (16 Go)" },
};

function applyRamPreset(presetId) {
  const preset = RAM_PRESETS[presetId];
  if (!preset) return;

  const minRam = document.getElementById("min-ram");
  const maxRam = document.getElementById("max-ram");

  if (minRam) minRam.value = preset.min;
  if (maxRam) maxRam.value = preset.max;

  showToast("success", `RAM: ${preset.label}`);
}

// =====================================================
// AMÉLIORATION 41: Copie rapide des informations serveur
// =====================================================
function copyServerInfo() {
  const info = {
    name: currentServer,
    status: document.querySelector(".server-status")?.textContent || "Inconnu",
    version:
      document.querySelector(".server-version")?.textContent || "Inconnue",
    players: document.querySelector(".player-count")?.textContent || "0",
    ip: globalThis.location.hostname,
    port: "25565",
  };

  const text = `🎮 Serveur: ${info.name}
📊 Status: ${info.status}
🔢 Version: ${info.version}
👥 Joueurs: ${info.players}
🌐 IP: ${info.ip}:${info.port}`;

  navigator.clipboard
    .writeText(text)
    .then(() => showToast("success", "Infos serveur copiées!"))
    .catch(() => showToast("error", "Erreur de copie"));
}

// =====================================================
// AMÉLIORATION 42: Mode sombre/clair amélioré
// =====================================================
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

// =====================================================
// AMÉLIORATION 43: Gestion des fichiers de log
// =====================================================
async function loadLogFiles() {
  if (!currentServer) return;

  try {
    const response = await fetch(`/api/servers/${currentServer}/logs`);
    if (!response.ok) throw new Error("Erreur chargement logs");

    const logs = await response.json();
    const container = document.getElementById("log-files-list");
    if (!container) return;

    container.innerHTML = logs
      .map(
        (log) => `
            <div class="log-file-item" onclick="viewLogFile('${log.name}')">
                <span class="log-icon">📄</span>
                <span class="log-name">${log.name}</span>
                <span class="log-size">${formatSize(log.size)}</span>
                <span class="log-date">${new Date(log.modified).toLocaleDateString()}</span>
            </div>
        `,
      )
      .join("");
  } catch (err) {
    console.error("Erreur chargement fichiers log:", err);
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// =====================================================
// AMÉLIORATION 44: Annulation de la dernière commande
// =====================================================
const commandUndo = {
  lastCommand: null,
  undoMap: {
    "gamemode creative": "gamemode survival",
    "gamemode survival": "gamemode creative",
    "gamemode adventure": "gamemode survival",
    "time set day": "time set night",
    "time set night": "time set day",
    "weather clear": "weather rain",
    "weather rain": "weather clear",
    "difficulty peaceful": "difficulty normal",
    "difficulty easy": "difficulty normal",
    "difficulty hard": "difficulty normal",
    "gamerule doDaylightCycle false": "gamerule doDaylightCycle true",
    "gamerule doDaylightCycle true": "gamerule doDaylightCycle false",
    "gamerule keepInventory true": "gamerule keepInventory false",
    "gamerule keepInventory false": "gamerule keepInventory true",
  },

  track(cmd) {
    this.lastCommand = cmd;
  },

  undo() {
    if (!this.lastCommand) {
      showToast("info", "Aucune commande à annuler");
      return;
    }

    const undoCmd = this.undoMap[this.lastCommand];
    if (undoCmd) {
      sendCommand(undoCmd);
      showToast("success", `Annulé: ${this.lastCommand}`);
      this.lastCommand = null;
    } else {
      showToast("warning", "Cette commande ne peut pas être annulée");
    }
  },
};

// =====================================================
// AMÉLIORATION 45: Prévisualisation du monde
// =====================================================
function showWorldPreview(worldName) {
  const modal = document.createElement("div");
  modal.className = "modal world-preview-modal";
  modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🗺️ Aperçu du monde: ${worldName}</h3>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="world-preview-content">
                <div class="world-info-grid">
                    <div class="world-stat">
                        <span class="stat-icon">📍</span>
                        <span class="stat-label">Spawn</span>
                        <span class="stat-value" id="world-spawn">Chargement...</span>
                    </div>
                    <div class="world-stat">
                        <span class="stat-icon">🌡️</span>
                        <span class="stat-label">Seed</span>
                        <span class="stat-value" id="world-seed">Chargement...</span>
                    </div>
                    <div class="world-stat">
                        <span class="stat-icon">📦</span>
                        <span class="stat-label">Taille</span>
                        <span class="stat-value" id="world-size">Chargement...</span>
                    </div>
                    <div class="world-stat">
                        <span class="stat-icon">⏰</span>
                        <span class="stat-label">Temps de jeu</span>
                        <span class="stat-value" id="world-time">Chargement...</span>
                    </div>
                </div>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
  modal.style.display = "flex";
  setTimeout(() => modal.classList.add("show"), 10);
}

// =====================================================
// AMÉLIORATION 46: Gestion des permissions simplifiée
// =====================================================
const COMMON_PERMISSIONS = [
  { name: "minecraft.command.gamemode", desc: "Changer de mode de jeu" },
  { name: "minecraft.command.teleport", desc: "Se téléporter" },
  { name: "minecraft.command.give", desc: "Donner des objets" },
  { name: "minecraft.command.kick", desc: "Expulser des joueurs" },
  { name: "minecraft.command.ban", desc: "Bannir des joueurs" },
  { name: "minecraft.command.op", desc: "Gérer les opérateurs" },
  { name: "minecraft.command.time", desc: "Modifier le temps" },
  { name: "minecraft.command.weather", desc: "Modifier la météo" },
];

function showPermissionHelper() {
  const perms = COMMON_PERMISSIONS.map(
    (p) => `
        <div class="perm-item" onclick="copyPermission('${p.name}')">
            <span class="perm-name">${p.name}</span>
            <span class="perm-desc">${p.desc}</span>
        </div>
    `,
  ).join("");

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
        <div class="modal-content">
            <h3>🔐 Permissions courantes</h3>
            <p class="perm-hint">Cliquez pour copier</p>
            <div class="perm-list">${perms}</div>
            <button class="btn-close" onclick="this.closest('.modal').remove()">Fermer</button>
        </div>
    `;
  document.body.appendChild(modal);
  modal.style.display = "flex";
}

function copyPermission(perm) {
  navigator.clipboard.writeText(perm);
  showToast("success", `Permission copiée: ${perm}`);
}

// =====================================================
// AMÉLIORATION 47: Surveillance automatique
// =====================================================
const autoMonitor = {
  interval: null,
  thresholds: {
    cpu: 90,
    memory: 85,
    players: 0,
  },

  start(checkInterval = 30000) {
    this.stop();
    this.interval = setInterval(() => this.check(), checkInterval);
    showToast("info", "Surveillance automatique activée");
  },

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },

  async check() {
    try {
      const response = await fetch(`/api/servers/${currentServer}/stats`);
      if (!response.ok) return;

      const stats = await response.json();

      if (stats.cpu > this.thresholds.cpu) {
        showToast("warning", `⚠️ CPU élevé: ${stats.cpu}%`);
      }
      if (stats.memory > this.thresholds.memory) {
        showToast("warning", `⚠️ Mémoire élevée: ${stats.memory}%`);
      }
    } catch (err) {
      console.error("Erreur surveillance:", err);
    }
  },

  setThreshold(type, value) {
    if (this.thresholds.hasOwnProperty(type)) {
      this.thresholds[type] = value;
    }
  },
};

// =====================================================
// AMÉLIORATION 48: Quick actions bar
// =====================================================
function setupQuickActions() {
  const actions = [
    { icon: "💾", label: "Sauvegarder", cmd: "save-all", key: "Ctrl+S" },
    { icon: "🌅", label: "Jour", cmd: "time set day", key: "D" },
    { icon: "🌙", label: "Nuit", cmd: "time set night", key: "N" },
    { icon: "☀️", label: "Beau temps", cmd: "weather clear", key: "W" },
    { icon: "📢", label: "Annonce", cmd: "say", key: "A" },
  ];

  const container = document.getElementById("quick-actions");
  if (!container) return;

  container.innerHTML = actions
    .map(
      (a) => `
        <button class="quick-action-btn" onclick="${a.cmd === "say" ? "promptAnnounce()" : `sendCommand('${a.cmd}')`}" title="${a.label} (${a.key})">
            <span class="qa-icon">${a.icon}</span>
            <span class="qa-label">${a.label}</span>
        </button>
    `,
    )
    .join("");
}

function promptAnnounce() {
  const msg = prompt("Message à annoncer:");
  if (msg && msg.trim()) {
    sendCommand(`say ${msg.trim()}`);
  }
}

// =====================================================
// AMÉLIORATION 49: État de connexion en temps réel
// =====================================================
const connectionStatus = {
  isOnline: navigator.onLine,

  init() {
    globalThis.addEventListener("online", () => this.update(true));
    globalThis.addEventListener("offline", () => this.update(false));
    this.update(navigator.onLine);
  },

  update(online) {
    this.isOnline = online;
    const indicator = document.getElementById("connection-indicator");
    if (indicator) {
      indicator.className = `connection-indicator ${online ? "online" : "offline"}`;
      indicator.title = online ? "Connecté" : "Hors ligne";
    }

    if (!online) {
      showToast("error", "🔌 Connexion perdue!");
    } else if (this.isOnline !== online) {
      showToast("success", "🌐 Connexion rétablie!");
    }
  },
};

// =====================================================
// AMÉLIORATION 50: Aide contextuelle intégrée
// =====================================================
const helpSystem = {
  tips: {
    console: [
      "Utilisez ↑/↓ pour naviguer dans l'historique des commandes",
      "Tapez / pour voir les suggestions de commandes",
      "Ctrl+L efface l'affichage de la console",
      "Double-cliquez sur une commande dans l'historique pour la réutiliser",
    ],
    players: [
      "Cliquez sur un joueur pour voir ses options",
      "Utilisez la recherche pour filtrer les joueurs",
      "Le whisper envoie un message privé au joueur",
    ],
    plugins: [
      "Glissez-déposez un fichier .jar pour installer un plugin",
      "Les plugins favoris apparaissent en premier",
      "⚠️ Redémarrez le serveur après installation",
    ],
    config: [
      "Les modifications nécessitent un redémarrage",
      "Utilisez les templates pour une configuration rapide",
      "Survolez une option pour voir sa description",
    ],
    backups: [
      "Les backups automatiques protègent vos données",
      "Cliquez sur une backup pour la restaurer",
      "Gardez au moins 3 backups de sécurité",
    ],
  },

  show(section) {
    const tips = this.tips[section] || ["Aucune aide disponible"];
    const tip = tips[Math.floor(Math.random() * tips.length)];

    const toast = document.createElement("div");
    toast.className = "help-tip";
    toast.innerHTML = `
            <span class="help-icon">💡</span>
            <span class="help-text">${tip}</span>
            <button class="help-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 8000);
  },

  showAll(section) {
    const tips = this.tips[section] || [];
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
            <div class="modal-content">
                <h3>💡 Aide: ${section.charAt(0).toUpperCase() + section.slice(1)}</h3>
                <ul class="help-list">
                    ${tips.map((t) => `<li>${t}</li>`).join("")}
                </ul>
                <button class="btn-close" onclick="this.closest('.modal').remove()">Fermer</button>
            </div>
        `;
    document.body.appendChild(modal);
    modal.style.display = "flex";
  },
};

// =====================================================
// Fonctions manquantes - Server Stats & Settings
// =====================================================

/**
 * Rafraîchit les statistiques du serveur - Section Stats
 */
async function refreshServerStats() {
  if (!currentServer) {
    showNotification("Aucun serveur sélectionné", "warning");
    return;
  }

  try {
    showNotification("Actualisation des statistiques...", "info");

    // Récupérer les stats du serveur
    const response = await apiFetch(`/api/server/${currentServer}/stats`);
    const stats = await response.json();

    // Mettre à jour les cartes de statistiques (IDs du HTML)
    const statUptime = document.getElementById("stat-uptime");
    if (statUptime) statUptime.textContent = stats.uptime || "--";

    const statTotalPlayers = document.getElementById("stat-total-players");
    if (statTotalPlayers)
      statTotalPlayers.textContent = `${stats.players_online || 0}/${stats.max_players || 20}`;

    const statWorldSize = document.getElementById("stat-world-size");
    if (statWorldSize) statWorldSize.textContent = stats.disk_usage || "--";

    const statPluginsCount = document.getElementById("stat-plugins-count");
    if (statPluginsCount)
      statPluginsCount.textContent = stats.plugin_count || 0;

    // Mettre aussi à jour les stats de la console si visibles
    const consoleCpu = document.getElementById("stat-cpu");
    if (consoleCpu)
      consoleCpu.textContent = stats.cpu ? `${stats.cpu.toFixed(1)}%` : "0%";

    const consoleRam = document.getElementById("stat-ram");
    if (consoleRam)
      consoleRam.textContent = stats.ram_mb ? `${stats.ram_mb} MB` : "0 MB";

    const consolePlayers = document.getElementById("stat-players");
    if (consolePlayers)
      consolePlayers.textContent = `${stats.players_online || 0}`;

    const consoleTps = document.getElementById("stat-tps");
    if (consoleTps) consoleTps.textContent = stats.tps || "20.0";

    // Charger les top joueurs
    await loadTopPlayers();

    // Initialiser les graphiques si pas encore fait
    initStatsCharts();

    showNotification("Statistiques actualisées", "success");
  } catch (error) {
    console.error("Erreur lors du rafraîchissement des stats:", error);
    showNotification("Erreur lors du chargement des statistiques", "error");
  }
}

/**
 * Charge les top joueurs du serveur avec un algorithme de scoring multi-paramètres
 * Options possibles (passés en argument ou via globalThis.topPlayersConfig):
 *  - limit: nombre de joueurs à afficher (default 6)
 *  - weights: objet { play_time:0.4, kills:0.2, kd:0.1, recent:0.15, wins:0.1, votes:0.05 }
 *  - showMetrics: boolean pour afficher les métriques (default true)
 */
async function loadTopPlayers(options = {}) {
  const container = document.getElementById("top-players-grid");
  if (!container) return;
  container.innerHTML = "";
  if (!currentServer) return;

  // Defaults
  const defaults = {
    limit: 6,
    showMetrics: true,
    weights: {
      play_time: 0.35,
      kills: 0.15,
      kd: 0.15,
      recent: 0.15,
      wins: 0.1,
      votes: 0.05,
      blocks: 0.03,
      joins: 0.02,
    },
  };

  // Merge with global config if present
  const cfg = Object.assign(
    {},
    defaults,
    globalThis.topPlayersConfig || {},
    options,
  );
  // Normalise weights to sum 1
  const ws = Object.assign(
    {},
    defaults.weights,
    (globalThis.topPlayersConfig || {}).weights || {},
    options.weights || {},
  );
  const totalW =
    Object.values(ws).reduce((s, v) => s + (Number(v) || 0), 0) || 1;
  Object.keys(ws).forEach((k) => (ws[k] = (Number(ws[k]) || 0) / totalW));

  function relTimeScore(ts) {
    if (!ts) return 0;
    const t = typeof ts === "number" ? ts : Date.parse(ts);
    if (Number.isNaN(t)) return 0;
    const secsAgo = (Date.now() - t) / 1000;
    // cap at 30 days
    const cap = 30 * 24 * 3600;
    return Math.max(0, 1 - Math.min(secsAgo, cap) / cap);
  }

  try {
    const resp = await apiFetch(`/api/server/${currentServer}/players`);
    const data = await resp.json();
    const players = Array.isArray(data) ? data : data.players || [];
    if (!players || players.length === 0) {
      container.innerHTML = '<div class="empty-message">Aucun joueur</div>';
      return;
    }

    // Compute raw metric arrays for normalization
    const metrics = players.map((p) => {
      const s = p.stats || {};
      const play = Number(s.play_time || 0);
      const kills = Number(s.kills || 0);
      const deaths = Number(s.deaths || 0);
      const kd = kills / Math.max(1, deaths);
      const wins = Number(s.wins || 0);
      const votes = Number(s.votes || 0);
      const blocks =
        Number(s.blocks_placed || 0) + Number(s.blocks_broken || 0 || 0);
      const joins = Number(s.joins || 0);
      const recent = relTimeScore(
        p.last_seen || p.lastSeen || s.last_seen || s.lastSeen,
      );
      return { play, kills, deaths, kd, wins, votes, blocks, joins, recent };
    });

    function normalize(arr, invert = false) {
      const vals = arr.map((v) => v || 0);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (max === min) return vals.map(() => (invert ? 1 : 0));
      return vals.map((v) => {
        const n = (v - min) / (max - min);
        return invert ? 1 - n : n;
      });
    }

    const plays = normalize(metrics.map((m) => m.play));
    const killsArr = normalize(metrics.map((m) => m.kills));
    const deathsArr = normalize(
      metrics.map((m) => m.deaths),
      true,
    ); // fewer deaths => better
    const kdArr = normalize(metrics.map((m) => m.kd));
    const winsArr = normalize(metrics.map((m) => m.wins));
    const votesArr = normalize(metrics.map((m) => m.votes));
    const blocksArr = normalize(metrics.map((m) => m.blocks));
    const joinsArr = normalize(metrics.map((m) => m.joins));
    const recentArr = normalize(metrics.map((m) => m.recent));

    // Calculate score per player
    const scored = players.map((p, idx) => {
      const score =
        ws.play_time * plays[idx] +
        ws.kills * killsArr[idx] +
        ws.kd * kdArr[idx] +
        ws.wins * winsArr[idx] +
        ws.votes * votesArr[idx] +
        ws.blocks * blocksArr[idx] +
        ws.joins * joinsArr[idx] +
        ws.recent * recentArr[idx];
      return { player: p, score, metrics: metrics[idx] };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, cfg.limit);

    container.innerHTML = top
      .map(({ player: p, score, metrics }, index) => {
        const rankClass =
          index === 0
            ? "gold"
            : index === 1
              ? "silver"
              : index === 2
                ? "bronze"
                : "";
        const playLabel = metrics.play ? formatPlaytime(metrics.play) : "N/A";
        const kills = metrics.kills || 0;
        const deaths = metrics.deaths || 0;
        const kd = (metrics.kd || 0).toFixed(2);
        const lastSeen =
          p.last_seen || p.lastSeen || (p.stats && p.stats.last_seen) || null;
        const lastLabel = lastSeen ? timeAgoLabel(lastSeen) : "-";
        const nameEsc = escapeHtml(p.name || p.player || "?");
        const avatar = `https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/48`;

        return `
          <div class="top-player ${rankClass}" onclick="openPlayerModal('${nameEsc}', '${p.uuid || ""}')" style="cursor:pointer">
            <img src="${avatar}" alt="${nameEsc}" class="player-avatar" onerror="this.src='https://mc-heads.net/avatar/MHF_Steve/48'">
            <div class="player-meta">
              <div class="player-name">${nameEsc}</div>
              <div class="player-sub">${lastLabel} • Score: ${score.toFixed(2)}</div>
            </div>
            <div class="player-stats">
              <div class="stat"><i class="fas fa-clock"></i> ${playLabel}</div>
              <div class="stat"><i class="fas fa-skull-crossbones"></i> ${kills}/${deaths} (KD ${kd})</div>
            </div>
          </div>`;
      })
      .join("");

    if (cfg.showMetrics) {
      const legend = document.createElement("div");
      legend.className = "top-players-legend";
      legend.innerHTML = `<small>Scores calculés avec pondérations: ${Object.entries(
        ws,
      )
        .map(([k, v]) => `${escapeHtml(k)}:${(v * 100).toFixed(0)}%`)
        .join(" ")}</small>`;
      container.appendChild(legend);
    }
  } catch (e) {
    console.error("Erreur chargement top players:", e);
    container.innerHTML = '<div class="empty-message">Erreur chargement</div>';
  }
}

function formatPlaytime(seconds) {
  if (!seconds || seconds === 0) return "Jamais connecté";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}j ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function timeAgoLabel(ts) {
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (Number.isNaN(t)) return "-";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return `Il y a ${Math.floor(diff / 86400)}j`;
}

/**
 * Formate le temps de jeu en heures/minutes
 */
function formatPlaytime(seconds) {
  if (!seconds || seconds === 0) return "Jamais connecté";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

/**
 * Initialise les graphiques de statistiques
 */
let performanceChart = null;
let playersChart = null;

function initStatsCharts() {
  // Graphique de performance - Affiche un message "pas de données" car historique non disponible
  const perfCtx = document.getElementById("performance-chart");
  if (perfCtx && !performanceChart) {
    const ctx = perfCtx.getContext("2d");

    // Afficher un message au lieu de fausses données
    performanceChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: generateTimeLabels(24),
        datasets: [
          {
            label: "CPU %",
            data: new Array(24).fill(null), // Pas de données
            borderColor: "#58a6ff",
            backgroundColor: "rgba(88, 166, 255, 0.1)",
            tension: 0.4,
            fill: true,
            spanGaps: false,
          },
          {
            label: "RAM %",
            data: new Array(24).fill(null), // Pas de données
            borderColor: "#3fb950",
            backgroundColor: "rgba(63, 185, 80, 0.1)",
            tension: 0.4,
            fill: true,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#8b949e" },
          },
          // Message "pas de données"
          title: {
            display: true,
            text: "📊 Historique non disponible - Démarrez le serveur pour collecter les données",
            color: "#8b949e",
            font: { size: 12, style: "italic" },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#8b949e" },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#8b949e" },
            min: 0,
            max: 100,
          },
        },
      },
    });
  }

  // Graphique des joueurs - Même chose, pas de fausses données
  const playersCtx = document.getElementById("players-chart");
  if (playersCtx && !playersChart) {
    playersChart = new Chart(playersCtx.getContext("2d"), {
      type: "bar",
      data: {
        labels: generateTimeLabels(24),
        datasets: [
          {
            label: "Joueurs",
            data: new Array(24).fill(0), // Pas de joueurs enregistrés
            backgroundColor: "rgba(88, 166, 255, 0.6)",
            borderColor: "#58a6ff",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          title: {
            display: true,
            text: "👥 Historique des connexions - Les données seront collectées automatiquement",
            color: "#8b949e",
            font: { size: 12, style: "italic" },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#8b949e" },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#8b949e", stepSize: 1 },
            min: 0,
          },
        },
      },
    });
  }
}

function generateTimeLabels(hours) {
  const labels = [];
  const now = new Date();
  for (let i = hours - 1; i >= 0; i--) {
    const time = new Date(now - i * 3600000);
    labels.push(time.getHours() + "h");
  }
  return labels;
}

function generateRandomData(count, min, max) {
  return Array.from(
    { length: count },
    () => Math.floor(Math.random() * (max - min + 1)) + min,
  );
}

/**
 * Ouvre les paramètres du serveur sélectionné
 */
function openServerSettings() {
  if (!currentServer) {
    showNotification("Aucun serveur sélectionné", "warning");
    return;
  }

  // Afficher la section des paramètres
  showSection("settings");

  // Charger les paramètres du serveur
  loadServerProperties();
}

/**
 * Charge les propriétés du serveur actuel
 */
async function loadServerProperties() {
  if (!currentServer) return;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/properties`);
    const props = await response.json();

    // Remplir le formulaire de propriétés
    const propsContainer =
      document.getElementById("server-properties") ||
      document.getElementById("properties-editor");

    if (propsContainer) {
      let html = '<div class="properties-grid">';

      for (const [key, value] of Object.entries(props)) {
        const inputType =
          typeof value === "boolean"
            ? "checkbox"
            : typeof value === "number"
              ? "number"
              : "text";

        html += `
                    <div class="property-item">
                        <label for="prop-${key}">${key.replace(/-/g, " ").replace(/_/g, " ")}</label>
                        ${
                          inputType === "checkbox"
                            ? `<input type="checkbox" id="prop-${key}" name="${key}" ${value ? "checked" : ""}>`
                            : `<input type="${inputType}" id="prop-${key}" name="${key}" value="${value}">`
                        }
                    </div>
                `;
      }

      html += "</div>";
      html += `<button class="btn btn-primary" onclick="saveServerProperties()">
                        <i class="fas fa-save"></i> Sauvegarder
                     </button>`;

      propsContainer.innerHTML = html;
    }
  } catch (error) {
    console.error("Erreur lors du chargement des propriétés:", error);
    showNotification("Erreur lors du chargement des propriétés", "error");
  }
}

/**
 * Sauvegarde les propriétés du serveur
 */
async function saveServerProperties() {
  if (!currentServer) return;

  try {
    const form = document.querySelector(".properties-grid");
    if (!form) return;

    const inputs = form.querySelectorAll("input");
    const properties = {};

    inputs.forEach((input) => {
      if (input.type === "checkbox") {
        properties[input.name] = input.checked;
      } else if (input.type === "number") {
        properties[input.name] = Number.parseInt(input.value) || 0;
      } else {
        properties[input.name] = input.value;
      }
    });

    const response = await apiFetch(`/api/server/${currentServer}/properties`, {
      method: "POST",

      body: JSON.stringify(properties),
    });

    if (response.ok) {
      showNotification("Propriétés sauvegardées avec succès", "success");
    } else {
      throw new Error("Erreur lors de la sauvegarde");
    }
  } catch (error) {
    console.error("Erreur lors de la sauvegarde:", error);
    showNotification("Erreur lors de la sauvegarde des propriétés", "error");
  }
}

// =====================================================
// Initialisation des nouvelles fonctionnalités
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  // Init thème
  themeManager.init();

  // Init status connexion
  connectionStatus.init();

  // Setup quick actions si disponible
  setupQuickActions();

  // Charger la langue sauvegardée
  loadLanguage();

  // Fermer le dropdown de langue quand on clique ailleurs
  document.addEventListener("click", (e) => {
    const langSelector = document.querySelector(".language-selector");
    const dropdown = document.getElementById("lang-dropdown");
    if (langSelector && dropdown && !langSelector.contains(e.target)) {
      dropdown.classList.remove("show");
    }
  });

  // Afficher aide au premier lancement
  if (!localStorage.getItem("mcpanel_help_shown")) {
    setTimeout(() => helpSystem.show("console"), 3000);
    localStorage.setItem("mcpanel_help_shown", "true");
  }
});

// ==========================================
// MOD MANAGER (NEW)
// ==========================================
async function searchMods(q) {
  const arg = typeof q === "string" && q.trim() ? q.trim() : null;
  const inputEl =
    document.getElementById("mods-search-input") ||
    document.getElementById("mods-search-input-panel");
  const query = arg || (inputEl && inputEl.value ? inputEl.value.trim() : "");
  const container = document.getElementById("mods-results-container");

  if (!query) return;

  container.innerHTML = '<div class="loader"></div>';

  try {
    const res = await apiFetch(`/api/mods/search`, {
      method: "POST",
      body: JSON.stringify({ query: query, limit: 10 }),
    });
    const data = await res.json();

    container.innerHTML = "";
    if (data.results && data.results.length > 0) {
      data.results.forEach((mod) => {
        container.innerHTML += `
                    <div class="card" style="padding: 15px; display: flex; flex-direction: column; justify-content: space-between;">
                        <div style="display:flex; align-items:center; margin-bottom:10px">
                            <img src="${mod.icon_url || "/static/img/default_icon.svg"}" style="width:48px;height:48px;border-radius:4px;margin-right:10px" onerror="this.src='/static/img/default_icon.svg'">
                            <div>
                                <h4 style="margin:0">${mod.title}</h4>
                                <span style="font-size:0.8em; opacity:0.7">${mod.author}</span>
                            </div>
                        </div>
                        <p style="font-size:0.9em; margin-bottom:15px; flex-grow:1">${mod.description}</p>
                        <button class="btn-primary" onclick="installMod('${mod.project_id}')">
                            <i class="fas fa-download"></i> Installer
                        </button>
                    </div>
                `;
      });
    } else {
      container.innerHTML = "<p>Aucun résultat.</p>";
    }
  } catch (e) {
    container.innerHTML = `<p class="text-error">Erreur: ${e.message}</p>`;
  }
}

async function installMod(projectId) {
  if (!currentServer) return;
  if (!confirm("Voulez-vous installer ce mod (dernière version) ?")) return;

  try {
    showToast("info", "Installation en cours...");
    const payload = {
      project_id: projectId,
      loader: currentServerLoader,
      mc_version: currentServerMcVersion,
    };
    console.debug("installMod (direct) payload", {
      server: currentServer,
      payload,
    });
    const res = await apiFetch(`/api/server/${currentServer}/mods/install`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    const ok = data && (data.status === "success" || data.success === true);
    if (ok) {
      showToast("success", data.message || "Mod installé");
      // Refresh mods UI for current server
      try {
        await refreshInstalledMods();
      } catch (e) {
        console.warn("refreshInstalledMods after install failed", e);
      }
      try {
        if (document.querySelector(".tab.active")?.dataset?.view === "mods")
          loadModsForCurrentServer("");
      } catch (e) {}
    } else showToast("error", data.message || "Erreur installation");
  } catch (e) {
    console.error("installMod apiFetch failed", e);
    // Attempt raw fetch to capture server response for debugging
    try {
      const raw = await fetch(`/api/server/${currentServer}/mods/install`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });
      const text = await raw.text();
      console.error("installMod raw response", raw.status, text);
      showToast("error", `Erreur installation (${raw.status})`);
    } catch (rawErr) {
      console.error("installMod raw fetch failed", rawErr);
      showToast("error", "Erreur d'installation");
    }
  }
}

// Handler used by Fabric upload input
async function handleModUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  await uploadModFile(file);
}

// Uninstall helper for installed mods list
async function uninstallMod(filename) {
  if (!currentServer || !filename) return;
  if (!confirm(`Désinstaller ${filename} ?`)) return;
  try {
    const res = await apiFetch(`/api/server/${currentServer}/mods/uninstall`, {
      method: "POST",
      body: JSON.stringify({ filename }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Mod désinstallé");
      try {
        await refreshInstalledMods();
      } catch (e) {}
      loadModsForCurrentServer("");
    } else showToast("error", data.message || "Erreur désinstallation");
  } catch (e) {
    showToast("error", "Erreur API");
  }
}

// Try to uninstall mod by slug or filename identifier
async function uninstallModByIdentifier(identifier) {
  if (!currentServer) throw new Error("No server selected");
  // fetch installed mods and try to match
  const r = await apiFetch(`/api/server/${currentServer}/mods`);
  const d = await r.json();
  const installed = Array.isArray(d.mods) ? d.mods : [];
  const norm = (s) => (s || "").toString().toLowerCase();
  const match = installed.find((m) => {
    if (!m) return false;
    const fname = norm(m.filename || "");
    const name = norm(m.name || "");
    const slug = norm(m.slug || "");
    const id = norm(identifier || "");
    return (
      fname.includes(id) ||
      name.includes(id) ||
      slug.includes(id) ||
      fname.replace(/[-_]/g, "").includes(id.replace(/[-_]/g, ""))
    );
  });
  if (!match) throw new Error("Mod non trouvé sur le serveur");
  const filename = match.filename || match.name || match.slug;
  const res = await apiFetch(`/api/server/${currentServer}/mods/uninstall`, {
    method: "POST",
    body: JSON.stringify({ filename }),
  });
  const data = await res.json();
  if (!data || data.status !== "success")
    throw new Error(data?.message || "Erreur désinstallation");
  // Refresh installed list after successful uninstall
  try {
    await refreshInstalledMods();
  } catch (e) {
    console.warn("refresh after uninstall failed", e);
  }
  return data;
}

// Refresh the installed mods list for Fabric manager
async function refreshInstalledMods() {
  if (!currentServer) return;
  const el = document.getElementById("fabric-installed-mods");
  if (!el) return;
  try {
    el.innerHTML = '<div class="loader-small"></div>';
    const r2 = await apiFetch(`/api/server/${currentServer}/mods`);
    const d2 = await r2.json();
    console.debug("refreshInstalledMods response", {
      server: currentServer,
      status: r2.status,
      bodyKeys: Object.keys(d2 || {}),
    });
    const installed = Array.isArray(d2.mods)
      ? d2.mods
      : d2.status === "success" && Array.isArray(d2.mods)
        ? d2.mods
        : [];
    if (installed.length === 0)
      el.innerHTML =
        '<p class="text-muted" style="margin:0">Aucun mod détecté dans le dossier /mods</p>';
    else
      el.innerHTML = installed
        .map(
          (m) => `
            <div class="installed-mod-row" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:4px;">
                <span style="font-family:monospace; font-size:0.9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${escapeHtml(m.filename || m.name || String(m))}</span>
                <button class="btn-danger btn-sm" style="padding:2px 8px;" onclick="uninstallMod('${escapeHtmlAttr(m.filename || m.name || "")}')"><i class="fas fa-trash"></i></button>
            </div>
        `,
        )
        .join("");
    // If we have mods installed, ensure the UI shows the Mods tab (hide Plugins)
    try {
      if (installed.length > 0) {
        // Check explicit config: don't switch to Mods if config explicitly says Paper
        try {
          const cfgRes = await apiFetch(
            `/api/server/${encodeURIComponent(currentServer)}/config`,
          );
          const cfg = await cfgRes.json();
          if (
            !(
              cfg &&
              (cfg.server_type === "paper" || cfg.serverType === "paper")
            )
          ) {
            setServerModeUI(true);
          } else {
            setServerModeUI(false);
          }
        } catch (e) {
          setServerModeUI(true);
        }
      }
    } catch (e) {}
    // Re-apply crash highlighting if applicable
    try {
      document
        .querySelectorAll("#fabric-installed-mods .installed-mod-row")
        .forEach((el) => el.classList.remove("mod-offending"));
      const crashes = detectCrashes();
      const info = analyzeCrash(crashes);
      const offending = info?.filename || info?.slug || info?.name;
      if (offending) {
        document
          .querySelectorAll("#fabric-installed-mods .installed-mod-row")
          .forEach((el) => {
            if (el.textContent && el.textContent.includes(offending))
              el.classList.add("mod-offending");
          });
      }
    } catch (e) {
      console.warn("re-apply crash highlighting failed", e);
    }
  } catch (e) {
    console.warn("refreshInstalledMods failed", e);
    if (el) el.innerHTML = '<p class="text-error">Erreur chargement mods</p>';
  }
}

async function optimizeServer() {
  if (!currentServer) return;
  if (
    !confirm(
      "Attention: Cela va modifier les paramètres de démarrage Java (Aikar's Flags). Redémarrage requis. Continuer ?",
    )
  )
    return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/optimize`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", data.message);
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur optimisation");
  }
}
async function initiateIconUpload() {
  if (!currentServer) {
    try {
      showToast("warning", "Sélectionnez un serveur avant de changer l'icône");
    } catch (e) {}
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg";

  input.onchange = async (e) => {
    if (!e.target.files.length) return;
    const file = e.target.files[0];

    try {
      console.debug("initiateIconUpload: file selected", {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      showToast("info", "Lecture de l'image...");

      if (!(file.type && file.type.startsWith("image/"))) {
        console.warn("initiateIconUpload: unsupported type", file.type);
        showToast(
          "error",
          "Type de fichier non supporté. Sélectionnez un PNG ou JPG.",
        );
        return;
      }

      let img;
      try {
        img = await readImageFromFile(file);
        console.debug("initiateIconUpload: readImageFromFile succeeded", {
          width: img.width,
          height: img.height,
        });
        showToast(
          "info",
          "Image chargée (" + img.width + "×" + img.height + ")",
        );
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error("initiateIconUpload: readImageFromFile failed", err);
        showToast("error", "Impossible de lire l'image: " + msg);
        return;
      }

      console.debug("initiateIconUpload: image loaded, showing confirmation");
      const chosenBlob = await showIconConfirmation(file, img);
      if (!chosenBlob) {
        console.debug("initiateIconUpload: user cancelled");
        showToast("info", "Importation annulée");
        return;
      }

      const iconBtn = document.getElementById("server-detail-icon");
      try {
        if (iconBtn) iconBtn.classList.add("loading");
      } catch (e) {}

      try {
        console.debug("initiateIconUpload: uploading blob", {
          blobType: chosenBlob && chosenBlob.type,
          size: chosenBlob && chosenBlob.size,
        });
        showToast("info", "Téléversement de l'icône en cours...");
        await uploadIcon(chosenBlob);
        showToast("success", "Téléversement terminé");
      } catch (err) {
        console.error("initiateIconUpload: uploadIcon failed", err);
        showToast(
          "error",
          "Erreur pendant l'upload: " +
            (err && err.message ? err.message : String(err)),
        );
      } finally {
        try {
          if (iconBtn) iconBtn.classList.remove("loading");
        } catch (e) {}
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error("initiateIconUpload: unexpected error", err);
      showToast("error", "Erreur image: " + msg);
    }
  };

  input.click();
}

function resizeImageTo64(file) {
  return new Promise(async (resolve, reject) => {
    try {
      console.debug("resizeImageTo64: start", {
        name: file && file.name,
        type: file && file.type,
        size: file && file.size,
      });
      console.debug("openIconEditor: loading image for editor", {
        name: file && file.name,
      });
      const img = await readImageFromFile(file);
      console.debug("openIconEditor: image loaded for editor", {
        width: img.width,
        height: img.height,
      });
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");

      // Draw resized center-cropped image
      const size = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - size) / 2);
      const sy = Math.floor((img.height - size) / 2);
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 64, 64);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas error"));
      }, "image/png");
      console.debug("resizeImageTo64: finished, blob will be created");
    } catch (err) {
      console.error("resizeImageTo64 failed", err, {
        name: file && file.name,
        type: file && file.type,
        size: file && file.size,
      });
      reject(
        new Error(
          "Impossible de lire l'image: " +
            (err && err.message ? err.message : String(err)),
        ),
      );
    }
  });
}

/**
 * Read an image file reliably using FileReader and return a loaded HTMLImageElement.
 * Provides clearer error messages when file type is wrong/corrupted.
 */
function readImageFromFile(file) {
  return new Promise((resolve, reject) => {
    console.debug("readImageFromFile: start", {
      name: file && file.name,
      type: file && file.type,
      size: file && file.size,
    });
    if (!file) return reject(new Error("Fichier absent"));
    if (!(file.type && file.type.startsWith("image/"))) {
      const name = (file.name || "").toLowerCase();
      if (
        !name.endsWith(".png") &&
        !name.endsWith(".jpg") &&
        !name.endsWith(".jpeg")
      ) {
        console.warn("readImageFromFile: unsupported extension or type", {
          name: file.name,
          type: file.type,
        });
        return reject(
          new Error(`Type de fichier non supporté: ${file.type || "inconnu"}`),
        );
      }
    }

    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Échec de lecture du fichier"));
    fr.onload = () => {
      const dataUrl = fr.result;
      const img = new Image();
      img.onload = () => {
        console.debug("readImageFromFile: image element loaded", {
          width: img.width,
          height: img.height,
        });
        resolve(img);
      };
      img.onerror = (e) => {
        console.error("readImageFromFile: image element failed to load", e);
        reject(
          new Error(
            "Impossible de lire l'image (données corrompues ou format non supporté)",
          ),
        );
      };
      img.src = dataUrl;
    };
    fr.readAsDataURL(file);
  });
}

/**
 * Simple mini-éditeur d'icône: affiche un aperçu et effectue un rognage centré
 * Résout en Blob 64x64 PNG prêt à être uploadé, ou rejette si l'utilisateur annule / erreur
 */
function openIconEditor(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const img = await readImageFromFile(file);

      const modal = document.createElement("div");
      modal.className = "modal icon-editor";
      modal.innerHTML = `
                <div class="modal-content" style="width:520px;max-width:95%;padding:16px;">
                    <h3>Éditeur d'icône</h3>
                    <p style="margin:8px 0 12px;color:var(--text-muted);font-size:0.95em">Ajustement et rognage centré. L'icône finale sera redimensionnée en 64×64.</p>
                    <div style="display:flex;gap:12px;align-items:flex-start">
                        <div style="flex:1;max-width:360px;border:1px solid rgba(255,255,255,0.06);padding:8px;background:var(--bg-secondary)">
                            <img id="icon-editor-image" src="${img.src}" style="max-width:100%;display:block;margin:0 auto;" />
                        </div>
                        <div style="width:160px;text-align:center">
                            <canvas id="icon-editor-preview" width="128" height="128" style="border:1px solid rgba(255,255,255,0.06);background:#111;margin-bottom:8px"></canvas>
                            <div style="font-size:0.9em;color:var(--text-muted);">Aperçu 2× (sera réduit à 64×64)</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
                        <button class="btn" id="icon-editor-cancel">Annuler</button>
                        <button class="btn-primary" id="icon-editor-apply">Appliquer & Téléverser</button>
                    </div>
                </div>`;

      document.body.appendChild(modal);
      console.debug("showIconConfirmation: modal shown");
      modal.classList.add("show");
      console.debug("openIconEditor: modal shown");

      // Draw center-crop preview
      const previewCanvas = modal.querySelector("#icon-editor-preview");
      const previewCtx = previewCanvas.getContext("2d");

      function drawPreview() {
        const size = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - size) / 2);
        const sy = Math.floor((img.height - size) / 2);
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(
          img,
          sx,
          sy,
          size,
          size,
          0,
          0,
          previewCanvas.width,
          previewCanvas.height,
        );
      }

      drawPreview();

      modal.querySelector("#icon-editor-cancel").onclick = () => {
        console.debug("openIconEditor: cancel clicked");
        modal.remove();
        resolve(null);
      };

      modal.querySelector("#icon-editor-apply").onclick = async () => {
        console.debug("openIconEditor: apply clicked");
        try {
          const size = Math.min(img.width, img.height);
          const sx = Math.floor((img.width - size) / 2);
          const sy = Math.floor((img.height - size) / 2);
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 64, 64);
          canvas.toBlob((blob) => {
            if (blob) {
              console.debug("openIconEditor: blob created");
              modal.remove();
              resolve(blob);
            } else {
              console.error("openIconEditor: canvas.toBlob returned null");
              modal.remove();
              reject(new Error("Erreur génération image"));
            }
          }, "image/png");
        } catch (err) {
          modal.remove();
          reject(err);
        }
      };
      try {
        modal.querySelector("#icon-editor-apply").focus();
      } catch (e) {}
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Affiche une modale de confirmation après sélection de l'image.
 * Propose: Utiliser telle quelle (sera redimensionnée/convertie en PNG), Éditer (ouvrir editor), Annuler.
 * Retourne un Blob PNG 64x64 si l'utilisateur choisit d'utiliser ou édite, ou null si annulé.
 */
function showIconConfirmation(file, imgElement) {
  return new Promise((resolve, reject) => {
    try {
      const modal = document.createElement("div");
      modal.className = "modal icon-confirm";
      modal.innerHTML = `
                <div class="modal-content" style="width:480px;max-width:95%;padding:16px;">
                    <h3>Valider l'icône du serveur</h3>
                    <div style="display:flex;gap:12px;align-items:center">
                        <div style="flex:1;max-width:220px;border:1px solid rgba(255,255,255,0.06);padding:8px;background:var(--bg-secondary)">
                            <img id="icon-confirm-preview" src="${imgElement.src}" style="max-width:100%;display:block;margin:0 auto;" />
                        </div>
                        <div style="flex:1">
                            <p style="margin:0 0 8px">Fichier: <strong>${escapeHtml(file.name || "—")}</strong></p>
                            <p style="margin:0 0 8px">Type: <strong>${escapeHtml(file.type || "inconnu")}</strong></p>
                            <p style="margin:0 0 8px">Dimensions: <strong>${imgElement.width}×${imgElement.height}</strong></p>
                            <p style="margin:0;color:var(--text-muted);font-size:0.9em">Vous pouvez utiliser cette image telle quelle (elle sera convertie en PNG 64×64) ou l'éditer pour rogner/ajuster.</p>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
                        <button class="btn" id="icon-confirm-cancel">Annuler</button>
                        <button class="btn" id="icon-confirm-edit">Éditer</button>
                        <button class="btn-primary" id="icon-confirm-use">Utiliser telle quelle</button>
                    </div>
                </div>`;
      document.body.appendChild(modal);

      modal.querySelector("#icon-confirm-cancel").onclick = () => {
        console.debug("showIconConfirmation: cancel");
        modal.remove();
        resolve(null);
      };

      modal.querySelector("#icon-confirm-edit").onclick = async () => {
        console.debug("showIconConfirmation: edit");
        try {
          const blob = await openIconEditor(file);
          modal.remove();
          resolve(blob);
        } catch (err) {
          modal.remove();
          reject(err);
        }
      };

      modal.querySelector("#icon-confirm-use").onclick = async () => {
        console.debug("showIconConfirmation: use as-is");
        try {
          // Convert/resize to 64x64 PNG
          const blob = await resizeImageTo64(file);
          modal.remove();
          resolve(blob);
        } catch (err) {
          modal.remove();
          reject(err);
        }
      };
      try {
        modal.querySelector("#icon-confirm-use").focus();
      } catch (e) {}
    } catch (err) {
      reject(err);
    }
  });
}

async function uploadIcon(blob) {
  console.debug("uploadIcon: start", {
    blobType: blob && blob.type,
    blobSize: blob && blob.size,
    currentServer,
  });
  await ensureCsrfToken();
  const formData = new FormData();
  formData.append("icon", blob, "server-icon.png"); // Force name
  const csrf = getCsrfToken();
  if (csrf) formData.append("csrf_token", csrf);

  try {
    console.debug(
      "uploadIcon: sending to",
      `/api/server/${currentServer}/icon`,
      { currentServer, csrf, blobType: blob && blob.type },
    );
    const res = await apiFetch(`/api/server/${currentServer}/icon`, {
      method: "POST",
      body: formData,
      // Skip Content-Type header to let browser set boundary
      headers: { "X-CSRF-Token": csrf },
    });

    let data;
    try {
      data = await res.json();
    } catch (err) {
      data = { status: "error", message: "Réponse non-JSON du serveur" };
    }

    console.debug("uploadIcon: response", res.status, data);

    if (!res || res.status >= 400 || data.status !== "success") {
      const msg =
        data && data.message
          ? data.message
          : `Erreur serveur (${res && res.status})`;
      showToast("error", `Upload échoué: ${msg}`);
      return;
    }

    showToast("success", "Icône mise à jour (server-icon.png)");

    try {
      const rawUrl = `/api/server/${currentServer}/icon/raw?t=${Date.now()}`;
      const verify = await fetch(rawUrl, { credentials: "include" });
      if (verify && verify.status === 200) {
        const iconImg = document.querySelector("#server-detail-icon img");
        if (iconImg) {
          iconImg.src = rawUrl;
          iconImg.classList.add("icon-updated");
          setTimeout(() => iconImg.classList.remove("icon-updated"), 1600);
        }
        document
          .querySelectorAll(`.server-card img, .server-item img`)
          .forEach((img) => {
            try {
              img.src = `/api/server/${currentServer}/icon/raw?t=${Date.now()}`;
            } catch (e) {}
          });
      } else {
        let text = "";
        try {
          text = await verify.text();
        } catch (err) {
          text = String(err);
        }
        console.warn("uploadIcon: raw endpoint not ready", {
          status: verify && verify.status,
          body: text,
        });
        showToast(
          "warning",
          "Icône sauvegardée mais le fichier n'est pas disponible via l'endpoint raw. Vérifiez les permissions.",
        );
      }
    } catch (err) {
      console.warn("uploadIcon: verification failed", err);
    }

    try {
      await reloadServerIcon(currentServer, { force: true });
    } catch (e) {
      console.warn("uploadIcon: reloadServerIcon failed", e);
    }

    // Also call status endpoint for clearer debugging info
    try {
      const st = await fetch(
        `/api/server/${encodeURIComponent(currentServer)}/icon/status`,
        { credentials: "include" },
      );
      const js = await st.json().catch(() => ({}));
      console.debug("uploadIcon: status", st.status, js);
      if (js && js.exists)
        showToast("success", "Icône disponible sur le serveur");
      else
        showToast(
          "warning",
          "L'icône a été sauvegardée mais n'est pas encore disponible",
        );
    } catch (e) {
      console.warn("uploadIcon: status check failed", e);
    }
  } catch (e) {
    console.error("uploadIcon failed", e);
    showToast(
      "error",
      "Erreur upload icon: " + (e && e.message ? e.message : String(e)),
    );
  }
}

// ==========================================
// MANAGER DE FICHIERS (NEW)
// ==========================================
let currentFilePath = "";

/**
 * Recharge l'icône du serveur dans l'UI en consultant l'endpoint raw.
 * Si l'icône n'existe pas, utilise l'icône par défaut.
 * options: { force: boolean } - if force true, always attempt fetch even if img already set
 */
async function reloadServerIcon(serverName, options = {}) {
  try {
    const iconImg = document.querySelector("#server-detail-icon img");
    const rawUrl = `/api/server/${encodeURIComponent(serverName)}/icon/raw?t=${Date.now()}`;
    console.debug("reloadServerIcon: checking", rawUrl);
    const res = await fetch(rawUrl, { credentials: "include" });
    if (res && res.status === 200) {
      if (iconImg) {
        iconImg.src = rawUrl;
        iconImg.classList.add("icon-updated");
        setTimeout(() => iconImg.classList.remove("icon-updated"), 1600);
      }
      document
        .querySelectorAll(`.server-card img, .server-item img`)
        .forEach((img) => {
          try {
            img.src = rawUrl;
          } catch (e) {}
        });
      console.debug("reloadServerIcon: icon loaded");
      return true;
    } else {
      if (iconImg) iconImg.src = "/static/img/default_icon.svg";
      console.debug("reloadServerIcon: icon not found, using default", {
        status: res && res.status,
      });
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

// Use canonical formatBytes implementation defined earlier to avoid duplicates

async function loadFiles(path) {
  if (!currentServer) return;

  // Path logic
  if (path === "..") {
    const parts = currentFilePath.split("/").filter((p) => p);
    parts.pop();
    path = parts.join("/");
  } else if (path !== "" && currentFilePath && !path.startsWith("/")) {
    path = currentFilePath + "/" + path;
  }

  // Clean path
  path = path.replace(/\/+/g, "/").replace(/^\//, "");

  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/files/list?path=${encodeURIComponent(path)}`,
    );
    const data = await res.json();
    if (data.status === "success") {
      currentFilePath = path;
      renderFiles(data.files, path);
    } else {
      showToast("error", data.message || "Erreur chargement fichiers");
    }
  } catch (e) {
    console.error(e);
    showToast("error", "Erreur chargement fichiers");
  }
}

function renderFiles(files, path) {
  const tbody = document.getElementById("files-list-body");
  const pathDisplay = document.getElementById("files-current-path");
  if (pathDisplay) pathDisplay.textContent = "/" + path;
  if (!tbody) return;

  tbody.innerHTML = "";

  // Sort: folders first
  files.sort((a, b) => (a.is_dir === b.is_dir ? 0 : a.is_dir ? -1 : 1));

  files.forEach((f) => {
    const icon = f.is_dir
      ? '<i class="fas fa-folder text-warning"></i>'
      : '<i class="fas fa-file-code text-secondary"></i>';
    const actions = `
            <button class="btn-icon" onclick="${f.is_dir ? `navigateFiles('${f.name}')` : `openFileEditor('${f.name}')`}" title="${f.is_dir ? "Ouvrir" : "Editer"}">
                ${f.is_dir ? '<i class="fas fa-chevron-right"></i>' : '<i class="fas fa-edit"></i>'}
            </button>
            <button class="btn-icon text-danger" onclick="deleteFile('${f.name}')" title="Supprimer">
                <i class="fas fa-trash"></i>
            </button>
            ${!f.is_dir ? `<button class="btn-icon" onclick="downloadFile('${f.name}')" title="Télécharger"><i class="fas fa-download"></i></button>` : ""}
        `;

    tbody.innerHTML += `
            <tr onclick="${f.is_dir ? `navigateFiles('${f.name}')` : ""}" style="cursor: pointer" class="file-row">
                <td>${icon} <span style="margin-left:8px">${f.name}</span></td>
                <td>${f.is_dir ? "-" : formatBytes(f.size)}</td>
                <td>${new Date(f.modified).toLocaleString()}</td>
                <td style="text-align:right">${actions}</td>
            </tr>
        `;
  });
}

function navigateFiles(dir) {
  loadFiles(dir);
}

// File actions
let editorCurrentFile = "";

async function openFileEditor(filename) {
  const path = currentFilePath ? `${currentFilePath}/${filename}` : filename;
  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/files/read?path=${encodeURIComponent(path)}`,
    );
    const data = await res.json();
    if (data.status === "success") {
      editorCurrentFile = path;
      document.getElementById("file-editor-content").value = data.content;
      document.getElementById("file-editor-filename").textContent = filename;
      document.getElementById("file-editor-modal").style.display = "block";
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur lecture fichier");
  }
}

async function saveFileEditor() {
  const content = document.getElementById("file-editor-content").value;
  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/save`, {
      method: "POST",
      body: JSON.stringify({ path: editorCurrentFile, content }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichier sauvegardé");
      closeFileEditor();
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur sauvegarde");
  }
}

function closeFileEditor() {
  document.getElementById("file-editor-modal").style.display = "none";
}

async function deleteFile(filename) {
  if (!confirm(`Supprimer ${filename} ?`)) return;
  const path = currentFilePath ? `${currentFilePath}/${filename}` : filename;
  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Supprimé");
      loadFiles("");
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur suppression");
  }
}

function downloadFile(filename) {
  const path = currentFilePath ? `${currentFilePath}/${filename}` : filename;
  globalThis.location.href = `/api/server/${currentServer}/files/download?path=${encodeURIComponent(path)}`;
}

async function createFolder() {
  const name = prompt("Nom du sous-dossier:");
  if (!name) return;
  const path = currentFilePath ? `${currentFilePath}/${name}` : name;
  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Dossier créé");
      loadFiles("");
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur création");
  }
}

async function uploadFiles() {
  const input = document.getElementById("file-upload-input");
  const files = input.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }
  formData.append("path", currentFilePath);
  // Ajouter le token CSRF directement dans le form-data pour multipart requests
  const csrf = getCsrfToken();
  if (!csrf) {
    showToast(
      "error",
      "CSRF token manquant. Rafraîchissez la page et reconnectez-vous.",
    );
    return;
  }
  formData.append("csrf_token", csrf);

  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/upload`, {
      method: "POST",
      body: formData,
      headers: {}, // Don't set Content-Type, let browser handle multipart
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichiers uploadés");
      loadFiles("");
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur upload");
  }
}

// Handler appelé depuis l'input file (onchange="handleFileUpload(this.files)")
async function handleFileUpload(files) {
  if (!currentServer) {
    showToast("error", "Sélectionnez un serveur avant d'uploader des fichiers");
    return;
  }
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }
  formData.append("path", currentFilePath);
  // Ensure CSRF is fresh and include it
  await ensureCsrfToken();
  const csrf = getCsrfToken();
  if (!csrf) {
    showToast("error", "CSRF token manquant. Rafraîchissez la page.");
    return;
  }
  formData.append("csrf_token", csrf);

  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/upload`, {
      method: "POST",
      body: formData,
      // explicit X-CSRF-Token header as additional robustness
      headers: { "X-CSRF-Token": csrf },
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichiers uploadés");
      loadFiles("");
    } else {
      showToast("error", data.message || "Erreur upload");
    }
  } catch (e) {
    console.error("Erreur upload fichiers:", e);
    showToast("error", "Erreur upload");
  }
}

// ===================== AMÉLIORATIONS FRONTEND =====================

// Amélioration 41: Dashboard rapide
async function loadDashboard() {
  try {
    const res = await apiFetch("/api/dashboard");
    const data = await res.json();
    if (data.status === "success") {
      updateDashboardUI(data);
    }
  } catch (e) {
    console.error("Erreur dashboard:", e);
  }
}

function updateDashboardUI(data) {
  const dashboardEl = document.getElementById("dashboard-stats");
  if (!dashboardEl) return;

  dashboardEl.innerHTML = `
        <div class="stat-card">
            <i class="fas fa-server"></i>
            <div class="stat-value">${data.servers?.running || 0}/${data.servers?.total || 0}</div>
            <div class="stat-label">Serveurs actifs</div>
        </div>
        <div class="stat-card">
            <i class="fas fa-microchip"></i>
            <div class="stat-value">${data.system?.cpu_percent || 0}%</div>
            <div class="stat-label">CPU</div>
        </div>
        <div class="stat-card">
            <i class="fas fa-memory"></i>
            <div class="stat-value">${data.system?.ram_percent || 0}%</div>
            <div class="stat-label">RAM</div>
        </div>
    `;
}

// Amélioration 42: Recherche de logs côté serveur
async function searchLogsRemote(query) {
  if (!currentServer) return;
  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/logs/search?q=${encodeURIComponent(query)}`,
    );
    const data = await res.json();
    if (data.status === "success") {
      displayLogs(data.logs);
      showToast("info", `${data.count} résultats trouvés`);
    }
  } catch (e) {
    showToast("error", "Erreur de recherche");
  }
}

// Amélioration 43: Recherche dans les logs
async function searchLogs(query) {
  if (!currentServer) return;

  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/logs/search?q=${encodeURIComponent(query)}`,
    );
    const data = await res.json();

    if (data.status === "success") {
      displayLogs(data.logs);
      showToast("info", `${data.count} résultats trouvés`);
    }
  } catch (e) {
    showToast("error", "Erreur de recherche");
  }
}

// Amélioration 44: Clone de serveur
async function cloneServer(serverName) {
  const newName = prompt("Nom du nouveau serveur:", `${serverName}_clone`);
  if (!newName) return;

  try {
    showToast("info", "Clonage en cours...");
    const res = await apiFetch(`/api/server/${serverName}/clone`, {
      method: "POST",
      body: JSON.stringify({ new_name: newName }),
    });
    const data = await res.json();

    if (data.status === "success") {
      showToast("success", data.message);
      loadServers();
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur de clonage");
  }
}

// Amélioration 45: Export de monde
async function exportWorld() {
  if (!currentServer) {
    showToast("warning", "Sélectionnez un serveur");
    return;
  }
  showToast("info", "Préparation de l'export...");
  globalThis.location.href = `/api/server/${currentServer}/world/export`;
}

// Amélioration 46: Broadcast message
async function broadcastMessage() {
  const message = prompt("Message à envoyer à tous les serveurs:");
  if (!message) return;

  try {
    const res = await apiFetch("/api/broadcast", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    const data = await res.json();

    if (data.status === "success") {
      showToast("success", `Message envoyé à ${data.sent_to.length} serveurs`);
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur d'envoi");
  }
}

// Amélioration 47: Suggestion de port
async function suggestPort() {
  try {
    const res = await apiFetch("/api/port/suggest");
    const data = await res.json();

    if (data.status === "success") {
      const portInput = document.getElementById("server-port-input");
      if (portInput) {
        portInput.value = data.port;
      }
      return data.port;
    }
  } catch (e) {
    console.error("Erreur suggestion port:", e);
  }
  return 25565;
}

// Amélioration 48: Présets de commandes
async function loadCommandPresets() {
  try {
    const res = await apiFetch("/api/command/presets");
    const data = await res.json();

    if (data.status === "success") {
      displayCommandPresets(data.presets);
    }
  } catch (e) {
    console.error("Erreur présets:", e);
  }
}

function displayCommandPresets(presets) {
  const container = document.getElementById("command-presets");
  if (!container) return;

  let html = "";
  for (const [category, commands] of Object.entries(presets)) {
    html += `<div class="preset-category">
            <h4>${category}</h4>
            <div class="preset-buttons">`;
    for (const cmd of commands) {
      html += `<button class="preset-btn" onclick="useCommandPreset('${escapeHtmlAttr(cmd.command)}')" title="${escapeHtmlAttr(cmd.command)}">${escapeHtml(cmd.name)}</button>`;
    }
    html += "</div></div>";
  }
  container.innerHTML = html;
}

function useCommandPreset(command) {
  const input = document.getElementById("cmd-input");
  if (input) {
    input.value = command;
    input.focus();
  }
}

// Amélioration 49: Vérification de mise à jour
async function checkServerUpdate() {
  if (!currentServer) return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/update/check`);
    const data = await res.json();

    if (data.status === "success" && data.update_available) {
      showToast("info", `Mise à jour disponible: Build ${data.latest_build}`);
    }
  } catch (e) {
    console.error("Erreur vérification MAJ:", e);
  }
}

// Amélioration 50: Actions par lot
async function batchAction(action) {
  const checkboxes = document.querySelectorAll(".server-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("warning", "Sélectionnez des serveurs");
    return;
  }

  const servers = Array.from(checkboxes).map((cb) => cb.dataset.server);

  if (!confirm(`${action} ${servers.length} serveur(s) ?`)) return;

  try {
    const res = await apiFetch("/api/servers/batch", {
      method: "POST",
      body: JSON.stringify({ action, servers }),
    });
    const data = await res.json();

    if (data.status === "success") {
      showToast("success", `Action effectuée sur ${servers.length} serveurs`);
      loadServers();
    }
  } catch (e) {
    showToast("error", "Erreur action par lot");
  }
}

// Amélioration 51: Arrêt planifié
async function scheduleShutdown(delay = 60) {
  if (!currentServer) return;

  const message = prompt(
    "Message d'avertissement:",
    "Le serveur va redémarrer!",
  );
  if (message === null) return;

  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/schedule/shutdown`,
      {
        method: "POST",
        body: JSON.stringify({ delay, message }),
      },
    );
    const data = await res.json();
    showToast("info", data.message);
  } catch (e) {
    showToast("error", "Erreur planification");
  }
}

// Amélioration 52: Statistiques de stockage
async function loadStorageStats() {
  try {
    const res = await apiFetch("/api/storage/stats");
    const data = await res.json();

    if (data.status === "success") {
      displayStorageStats(data);
    }
  } catch (e) {
    console.error("Erreur stats stockage:", e);
  }
}

function displayStorageStats(data) {
  const container = document.getElementById("storage-stats");
  if (!container) return;

  let html = `<div class="storage-total">Total: ${data.total_mb} MB</div><div class="storage-list">`;
  for (const srv of data.servers.slice(0, 5)) {
    const percent = ((srv.size_mb / data.total_mb) * 100).toFixed(1);
    html += `<div class="storage-item">
            <span>${srv.name}</span>
            <div class="storage-bar" style="width: ${percent}%"></div>
            <span>${srv.size_mb} MB</span>
        </div>`;
  }
  html += "</div>";
  container.innerHTML = html;
}

// Amélioration 53: Nettoyage des logs
async function cleanupLogs() {
  if (!currentServer) return;

  if (!confirm("Supprimer les logs de plus de 7 jours ?")) return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/logs/cleanup`, {
      method: "POST",
    });
    const data = await res.json();
    showToast("success", `${data.deleted} fichiers supprimés`);
  } catch (e) {
    showToast("error", "Erreur nettoyage");
  }
}

// Amélioration 54: EULA automatique
async function acceptEula() {
  if (!currentServer) return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/eula/accept`, {
      method: "POST",
    });
    const data = await res.json();
    showToast("success", data.message);
  } catch (e) {
    showToast("error", "Erreur EULA");
  }
}

// Amélioration 55: Configuration MOTD
async function updateMotd() {
  if (!currentServer) return;

  const motd = prompt("Nouveau MOTD (supporte les codes couleur §):");
  if (motd === null) return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/motd`, {
      method: "POST",
      body: JSON.stringify({ motd }),
    });
    const data = await res.json();
    showToast("success", data.message);
  } catch (e) {
    showToast("error", "Erreur MOTD");
  }
}

// Amélioration 56: Toggle rapides
async function quickToggle(setting, enabled) {
  if (!currentServer) return;

  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/${setting}/toggle`,
      {
        method: "POST",
        body: JSON.stringify({ enabled }),
      },
    );
    const data = await res.json();
    showToast("success", `${setting} ${enabled ? "activé" : "désactivé"}`);
  } catch (e) {
    showToast("error", "Erreur modification");
  }
}

// Amélioration 57: Export configuration
function exportConfig() {
  if (!currentServer) {
    showToast("warning", "Sélectionnez un serveur");
    return;
  }
  globalThis.location.href = `/api/server/${currentServer}/config/export`;
}

// Amélioration 58: Restauration backup
async function restoreBackup(backupName) {
  if (
    !confirm(
      `Restaurer le backup ${backupName} ? Cette action est irréversible !`,
    )
  )
    return;

  try {
    showToast("info", "Restauration en cours...");
    const res = await apiFetch(
      `/api/server/${currentServer}/backup/${backupName}/restore`,
      {
        method: "POST",
      },
    );
    const data = await res.json();

    if (data.status === "success") {
      showToast("success", data.message);
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur restauration");
  }
}

// Amélioration 59: Suppression backup
async function deleteBackup(backupName) {
  if (!confirm(`Supprimer le backup ${backupName} ?`)) return;

  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/backup/${backupName}`,
      {
        method: "DELETE",
      },
    );
    const data = await res.json();

    if (data.status === "success") {
      showToast("success", "Backup supprimé");
      loadBackups();
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur suppression");
  }
}

// Amélioration 60: Flags JVM optimisés
async function getOptimizedFlags() {
  if (!currentServer) return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/jvm/flags`);
    const data = await res.json();

    if (data.status === "success") {
      showModal(
        "Flags JVM Optimisés (Aikar)",
        `
                <p>Copiez ces flags pour des performances optimales:</p>
                <textarea readonly style="width:100%;height:200px;font-family:monospace;font-size:12px;">${data.combined}</textarea>
                <button onclick="navigator.clipboard.writeText('${data.combined.replace(/'/g, "\\'")}'); showToast('success', 'Copié!')">Copier</button>
            `,
      );
    }
  } catch (e) {
    showToast("error", "Erreur récupération flags");
  }
}

// Amélioration: Modal générique
function showModal(title, content) {
  let modal = document.getElementById("generic-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "generic-modal";
    modal.className = "modal";
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="modal-title"></h3>
                    <button class="btn-close" onclick="closeGenericModal()">&times;</button>
                </div>
                <div id="modal-body"></div>
            </div>
        `;
    document.body.appendChild(modal);
  }
  // Remplir et afficher le modal
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = content;
  modal.style.display = "flex";
}

function closeGenericModal() {
  const modal = document.getElementById("generic-modal");
  if (modal) modal.style.display = "none";
}

// --- Exposer fonctions utilisées par les attributs inline ---
// Use a safe expose helper: do not reference undefined identifiers directly
// (which throws ReferenceError); instead use `typeof`/`eval('typeof ...')` to
// detect functions and copy them onto `globalThis` when available.
(function safeExpose(names) {
  names.forEach((n) => {
    try {
      if (typeof globalThis[n] === "function") return; // already global
      // `eval('typeof name')` returns a string without throwing even if
      // the identifier does not exist in this scope.
      if (eval("typeof " + n) === "function") {
        globalThis[n] = eval(n); // copy function reference
        return;
      }
      // Fallback: ensure `showSection` at least forwards to queued real impl
      if (n === "showSection" && typeof globalThis.showSection !== "function") {
        globalThis.showSection = function (sectionName) {
          if (globalThis.__real_showSection)
            return globalThis.__real_showSection(sectionName);
        };
      }
    } catch (e) {
      console.warn("expose " + n + " failed", e);
    }
  });
})([
  "openSettings",
  "logout",
  "refreshAll",
  "openModal",
  "closeModal",
  "changeLanguage",
  "toggleLanguageDropdown",
  "selectServer",
  "createServer",
  "saveConfig",
  "showSection",
]);

// --- Diagnostic & robustification ---
try {
  console.log("MCPanel: bootstrapping client script");
  globalThis.__mcpanel_loaded = true;

  // Global error handlers to help debugging when buttons don't respond
  globalThis.addEventListener("error", (ev) => {
    try {
      console.error("Global error caught:", ev.error || ev.message || ev);
    } catch (e) {
      console.warn("global error handler logging failed", e);
    }
    try {
      if (typeof showToast === "function")
        showToast(
          "error",
          "Erreur JavaScript: " +
            (ev.message || ev.error?.message || "See console"),
        );
    } catch (e) {
      console.warn("showToast in error handler failed", e);
    }
  });
  globalThis.addEventListener("unhandledrejection", (ev) => {
    try {
      console.error("Unhandled rejection:", ev.reason);
    } catch (e) {
      console.warn("unhandled rejection logging failed", e);
    }
    try {
      if (typeof showToast === "function")
        showToast(
          "error",
          "Rejet non géré: " + (ev.reason?.message || String(ev.reason)),
        );
    } catch (e) {
      console.warn("showToast in unhandledrejection failed", e);
    }
  });

  // Helper: expose named functions (if defined) to window for inline handlers
  (function expose(names) {
    names.forEach((n) => {
      try {
        if (typeof globalThis[n] === "function") return; // already available globally
        // Some environments might still expect functions on the global object; attempt to copy
        if (typeof globalThis[n] === "function") return;
      } catch (e) {
        console.warn("expose helper failed for", n, e);
      }
    });
  })([
    "showSection",
    "openSettings",
    "logout",
    "refreshAll",
    "openModal",
    "closeModal",
    "changeLanguage",
    "toggleLanguageDropdown",
    "selectServer",
    "createServer",
    "saveConfig",
    "uploadFiles",
    "handleFileUpload",
    "openInstallModModal",
    "closeInstallModModal",
    "installMod",
    "selectServer",
  ]);

  // Attach DOM-ready bindings for elements that use inline onclick attributes to ensure
  // they work even if the browser evaluated the HTML before script initialization.
  document.addEventListener("DOMContentLoaded", () => {
    // Nav buttons
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.removeEventListener("click", btn._mcp_click);
      btn._mcp_click = () => {
        const sec = btn.dataset.section;
        if (sec && typeof globalThis.showSection === "function")
          globalThis.showSection(sec);
      };
      btn.addEventListener("click", btn._mcp_click);
    });

    // Language dropdown
    const currentLangBtn = document.getElementById("current-lang");
    if (currentLangBtn && typeof toggleLanguageDropdown === "function")
      currentLangBtn.addEventListener("click", toggleLanguageDropdown);
    document.querySelectorAll(".lang-option").forEach((opt) => {
      opt.removeEventListener("click", opt._mcp_click);
      opt._mcp_click = (e) => {
        const lang =
          opt.getAttribute("data-lang") ||
          opt.dataset.lang ||
          (opt.textContent || "").trim().slice(-2);
        if (lang && typeof changeLanguage === "function") changeLanguage(lang);
      };
      opt.addEventListener("click", opt._mcp_click);
    });

    // Create server button
    const createBtn = document.querySelector(".btn-create-large");
    if (createBtn && typeof openModal === "function") {
      createBtn.removeEventListener("click", createBtn._mcp_click);
      createBtn._mcp_click = () => openModal();
      createBtn.addEventListener("click", createBtn._mcp_click);
    }
  });

  // Flush queued showSection calls if any
  if (
    Array.isArray(globalThis.__queuedShowSection) &&
    globalThis.__queuedShowSection.length > 0 &&
    typeof globalThis.__real_showSection === "function"
  ) {
    globalThis.__queuedShowSection.forEach((s) => {
      try {
        globalThis.__real_showSection(s);
      } catch (e) {
        console.warn("flushing queued showSection failed", e);
      }
    });
    globalThis.__queuedShowSection = [];
  }
} catch (e) {
  console.warn("Bootstrap diagnostic failed", e);
}
