// mcp_mods.js
// Gestion des mods: recherche, installation, suppression

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

async function installMod(slug, versionId = null) {
  const currentServer = window.currentServer;
  if (!currentServer) return;
  try {
    showToast("info", "Installation du mod...");
    await ensureCsrfToken();
    const res = await apiFetch(`/api/server/${currentServer}/mods/install`, {
      method: "POST",
      body: JSON.stringify({ slug, project_id: slug, version_id: versionId }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", `Mod ${slug} installé`);
      closeModVersionsModal();
      await refreshInstalledMods();
    } else showToast("error", data.message || "Erreur");
  } catch (e) {
    showToast("error", "Erreur d'installation");
  }
}

async function showModVersions(projectId, projectName) {
  const modal = document.getElementById("mod-versions-modal");
  const list = document.getElementById("mod-versions-list");
  const title = document.getElementById("mod-versions-title");

  if (!modal || !list) return;

  title.textContent = `Versions pour ${projectName || projectId}`;
  list.innerHTML =
    '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';
  modal.classList.add("show");

  try {
    // If a server is selected, try to give hints about loader and MC version
    let url = `/api/mods/versions/${projectId}`;
    try {
      if (window.currentServer) {
        const metaResp = await apiFetch(
          `/api/server/${window.currentServer}/meta`,
        );
        if (metaResp && metaResp.ok) {
          const meta = await metaResp.json();
          const qs = [];
          if (meta.server_type)
            qs.push(`loader=${encodeURIComponent(meta.server_type)}`);
          if (meta.version)
            qs.push(`version=${encodeURIComponent(meta.version)}`);
          if (qs.length) url += `?${qs.join("&")}`;
        }
      }
    } catch (e) {
      console.warn("Could not load server meta for versions hints", e);
    }

    const res = await apiFetch(url);
    const data = await res.json();
    const versions = data.versions || data || [];
    if (!Array.isArray(versions) || versions.length === 0) {
      list.innerHTML =
        '<p class="empty-state">Aucune version trouvée pour ce mod.</p>';
      return;
    }

    list.innerHTML = versions
      .map((v) => {
        const date = new Date(v.date_published).toLocaleDateString();
        const loaders = (v.loaders || []).join(", ");
        const mcVersions = (v.game_versions || []).join(", ");

        return `
        <div class="version-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color);">
          <div class="version-info">
            <strong style="color: var(--primary);">${escapeHtml(v.version_number)}</strong>
            <div style="font-size: 0.85em; opacity: 0.8;">
              <span><i class="fas fa-gamepad"></i> ${escapeHtml(mcVersions)}</span> | 
              <span><i class="fas fa-tools"></i> ${escapeHtml(loaders)}</span>
            </div>
            <small style="opacity: 0.6;">Publié le ${date}</small>
          </div>
          <button class="btn-primary-sm" onclick="installMod('${projectId}', '${v.id}')">
            <i class="fas fa-download"></i> Installer
          </button>
        </div>
      `;
      })
      .join("");
  } catch (e) {
    list.innerHTML = `<p class="text-error">Erreur: ${e.message}</p>`;
  }
}

function closeModVersionsModal() {
  const modal = document.getElementById("mod-versions-modal");
  if (modal) modal.classList.remove("show");
}

async function handleModUpload(file) {
  const currentServer = window.currentServer;
  if (!currentServer || !file) return;

  try {
    showToast("info", `Upload de ${file.name}...`);
    await ensureCsrfToken();
    const formData = new FormData();
    formData.append("mod", file);

    const res = await apiFetch(`/api/server/${currentServer}/mods/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.status === "success") {
      showToast("success", "Mod importé avec succès");
      await refreshInstalledMods();
    } else {
      showToast("error", data.message || "Erreur lors de l'importation");
    }
  } catch (e) {
    showToast("error", "Erreur réseau");
  }
}

async function uninstallMod(filename) {
  const currentServer = window.currentServer;
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
  return uninstallMod(identifier);
}

async function searchMods(q) {
  const arg = typeof q === "string" && q.trim() ? q.trim() : null;
  const inputEl =
    document.getElementById("mods-search-input") ||
    document.getElementById("mods-search-input-panel");
  const query = arg || (inputEl ? inputEl.value.trim() : "");
  const container = document.getElementById("mods-results-container");

  if (!query) {
    if (container)
      container.innerHTML = '<p class="text-muted">Entrez un nom de mod</p>';
    return;
  }

  if (container) container.innerHTML = '<div class="loader"></div>';

  try {
    const res = await apiFetch(`/api/mods/search`, {
      method: "POST",
      body: JSON.stringify({ query: query, limit: 12 }),
    });
    const data = await res.json();
    const results = data.results || data.hits || [];

    if (container) container.innerHTML = "";
    if (results && results.length > 0) {
      results.forEach((mod) => {
        const icon = mod.icon_url || mod.icon || "/static/img/default_icon.svg";
        const title = mod.title || mod.name || "Mod inconnu";
        const desc = mod.description || mod.summary || "";
        const id = mod.project_id || mod.slug || mod.id;
        const author = mod.author || (mod.namespace ? mod.namespace.owner : "");

        if (container)
          container.innerHTML += `
          <div class="card mod-card-search" style="padding: 15px; display: flex; flex-direction: column; justify-content: space-between; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px;">
              <div style="display:flex; align-items:center; margin-bottom:10px">
                  <img src="${icon}" style="width:48px;height:48px;border-radius:4px;margin-right:10px" onerror="this.src='/static/img/default_icon.svg'">
                  <div style="overflow: hidden;">
                      <h4 style="margin:0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</h4>
                      <span style="font-size:0.8em; opacity:0.7">${escapeHtml(author)}</span>
                  </div>
              </div>
              <p style="font-size:0.9em; margin-bottom:15px; flex-grow:1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(desc)}</p>
              <div class="card-footer-search" style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content: space-between; align-items:center;">
                   <span class="mod-downloads" style="font-size:0.8em; opacity:0.6"><i class="fas fa-download"></i> ${mod.downloads || 0}</span>
                </div>
                <div style="display:flex; gap:5px;">
                  <button class="btn-primary" style="flex:1;" onclick="installMod('${id}')" title="Installation automatique (meilleure version compatible)">
                      <i class="fas fa-magic"></i> Auto
                  </button>
                  <button class="btn-secondary" style="flex:1;" onclick="showModVersions('${id}', '${escapeHtml(title).replace(/'/g, "\\'")}')" title="Choisir manuellement la version">
                      <i class="fas fa-list"></i> Versions
                  </button>
                </div>
              </div>
          </div>
        `;
      });
    } else {
      if (container)
        container.innerHTML = "<p class='empty-state'>Aucun résultat.</p>";
    }
  } catch (e) {
    if (container)
      container.innerHTML = `<p class="text-error">Erreur: ${e.message}</p>`;
  }
}

async function searchModsAdmin() {
  const input = document.getElementById("mods-search-input-panel");
  if (input) return searchMods(input.value);
  return searchMods();
}

async function loadInstalledMods() {
  const container = document.getElementById("installed-mods-container");
  const currentServer = window.currentServer;
  if (!container || !currentServer) return;

  container.innerHTML =
    '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    const r = await apiFetch(`/api/server/${currentServer}/mods`);
    const data = await r.json();
    const mods = data.mods || [];
    updateModTabCount(mods.length);

    if (mods.length === 0) {
      container.innerHTML = '<div class="empty-state">Aucun mod installé</div>';
      return;
    }

    container.innerHTML = mods
      .map(
        (mod) => `
      <div class="mod-card">
          <div class="mod-info">
              <div class="mod-icon"><i class="fas fa-cubes"></i></div>
              <div class="mod-details">
                  <h4>${escapeHtml(mod.name)}</h4>
                  <span class="mod-meta">${escapeHtml(mod.filename)}</span>
              </div>
          </div>
          <div class="mod-actions">
              <button class="btn-danger-sm" onclick="uninstallMod('${escapeHtmlAttr(mod.filename)}')" title="Supprimer">
                  <i class="fas fa-trash"></i>
              </button>
          </div>
      </div>
    `,
      )
      .join("");
  } catch (e) {
    container.innerHTML = `<div class="empty-state error"><p>Erreur: ${e.message}</p></div>`;
  }
}

function updateModTabCount(count) {
  const tab = document.querySelector('.tab[data-view="mods"]');
  if (tab) {
    let badge = tab.querySelector(".badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      tab.appendChild(badge);
    }
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-block" : "none";
  }
}

async function refreshInstalledMods() {
  try {
    await loadInstalledMods();
  } catch (e) {
    console.warn("refreshInstalledMods failed", e);
  }
}

function initMods() {
  globalThis.loadGlobalMods =
    typeof loadGlobalMods !== "undefined" ? loadGlobalMods : null;
  globalThis.loadInstalledMods = loadInstalledMods;
  globalThis.openInstallModModal = openInstallModModal;
  globalThis.closeInstallModModal = closeInstallModModal;
  globalThis.installMod = installMod;
  globalThis.uninstallMod = uninstallMod;
  globalThis.uninstallModByIdentifier =
    typeof uninstallModByIdentifier !== "undefined"
      ? uninstallModByIdentifier
      : null;
  globalThis.refreshInstalledMods = refreshInstalledMods;
  globalThis.searchMods = searchMods;
  globalThis.searchModsAdmin = searchModsAdmin;
  globalThis.showModVersions = showModVersions;
  globalThis.closeModVersionsModal = closeModVersionsModal;
  globalThis.handleModUpload = handleModUpload;
  globalThis._mcp_installMod = installMod;
}

initMods();
