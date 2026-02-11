// mcp_metrics.js
// Gestion des metrics: polling et historique
// Use globalThis to avoid redeclaring globals that may live in app_pro.js
globalThis.mainChart =
  typeof globalThis.mainChart !== "undefined" ? globalThis.mainChart : null;
globalThis.metricsHistory = globalThis.metricsHistory || {
  cpu: [],
  ram: [],
  timestamps: [],
};
globalThis.metricsInterval =
  typeof globalThis.metricsInterval !== "undefined"
    ? globalThis.metricsInterval
    : null;
globalThis.metricsHistoryLimit = globalThis.metricsHistoryLimit || 300;
let metricsHistoryLimit = globalThis.metricsHistoryLimit;
let lastMetricsUpdate = 0;

async function loadSystemMetrics() {
  const now = Date.now();
  if (now - lastMetricsUpdate < 2000) return;
  lastMetricsUpdate = now;

  try {
    const response = await apiFetch("/api/metrics/system");
    const data = await response.json();

    const cpuPercent = data.cpu?.percent || 0;
    const ramUsed = data.memory?.used_gb || 0;
    const ramTotal = data.memory?.total_gb || 0;
    const ramPercent = data.memory?.percent || 0;
    const diskUsed = data.disk?.used_gb || 0;
    const diskTotal = data.disk?.total_gb || 0;
    const diskPercent = data.disk?.percent || 0;

    if (typeof updateElement === "function") {
      updateElement("dash-cpu", cpuPercent.toFixed(1) + "%");
      updateElement(
        "dash-ram",
        `${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GB`,
      );
      updateElement(
        "dash-disk",
        `${diskUsed.toFixed(0)} / ${diskTotal.toFixed(0)} GB`,
      );
      updateElement("mini-cpu", cpuPercent.toFixed(0) + "%");
      updateElement("mini-ram", ramPercent.toFixed(0) + "%");
      updateElement("mini-disk", diskPercent.toFixed(0) + "%");
    }

    const diskProgress = document.getElementById("disk-progress");
    if (diskProgress) diskProgress.style.width = diskPercent + "%";

    const time = new Date().toLocaleTimeString();
    metricsHistory.cpu.push(cpuPercent);
    metricsHistory.ram.push(ramPercent);
    metricsHistory.timestamps.push(time);

    if (metricsHistory.cpu.length > metricsHistoryLimit) {
      metricsHistory.cpu.shift();
      metricsHistory.ram.shift();
      metricsHistory.timestamps.shift();
    }
    updateMainChart();
  } catch (error) {
    console.warn("loadSystemMetrics failed", error);
  }
}

function stopMetricsPolling() {
  if (globalThis.metricsInterval) clearInterval(globalThis.metricsInterval);
  globalThis.metricsInterval = null;
}

function startMetricsPolling() {
  loadSystemMetrics();
  loadMetricsHistory(metricsHistoryLimit);
  const refreshRate =
    (globalThis.performanceSettings &&
      globalThis.performanceSettings.refreshRate) ||
    5000;
  globalThis.metricsInterval = setInterval(loadSystemMetrics, refreshRate);
}

async function loadMetricsHistory(limit = metricsHistoryLimit) {
  try {
    const res = await apiFetch(
      `/api/metrics/history?limit=${encodeURIComponent(limit)}`,
    );
    const payload = await res.json();
    const history = (payload && (payload.data || payload.history)) || [];
    if (Array.isArray(history)) {
      metricsHistory.timestamps = [];
      metricsHistory.cpu = [];
      metricsHistory.ram = [];
      history.forEach((point) => {
        const time = point.timestamp
          ? new Date(point.timestamp).toLocaleTimeString()
          : new Date().toLocaleTimeString();
        metricsHistory.timestamps.push(time);
        metricsHistory.cpu.push(typeof point.cpu === "number" ? point.cpu : 0);
        metricsHistory.ram.push(
          typeof point.ram_percent === "number"
            ? point.ram_percent
            : typeof point.ram === "number"
              ? point.ram
              : 0,
        );
      });
      updateMainChart();
    }
  } catch (e) {
    console.error("Failed to load metrics history", e);
  }
}

function updateMainChart() {
  try {
    if (!globalThis.mainChart) {
      // Prefer the dashboard canvas id 'main-chart', fallback to 'metrics-chart'
      const canvas =
        document.getElementById("main-chart") ||
        document.getElementById("metrics-chart");
      if (!canvas) return;
      // create a lightweight chart if Chart isn't available
      if (typeof Chart === "undefined") return;
      globalThis.mainChart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
          labels: globalThis.metricsHistory.timestamps,
          datasets: [
            {
              label: "CPU %",
              data: globalThis.metricsHistory.cpu,
              borderColor: "#4caf50",
              fill: false,
            },
            {
              label: "RAM %",
              data: globalThis.metricsHistory.ram,
              borderColor: "#2196f3",
              fill: false,
            },
          ],
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
        },
      });
    } else {
      globalThis.mainChart.data.labels = globalThis.metricsHistory.timestamps;
      globalThis.mainChart.data.datasets[0].data =
        globalThis.metricsHistory.cpu;
      globalThis.mainChart.data.datasets[1].data =
        globalThis.metricsHistory.ram;
      globalThis.mainChart.update();
    }
  } catch (e) {
    console.warn("updateMainChart failed", e);
  }
}

