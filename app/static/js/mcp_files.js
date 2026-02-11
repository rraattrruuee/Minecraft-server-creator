let currentFilePath = "";
let editorCurrentFile = "";

async function loadFiles(path = "") {
  const currentServer = window.currentServer;
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
      globalThis.currentFilePath = path; // Export to global for other tools
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

  if (path !== "") {
    tbody.innerHTML += `
            <tr onclick="navigateFiles('..')" style="cursor: pointer" class="file-row bg-light">
                <td colspan="4"><i class="fas fa-level-up-alt"></i> <span style="margin-left:8px">.. (Dossier parent)</span></td>
            </tr>
        `;
  }

  files.forEach((f) => {
    const icon = f.is_dir
      ? '<i class="fas fa-folder text-warning"></i>'
      : '<i class="fas fa-file-code text-secondary"></i>';

    // Safety check for names that might break the onclick
    const safeName = f.name.replace(/'/g, "\\'");

    const actions = `
            <button class="btn-icon" onclick="${f.is_dir ? `navigateFiles('${safeName}')` : `openFileEditor('${safeName}')`}" title="${f.is_dir ? "Ouvrir" : "Editer"}">
                ${f.is_dir ? '<i class="fas fa-chevron-right"></i>' : '<i class="fas fa-edit"></i>'}
            </button>
            <button class="btn-icon text-danger" onclick="deleteFile('${safeName}')" title="Supprimer">
                <i class="fas fa-trash"></i>
            </button>
            ${!f.is_dir ? `<button class="btn-icon" onclick="downloadFile('${safeName}')" title="Télécharger"><i class="fas fa-download"></i></button>` : ""}
        `;

    tbody.innerHTML += `
            <tr class="file-row">
                <td onclick="${f.is_dir ? `navigateFiles('${safeName}')` : `openFileEditor('${safeName}')`}" style="cursor: pointer">${icon} <span style="margin-left:8px">${f.name}</span></td>
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

async function openFileEditor(filename) {
  const currentServer = window.currentServer;
  const path = currentFilePath ? `${currentFilePath}/${filename}` : filename;
  try {
    const res = await apiFetch(
      `/api/server/${currentServer}/files/read?path=${encodeURIComponent(path)}`,
    );
    const data = await res.json();
    if (data.status === "success") {
      editorCurrentFile = path;
      const editor = document.getElementById("file-editor-content");
      const filenameDisplay = document.getElementById("file-editor-filename");
      const modal = document.getElementById("file-editor-modal");

      if (editor) editor.value = data.content;
      if (filenameDisplay) filenameDisplay.textContent = filename;
      if (modal) modal.style.display = "block";
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur lecture fichier");
  }
}

async function saveFileEditor() {
  const currentServer = window.currentServer;
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
  const modal = document.getElementById("file-editor-modal");
  if (modal) modal.style.display = "none";
}

async function deleteFile(filename) {
  const currentServer = window.currentServer;
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
  const currentServer = window.currentServer;
  const path = currentFilePath ? `${currentFilePath}/${filename}` : filename;
  globalThis.location.href = `/api/server/${currentServer}/files/download?path=${encodeURIComponent(path)}`;
}

async function createFolder() {
  const currentServer = window.currentServer;
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
      loadFiles(currentFilePath);
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur création");
  }
}

// Added createNewFile for UI compatibility
async function createNewFile() {
  const currentServer = window.currentServer;
  const name = prompt("Nom du nouveau fichier (ex: test.txt):");
  if (!name) return;
  const path = currentFilePath ? `${currentFilePath}/${name}` : name;
  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/save`, {
      method: "POST",
      body: JSON.stringify({ path, content: "" }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichier créé");
      loadFiles(currentFilePath);
      openFileEditor(name);
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    showToast("error", "Erreur création fichier");
  }
}

async function uploadFiles() {
  const currentServer = window.currentServer;
  const input = document.getElementById("file-upload-input");
  if (!input) return;
  const files = input.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }
  formData.append("path", currentFilePath);

  // Get CSRF from cookie if possible, otherwise from meta
  const csrf = typeof getCsrfToken === "function" ? getCsrfToken() : "";
  if (csrf) {
    formData.append("csrf_token", csrf);
  }

  try {
    const res = await apiFetch(`/api/server/${currentServer}/files/upload`, {
      method: "POST",
      body: formData,
      // Let browser set content-type for FormData
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", "Fichiers uploadés");
      loadFiles(currentFilePath);
    } else {
      showToast("error", data.message);
    }
  } catch (e) {
    console.error(e);
    showToast("error", "Erreur upload");
  }
}

async function handleFileUpload(files) {
  if (!window.currentServer) {
    showToast("warning", "Sélectionnez un serveur d'abord");
    return;
  }
  if (files && files.length > 0) {
    await uploadFiles();
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function initFiles() {
  globalThis.loadFiles = loadFiles;
  globalThis.navigateFiles = navigateFiles;
  globalThis.openFileEditor = openFileEditor;
  globalThis.saveFileEditor = saveFileEditor;
  globalThis.closeFileEditor = closeFileEditor;
  globalThis.deleteFile = deleteFile;
  globalThis.downloadFile = downloadFile;
  globalThis.createFolder = createFolder;
  globalThis.createNewFolder = createFolder; // Alias
  globalThis.createNewFile = createNewFile;
  globalThis.uploadFiles = uploadFiles;
  globalThis.handleFileUpload = handleFileUpload;

  globalThis.formatBytes = formatBytes;

  // Initialize path
  globalThis.currentFilePath = "";

  // Drag and Drop
  globalThis.initDragDrop = initDragDrop;
  globalThis.handleFileDrop = handleFileDrop;
  globalThis.uploadPlugin = uploadPlugin;
}

async function uploadPlugin(file) {
  if (!window.currentServer || !file) return;
  try {
    showToast("info", "Upload du plugin " + file.name + "...");
    await ensureCsrfToken();
    const formData = new FormData();
    formData.append("plugin", file);
    const res = await apiFetch(
      `/api/server/${window.currentServer}/plugins/upload`,
      {
        method: "POST",
        body: formData,
      },
    );
    const result = await res.json();
    if (result.status === "success") {
      showToast("success", "Plugin installé");
      if (typeof loadInstalledPlugins === "function") loadInstalledPlugins();
    } else {
      showToast("error", result.message || "Erreur upload");
    }
  } catch (e) {
    showToast("error", "Erreur réseau: " + e.message);
  }
}

function initDragDrop() {
  // Add CSS for drag over
  if (!document.getElementById("mcp-drag-drop-style")) {
    const s = document.createElement("style");
    s.id = "mcp-drag-drop-style";
    s.textContent =
      ".drag-over { border: 2px dashed var(--primary) !important; background: rgba(99, 102, 241, 0.1) !important; }";
    document.head.appendChild(s);
  }

  document.querySelectorAll(".view, .content").forEach((zone) => {
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
      if (!window.currentServer) {
        showToast("error", "Sélectionnez un serveur");
        return;
      }
      for (const file of e.dataTransfer.files) await handleFileDrop(file);
    });
  });
}

async function handleFileDrop(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "jar") {
    await uploadPlugin(file);
  } else if (ext === "zip") {
    showToast("info", "Importation du monde...");
    const formData = new FormData();
    formData.append("world", file);
    try {
      const res = await apiFetch(
        `/api/server/${window.currentServer}/worlds/import`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await res.json();
      if (data.status === "success") showToast("success", "Monde importé");
      else showToast("error", data.message);
    } catch (e) {
      showToast("error", "Erreur import monde");
    }
  }
}

initFiles();

// Init on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDragDrop);
} else {
  initDragDrop();
}
