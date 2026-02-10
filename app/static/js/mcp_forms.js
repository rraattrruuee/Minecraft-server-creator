// mcp_forms.js
// Gestion des formulaires, des uploads et sauvegarde de configuration

async function uploadFiles() {
  const input = document.getElementById("file-upload-input");
  const files = input?.files;
  if (!files || files.length === 0) return;
  await handleFileUpload(files);
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
  formData.append("path", currentFilePath || "");

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
      headers: { "X-CSRF-Token": csrf },
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichiers uploadés");
      if (typeof loadFiles === "function") loadFiles("");
    } else {
      showToast("error", data.message || "Erreur upload");
    }
  } catch (e) {
    console.error("Erreur upload fichiers:", e);
    showToast("error", "Erreur upload");
  }
}

// Sauvegarder les options de configuration (bouton saveConfig)
async function saveConfig() {
  if (typeof globalThis._mcp_saveConfig === "function")
    return globalThis._mcp_saveConfig();
  console.warn("saveConfig moved to mcp_forms");
}

function initForms() {
  globalThis.uploadFiles = uploadFiles;
  globalThis.handleFileUpload = handleFileUpload;
  globalThis.saveConfig = saveConfig;
  globalThis._mcp_handleFileUpload = handleFileUpload;
  globalThis._mcp_saveConfig = saveConfig;
}
