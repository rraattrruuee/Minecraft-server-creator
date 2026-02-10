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
    await ensureCsrfToken();
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

function initPlugins() {
  globalThis.installPlugin = installPlugin;
  globalThis.uninstallPlugin = uninstallPlugin;
  globalThis._mcp_installPlugin = installPlugin;
}
