// mcp_server_management.js
// Gestion des opérations sur les serveurs (create/start/stop/backup/restore)

async function createServer(event) {
  // allow older overrides
  if (
    typeof globalThis._mcp_createServer === "function" &&
    globalThis._mcp_createServer !== createServer
  )
    return globalThis._mcp_createServer(event);

  if (event && event.preventDefault) event.preventDefault();

  const name = document.getElementById("server-name-input")?.value?.trim();
  const version = document.getElementById("server-version")?.value;
  const ramMin = document.getElementById("ram-min")?.value || "1024";
  const ramMax = document.getElementById("ram-max")?.value || "2048";
  const serverType = document.getElementById("server-type")?.value || "paper";
  const loaderVersion = document.getElementById("fabric-loader")?.value || null;
  const forgeVersion = document.getElementById("forge-version")?.value || null;

  if (!name || !version) {
    try {
      if (typeof showToast === "function")
        showToast("error", "Remplissez tous les champs");
    } catch (e) {}
    return;
  }

  try {
    try {
      closeModal();
    } catch (e) {}
    try {
      if (typeof showToast === "function")
        showToast("info", "Création du serveur...");
    } catch (e) {}

    const response = await apiFetch("/api/create", {
      method: "POST",
      body: JSON.stringify({
        name,
        version,
        ram_min: ramMin + "M",
        ram_max: ramMax + "M",
        server_type: serverType,
        loader_version: loaderVersion,
        forge_version: forgeVersion,
      }),
    });

    const result = await response.json();

    if (result.status === "success") {
      try {
        if (typeof showToast === "function")
          showToast("success", `Serveur ${name} créé !`);
      } catch (e) {}

      // Auto-save meta to ensure config persisted
      try {
        const payload = {
          version: version,
          server_type: serverType,
          loader_version: loaderVersion || undefined,
          forge_version: forgeVersion || undefined,
        };
        await apiJson(`/api/server/${encodeURIComponent(name)}/meta`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.warn("createServer: auto-save meta failed", e);
      }

      // Refresh server list and select new server
      try {
        if (typeof loadServerList === "function") await loadServerList(true);
        if (typeof selectServer === "function") selectServer(name);
      } catch (e) {
        console.warn("createServer: post-create refresh/select failed", e);
      }

      // clear form
      try {
        document.getElementById("server-name-input").value = "";
      } catch (e) {}
    } else {
      try {
        if (typeof showToast === "function")
          showToast("error", result.message || "Erreur création");
      } catch (e) {}
    }
  } catch (err) {
    console.error("Erreur création:", err);
    try {
      if (typeof showToast === "function")
        showToast("error", "Erreur lors de la création");
    } catch (e) {}
  }
}
function showServersList() {
  window.currentServer = null;
  if (typeof stopStatusPolling === "function") stopStatusPolling();
  if (typeof stopLogStream === "function") stopLogStream();

  const listView = document.getElementById("servers-list-view");
  const detailView = document.getElementById("server-detail-view");

  if (listView) listView.style.display = "block";
  if (detailView) detailView.style.display = "none";

  document
    .querySelectorAll(".server-item")
    .forEach((item) => item.classList.remove("active"));
}

function openServerSettings() {
  if (!window.currentServer) {
    if (typeof showToast === "function")
      showToast("warning", "Aucun serveur sélectionné");
    return;
  }
  if (typeof showSection === "function") showSection("settings");
  if (typeof loadServerProperties === "function") loadServerProperties();
}

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
// Save server meta from server settings UI
async function saveServerMetaFromUI() {
  if (
    typeof globalThis._mcp_saveServerMetaFromUI === "function" &&
    globalThis._mcp_saveServerMetaFromUI !== saveServerMetaFromUI
  )
    return globalThis._mcp_saveServerMetaFromUI();

  const name =
    window.currentServer || document.getElementById("server-name-input")?.value;
  if (!name) {
    try {
      if (typeof showToast === "function")
        showToast("error", "Aucun serveur sélectionné");
    } catch (e) {}
    return;
  }

  const payload = {};
  try {
    const version = document.getElementById("server-version")?.value;
    if (version) payload.version = version;
  } catch (e) {}
  try {
    const serverType = document.getElementById("server-type")?.value;
    if (serverType) payload.server_type = serverType;
  } catch (e) {}
  try {
    const loader = document.getElementById("fabric-loader")?.value;
    if (loader) payload.loader_version = loader;
  } catch (e) {}
  try {
    const forgeV = document.getElementById("forge-version")?.value;
    if (forgeV) payload.forge_version = forgeV;
  } catch (e) {}

  try {
    await apiJson(`/api/server/${encodeURIComponent(name)}/meta`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    try {
      if (typeof showToast === "function")
        showToast("success", "Configuration sauvegardée");
    } catch (e) {}
  } catch (err) {
    console.warn("saveServerMetaFromUI failed", err);
    try {
      if (typeof showToast === "function")
        showToast("error", "Échec sauvegarde config");
    } catch (e) {}
  }
}

async function startServer(name) {
  const target = name || window.currentServer;
  if (!target) return;
  try {
    const res = await apiFetch(
      `/api/server/${encodeURIComponent(target)}/start`,
      { method: "POST" },
    );
    const data = await res.json();
    if (data.status === "success") {
      if (typeof showToast === "function")
        showToast("success", "Serveur en cours de démarrage...");
    } else {
      if (typeof showToast === "function")
        showToast("error", data.message || "Erreur démarrage");
    }
  } catch (err) {
    if (typeof showToast === "function") showToast("error", "Erreur réseau");
  }
}

async function stopServer(name) {
  const target = name || window.currentServer;
  if (!target) return;
  try {
    const res = await apiFetch(
      `/api/server/${encodeURIComponent(target)}/stop`,
      { method: "POST" },
    );
    const data = await res.json();
    if (data.status === "success") {
      if (typeof showToast === "function")
        showToast("success", "Arrêt du serveur...");
    } else {
      if (typeof showToast === "function")
        showToast("error", data.message || "Erreur arrêt");
    }
  } catch (err) {
    if (typeof showToast === "function") showToast("error", "Erreur réseau");
  }
}

async function restartServer(name) {
  const target = name || window.currentServer;
  if (!target) return;
  try {
    const res = await apiFetch(
      `/api/server/${encodeURIComponent(target)}/restart`,
      { method: "POST" },
    );
    const data = await res.json();
    if (data.status === "success") {
      if (typeof showToast === "function")
        showToast("success", "Redémarrage du serveur...");
    } else {
      if (typeof showToast === "function")
        showToast("error", data.message || "Erreur redémarrage");
    }
  } catch (err) {
    if (typeof showToast === "function") showToast("error", "Erreur réseau");
  }
}

async function backupServer(name) {
  const target = name || window.currentServer;
  if (!target) return;
  try {
    if (typeof showToast === "function")
      showToast("info", "Création de la sauvegarde...");
    const res = await apiFetch(
      `/api/server/${encodeURIComponent(target)}/backup/now`,
      { method: "POST" },
    );
    const data = await res.json();
    if (data.status === "success") {
      if (typeof showToast === "function")
        showToast("success", "Sauvegarde créée");
      if (typeof loadBackups === "function") loadBackups();
    } else {
      if (typeof showToast === "function")
        showToast("error", data.message || "Erreur sauvegarde");
    }
  } catch (err) {
    if (typeof showToast === "function") showToast("error", "Erreur réseau");
  }
}

async function deleteServer(name) {
  const target = name || window.currentServer;
  if (!target) return;
  if (
    !confirm(
      `Voulez-vous vraiment supprimer le serveur "${target}" ? Cette action est irréversible.`,
    )
  )
    return;

  try {
    const res = await apiFetch(`/api/server/${encodeURIComponent(target)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.status === "success") {
      if (typeof showToast === "function")
        showToast("success", "Serveur supprimé");
      if (typeof loadServerList === "function") await loadServerList(true);
      if (window.currentServer === target) {
        window.currentServer = null;
        if (typeof showSection === "function") showSection("dashboard");
      }
    } else {
      if (typeof showToast === "function")
        showToast("error", data.message || "Erreur suppression");
    }
  } catch (err) {
    if (typeof showToast === "function") showToast("error", "Erreur réseau");
  }
}

async function serverAction(action) {
  if (!currentServer) return;
  if (
    (action === "stop" || action === "restart") &&
    !confirm(
      `Voulez-vous vraiment ${action === "stop" ? "arrêter" : "redémarrer"} le serveur ?`,
    )
  )
    return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/${action}`, {
      method: "POST",
    });
    const result = await res.json();
    if (result.status === "success") {
      showToast("success", `Action ${action} lancée !`);
    } else {
      showToast("error", result.message || "Erreur action");
    }
  } catch (err) {
    showToast("error", "Erreur lors de l'action");
  }
}

async function optimizeServer() {
  if (!currentServer) return;
  try {
    showToast("info", "Optimisation en cours...");
    const res = await apiFetch(`/api/server/${currentServer}/optimize`, {
      method: "POST",
    });
    const result = await res.json();
    if (result.status === "success") {
      showToast("success", "Optimisation terminée !");
    } else {
      showToast("error", result.message || "Échec optimisation");
    }
  } catch (err) {
    showToast("error", "Erreur réseau");
  }
}

async function openScheduleModal() {
  const modal = document.getElementById("schedule-modal");
  if (modal) modal.style.display = "block";
}

function initServerManagement() {
  globalThis.createServer = createServer;
  globalThis.showServersList = showServersList;
  globalThis.openServerSettings = openServerSettings;
  globalThis.setServerModeUI = setServerModeUI;
  globalThis.saveServerMetaFromUI = saveServerMetaFromUI;
  globalThis.startServer = startServer;
  globalThis.stopServer = stopServer;
  globalThis.restartServer = restartServer;
  globalThis.backupServer = backupServer;
  globalThis.deleteServer = deleteServer;
  globalThis.serverAction = serverAction;
  globalThis.optimizeServer = optimizeServer;
  globalThis.openScheduleModal = openScheduleModal;

  globalThis._mcp_createServer = createServer;
  globalThis._mcp_saveServerMetaFromUI = saveServerMetaFromUI;
}
