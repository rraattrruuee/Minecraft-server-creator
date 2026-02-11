// mcp_console.js - Console and Logs
let logPollingInterval = null;
let currentLogFilter = "all";

async function startLogStream() {
    if (logPollingInterval) return;
    loadLogs();
    logPollingInterval = setInterval(loadLogs, 2000);
}

function stopLogStream() {
    if (logPollingInterval) {
        clearInterval(logPollingInterval);
        logPollingInterval = null;
    }
}

async function loadLogs() {
    if (!currentServer) return;
    try {
        const res = await apiFetch(`/api/server/${currentServer}/logs?filter=${currentLogFilter}`);
        const data = await res.json();
        renderLogs(data.logs || []);
    } catch (e) {
        console.warn("loadLogs failed", e);
    }
}

function renderLogs(logs) {
    const container = document.getElementById("console-output");
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    
    container.innerHTML = logs.map(line => `<div class="log-line">${escapeHtml(line)}</div>`).join("");
    
    if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

function setLogFilter(filter) {
    currentLogFilter = filter;
    document.querySelectorAll(".log-filter-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.filter === filter);
    });
    loadLogs();
}

function filterLogs(filter) {
    setLogFilter(filter);
}

async function sendCommand() {
    const input = document.getElementById("console-input");
    if (!input || !input.value.trim() || !currentServer) return;
    const command = input.value.trim();
    input.value = "";
    
    try {
        await apiFetch(`/api/server/${currentServer}/command`, {
            method: "POST",
            body: JSON.stringify({ command })
        });
        loadLogs();
    } catch (e) {
        showToast("error", "Erreur envoi commande");
    }
}

function initConsole() {
    globalThis.startLogStream = startLogStream;
    globalThis.stopLogStream = stopLogStream;
    globalThis.loadLogs = loadLogs;
    globalThis.renderLogs = renderLogs;
    globalThis.setLogFilter = setLogFilter;
    globalThis.filterLogs = filterLogs;
    globalThis.sendCommand = sendCommand;
}

initConsole();
