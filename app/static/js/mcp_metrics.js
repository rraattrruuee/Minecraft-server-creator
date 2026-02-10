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
const metricsHistoryLimit = globalThis.metricsHistoryLimit;

function stopMetricsPolling() {
  if (globalThis.metricsInterval) clearInterval(globalThis.metricsInterval);
  globalThis.metricsInterval = null;
}

function startMetricsPolling() {
  loadSystemMetrics();
  loadMetricsHistory(metricsHistoryLimit);
  globalThis.metricsInterval = setInterval(
    loadSystemMetrics,
    performanceSettings.refreshRate,
  );
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
      const ctx = document.getElementById("metrics-chart");
      if (!ctx) return;
      // create a lightweight chart if Chart isn't available
      if (typeof Chart === "undefined") return;
      globalThis.mainChart = new Chart(ctx.getContext("2d"), {
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

function initMetrics() {
  globalThis.startMetricsPolling = startMetricsPolling;
  globalThis.stopMetricsPolling = stopMetricsPolling;
  globalThis.loadMetricsHistory = loadMetricsHistory;
  globalThis.updateMainChart = updateMainChart;
  globalThis._mcp_startMetricsPolling = startMetricsPolling;
}
