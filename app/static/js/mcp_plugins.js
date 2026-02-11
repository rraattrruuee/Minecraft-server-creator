// mcp_plugins.js
// Gestion des plugins: installer / désinstaller / uploader

async function installPlugin(slug, name) {
  if (!currentServer) return;
  try {
    showToast("info", `Installation de ${name}...`);
    await ensureCsrfToken();
    const response = await apiFetch(
      `/api/server/${currentServer}/plugins/install`,
      { method: "POST", body: JSON.stringify({ slug }) },
    );
    const result = await response.json();
    if (result.status === "success") {
      showToast("success", `${name} installé avec succès`);
      if (typeof loadInstalledPlugins === "function") loadInstalledPlugins();
    } else showToast("error", result.message || "Installation échouée");
  } catch (error) {
    console.error("Erreur installation:", error);
    showToast("error", `Erreur installation: ${error.message}`);
  }
}

async function uninstallPlugin(name) {
  if (!currentServer) return;
  if (!confirm(`Désinstaller ${name} ?`)) return;
  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/plugins/uninstall`,
      { method: "POST", body: JSON.stringify({ name }) },
    );
    const result = await response.json();
    if (result.status === "success") {
      showToast("success", `${name} désinstallé`);
      if (typeof loadInstalledPlugins === "function") loadInstalledPlugins();
    } else showToast("error", result.message || "Erreur de désinstallation");
  } catch (error) {
    console.error("Erreur désinstallation:", error);
    showToast("error", `Erreur: ${error.message}`);
  }
}

async function loadInstalledPlugins() {
  if (!currentServer) return;
  const container = document.getElementById("installed-plugins");
  if (!container) return;

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
    const plugins = await response.json();

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
    container.innerHTML = `<div class="empty-state error"><p>Erreur: ${escapeHtml(error.message)}</p></div>`;
  }
}

function updatePluginTabCount(count) {
  const tab = document.querySelector('.tab[data-view="plugins"]');
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

async function searchPlugins() {
  const queryInput = document.getElementById("plugin-search");
  const query = queryInput ? queryInput.value.trim() : "";
  const container = document.getElementById("search-results");
  if (!container) return;
  if (!query) {
    container.innerHTML =
      '<p class="empty-state">Entrez un terme de recherche</p>';
    return;
  }

  try {
    const response = await apiFetch(
      `/api/plugins/search?q=${encodeURIComponent(query)}`,
    );
    const result = await response.json();
    const plugins = result.result || result.results || [];

    if (plugins.length === 0) {
      container.innerHTML = '<p class="empty-state">Aucun résultat</p>';
      return;
    }

    container.innerHTML = plugins
      .map((p) => {
        const slug = p.slug || (p.namespace ? p.namespace.slug : "");
        const name = p.name || p.title || "Inconnu";
        const desc = p.description || p.summary || "";

        return `
            <div class="plugin-card search-result border-accent">
              <div class="plugin-info">
                  <h4>${escapeHtml(name)}</h4>
                  <p class="plugin-desc">${escapeHtml(desc)}</p>
                  <div class="plugin-meta-search">
                    <span><i class="fas fa-user"></i> ${escapeHtml(p.author || (p.namespace ? p.namespace.owner : "Inconnu"))}</span>
                    <span><i class="fas fa-star"></i> ${p.stats ? p.stats.stars || 0 : 0}</span>
                  </div>
              </div>
              <div class="plugin-actions">
                  <button class="btn-primary-sm" onclick="installPlugin('${slug}', '${escapeHtml(name)}')">
                      <i class="fas fa-download"></i> Installer
                  </button>
              </div>
            </div>
          `;
      })
      .join("");
  } catch (error) {
    container.innerHTML = `<p class="error">Erreur recherche: ${error.message}</p>`;
  }
}

function initPlugins() {
  globalThis.installPlugin = installPlugin;
  globalThis.uninstallPlugin = uninstallPlugin;
  globalThis.loadInstalledPlugins = loadInstalledPlugins;
  globalThis.searchPlugins = searchPlugins;
  globalThis.updatePluginTabCount = updatePluginTabCount;

  globalThis._mcp_installPlugin = installPlugin;
  globalThis._mcp_loadInstalledPlugins = loadInstalledPlugins;
}