async function refreshServerStats() {
  if (!window.currentServer) {
    if (typeof showToast === "function")
      showToast("warning", "Aucun serveur sélectionné");
    return;
  }
  try {
    if (typeof showToast === "function")
      showToast("info", "Actualisation des statistiques...");
    const response = await apiFetch(
      `/api/server/${window.currentServer}/stats`,
    );
    const stats = await response.json();

    const statUptime = document.getElementById("stat-uptime");
    if (statUptime) statUptime.textContent = stats.uptime || "--";

    const statTotalPlayers = document.getElementById("stat-total-players");
    if (statTotalPlayers)
      statTotalPlayers.textContent = `${stats.players_online || 0}/${stats.max_players || 20}`;

    const statWorldSize = document.getElementById("stat-world-size");
    if (statWorldSize) statWorldSize.textContent = stats.disk_usage || "--";

    const statPluginsCount = document.getElementById("stat-plugins-count");
    if (statPluginsCount)
      statPluginsCount.textContent = stats.plugin_count || 0;

    const consoleCpu = document.getElementById("stat-cpu");
    if (consoleCpu)
      consoleCpu.textContent = stats.cpu ? `${stats.cpu.toFixed(1)}%` : "0%";

    const consoleRam = document.getElementById("stat-ram");
    if (consoleRam)
      consoleRam.textContent = stats.ram_mb ? `${stats.ram_mb} MB` : "0 MB";

    // Update charts with history
    try {
      const histRes = await apiFetch(
        `/api/metrics/server/${window.currentServer}?limit=24`,
      );
      const histData = await histRes.json();
      if (histData.status === "success" && histData.data) {
        if (typeof updateStatsCharts === "function")
          updateStatsCharts(histData.data);
      }
    } catch (e) {
      console.warn("Could not load server history for stats tab charts", e);
    }
  } catch (error) {
    console.error("Erreur refreshServerStats:", error);
  }
}

function initMetrics() {
  globalThis.loadSystemMetrics = loadSystemMetrics;
  globalThis.startMetricsPolling = startMetricsPolling;
  globalThis.stopMetricsPolling = stopMetricsPolling;
  globalThis.loadMetricsHistory = loadMetricsHistory;
  globalThis.updateMainChart = updateMainChart;
  globalThis.refreshServerStats = refreshServerStats;
  globalThis.updateStatsCharts = updateStatsCharts;
  globalThis._mcp_startMetricsPolling = startMetricsPolling;

  // Auto-start polling
  startMetricsPolling();
}
let performanceChart = null;
let playersChart = null;

function updateStatsCharts(history) {
  if (!Array.isArray(history)) return;
  const labels = history.map((p) => {
    const d = new Date(p.timestamp);
    return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  });
  const cpuData = history.map((p) => p.cpu || 0);
  const ramData = history.map((p) => p.ram_percent || 0);
  const playersData = history.map((p) => p.players || 0);

  const perfCanvas = document.getElementById("performance-chart");
  if (perfCanvas) {
    if (!performanceChart) {
      performanceChart = new Chart(perfCanvas.getContext("2d"), {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "CPU %",
              data: cpuData,
              borderColor: "#58a6ff",
              tension: 0.4,
              fill: true,
              backgroundColor: "rgba(88, 166, 255, 0.1)",
            },
            {
              label: "RAM %",
              data: ramData,
              borderColor: "#3fb950",
              tension: 0.4,
              fill: true,
              backgroundColor: "rgba(63, 185, 80, 0.1)",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { min: 0, max: 100 } },
        },
      });
    } else {
      performanceChart.data.labels = labels;
      performanceChart.data.datasets[0].data = cpuData;
      performanceChart.data.datasets[1].data = ramData;
      performanceChart.update();
    }
  }

  const playersCanvas = document.getElementById("players-chart");
  if (playersCanvas) {
    if (!playersChart) {
      playersChart = new Chart(playersCanvas.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Joueurs",
              data: playersData,
              backgroundColor: "rgba(88, 166, 255, 0.6)",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        },
      });
    } else {
      playersChart.data.labels = labels;
      playersChart.data.datasets[0].data = playersData;
      playersChart.update();
    }
  }
}
