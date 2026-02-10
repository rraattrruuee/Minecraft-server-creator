// mcp_server_management.js
// Gestion des opérations sur les serveurs (create/start/stop/backup/restore)

async function createServer(event) {
  if (typeof globalThis._mcp_createServer === "function")
    return globalThis._mcp_createServer(event);
  console.warn("createServer moved to mcp_server_management");
}

async function saveServerMetaFromUI() {
  if (typeof globalThis._mcp_saveServerMetaFromUI === "function")
    return globalThis._mcp_saveServerMetaFromUI();
  console.warn("saveServerMetaFromUI moved to mcp_server_management");
}

function initServerManagement() {
  globalThis.createServer = createServer;
  globalThis.saveServerMetaFromUI = saveServerMetaFromUI;
  globalThis._mcp_createServer = createServer;
  globalThis._mcp_saveServerMetaFromUI = saveServerMetaFromUI;
}
