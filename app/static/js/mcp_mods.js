// mcp_mods.js
// Gestion des mods: recherche, installation, suppression

async function loadGlobalMods(query) {
  const container = document.getElementById("mods-global-results");
  if (!container) return;
  container.innerHTML = '<div class="loader"></div>';
  try {
    const r = await apiFetch(
      `/api/mods/search?q=${encodeURIComponent(query || "")}`,
    );
    const data = await r.json();
    const hits = data.hits || [];
    container.innerHTML = hits
      .map(
        (mod) =>
          `<div class="mod-row"><div class="mod-left"><img src="${mod.icon_url || "/static/img/default_icon.svg"}" style="width:48px;height:48px;border-radius:4px;margin-right:10px"></div><div class="mod-body"><strong>${escapeHtml(mod.name)}</strong><div class="muted">${escapeHtml(mod.slug)}</div></div><div class="mod-actions"><button class="btn-sm" onclick="installMod('${mod.slug}')">Installer</button></div></div>`,
      )
      .join("");
  } catch (e) {
    container.innerHTML = '<p class="text-error">Erreur</p>';
  }
}

async function loadModsForCurrentServer(query) {
  let container = document.getElementById("mods-results-container");
  if (!container) return;
  container.innerHTML = '<div class="loader"></div>';
  if (!currentServer) {
    // show servers selector
    container.innerHTML = '<p class="text-muted">Sélectionnez un serveur</p>';
    return;
  }
  try {
    const r = await apiFetch(
      `/api/server/${currentServer}/mods?q=${encodeURIComponent(query || "")}`,
    );
    const data = await r.json();
    const mods = data.mods || [];
    container.innerHTML = mods
      .map(
        (mod) =>
          `<div class="mod-row"><div class="mod-left"><img src="${mod.icon_url || "/static/img/default_icon.svg"}" style="width:48px;height:48px;border-radius:4px;margin-right:10px"></div><div class="mod-body"><strong>${escapeHtml(mod.name)}</strong><div class="muted">${escapeHtml(mod.filename || mod.slug)}</div></div><div class="mod-actions"><button class="btn-danger btn-sm" onclick="uninstallMod('${escapeHtmlAttr(mod.filename || mod.name || "").replace("'", "\\'")}')">Désinstaller</button></div></div>`,
      )
      .join("");
  } catch (e) {
    container.innerHTML = '<p class="text-error">Erreur</p>';
  }
}

async function openInstallModModal(projectId, projectName) {
  const modal = document.getElementById("install-mod-modal");
  if (!modal) return;
  modal.classList.add("show");
  const title = modal.querySelector(".modal-title");
  if (title) title.textContent = projectName || projectId;
  (document.getElementById("install-mod-slug") || {}).value = projectId || "";
}

function closeInstallModModal() {
  const modal = document.getElementById("install-mod-modal");
  if (!modal) return;
  modal.classList.remove("show");
}

async function installMod(slug) {
  if (!currentServer) return;
  try {
    await ensureCsrfToken();
    const res = await apiFetch(`/api/server/${currentServer}/mods/install`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", `Mod ${slug} installé`);
      await refreshInstalledMods();
    } else showToast("error", data.message || "Erreur");
  } catch (e) {
    showToast("error", "Erreur d'installation");
  }
}

async function uninstallMod(filename) {
  if (!currentServer) return;
  if (!confirm(`Désinstaller ${filename} ?`)) return;
  try {
    await ensureCsrfToken();
    const res = await apiFetch(`/api/server/${currentServer}/mods/uninstall`, {
      method: "POST",
      body: JSON.stringify({ filename }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", `Mod supprimé`);
      await refreshInstalledMods();
    } else showToast("error", data.message || "Erreur");
  } catch (e) {
    showToast("error", "Erreur suppression");
  }
}

async function uninstallModByIdentifier(identifier) {
  // convenience wrapper if UI passes an identifier
  return uninstallMod(identifier);
}

async function refreshInstalledMods() {
  try {
    if (typeof window.loadModsForCurrentServer === "function")
      await window.loadModsForCurrentServer("");
  } catch (e) {
    console.warn("refreshInstalledMods failed", e);
  }
}

function initMods() {
  globalThis.loadModsForCurrentServer = loadModsForCurrentServer;
  globalThis.loadGlobalMods = loadGlobalMods;
  globalThis.openInstallModModal = openInstallModModal;
  globalThis.closeInstallModModal = closeInstallModModal;
  globalThis.installMod = installMod;
  globalThis.uninstallMod = uninstallMod;
  globalThis.uninstallModByIdentifier = uninstallModByIdentifier;
  globalThis.refreshInstalledMods = refreshInstalledMods;
  globalThis._mcp_installMod = installMod;
}
