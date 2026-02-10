// mcp_console.js
// Console/log stream management
// Use existing globals (defined in app_pro.js) to avoid duplicate declarations
globalThis.logInterval = globalThis.logInterval || null;
globalThis.autoScroll =
  typeof globalThis.autoScroll === "undefined" ? true : globalThis.autoScroll;
globalThis.logFilter = globalThis.logFilter || "all";
globalThis.allLogs = globalThis.allLogs || [];

function startLogStream() {
  stopLogStream();
  loadLogs();
  globalThis.logInterval = setInterval(loadLogs, 5000);
}

function stopLogStream() {
  if (globalThis.logInterval) {
    clearInterval(globalThis.logInterval);
    globalThis.logInterval = null;
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
    let filteredLogs = (globalThis.allLogs || []).filter((line) => {
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

    logsDiv.innerHTML = filteredLogs
      .map((l) => `<div class="log-line">${escapeHtml(l)}</div>`)
      .join("");
    if (globalThis.autoScroll) logsDiv.scrollTop = logsDiv.scrollHeight;
  });
}

function setLogFilter(filter) {
  logFilter = filter;
  renderLogs();
}

function initConsole() {
  globalThis._mcp_startLogStream = startLogStream;
  globalThis._mcp_stopLogStream = stopLogStream;
  globalThis._mcp_loadLogs = loadLogs;
  globalThis._mcp_renderLogs = renderLogs;
  globalThis._mcp_setLogFilter = setLogFilter;

  if (typeof globalThis.startLogStream !== "function")
    globalThis.startLogStream = startLogStream;
  if (typeof globalThis.stopLogStream !== "function")
    globalThis.stopLogStream = stopLogStream;
  if (typeof globalThis.loadLogs !== "function") globalThis.loadLogs = loadLogs;
  if (typeof globalThis.renderLogs !== "function")
    globalThis.renderLogs = renderLogs;
  if (typeof globalThis.setLogFilter !== "function")
    globalThis.setLogFilter = setLogFilter;
}

try {
  initConsole();
} catch (e) {
  console.warn("initConsole failed", e);
}
