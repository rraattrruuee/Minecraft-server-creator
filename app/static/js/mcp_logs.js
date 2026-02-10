// mcp_logs.js
// Recherche et export des logs

const searchLogsArray = (query, caseSensitive = false) => {
  const regex = new RegExp(query, caseSensitive ? "g" : "gi");
  return allLogs
    .map((line, i) => ({ line, index: i }))
    .filter((l) => regex.test(l.line));
};

function downloadFile(filename) {
  const path = currentFilePath ? `${currentFilePath}/${filename}` : filename;
  globalThis.location.href = `/api/server/${currentServer}/files/download?path=${encodeURIComponent(path)}`;
}

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

function initLogs() {
  globalThis.searchLogsArray = searchLogsArray;
  globalThis.downloadFile = downloadFile;
  globalThis.searchLogsRemote = searchLogsRemote;
  globalThis.searchLogs = searchLogs;
  globalThis._mcp_searchLogs = searchLogs;
}
