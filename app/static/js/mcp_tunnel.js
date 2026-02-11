// mcp_tunnel.js
// Gestion avancée des tunnels avec polling, providers et UI unifiée

let availableProviders = [];
let selectedProvider = "localhost.run";
let tunnelPolling = null;
let tunnelRetryCount = 0;
const TUNNEL_POLL_INTERVAL = 3000;
const TUNNEL_MAX_RETRIES = 15;

// Charger les providers disponibles
async function loadTunnelProviders() {
  try {
    const resp = await apiFetch("/api/tunnel/providers");
    if (resp.ok) {
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await resp.json();
        availableProviders = data.providers || [];
      }
    }
  } catch (e) {
    console.warn("Erreur chargement providers, utilisation défauts", e);
    availableProviders = [
      {
        id: "localhost.run",
        name: "localhost.run",
        description: "SSH, gratuit",
        status: "recommended",
      },
      {
        id: "serveo",
        name: "Serveo",
        description: "SSH, gratuit",
        status: "available",
      },
      {
        id: "bore",
        name: "Bore",
        description: "TCP léger",
        status: "available",
      },
      {
        id: "manual",
        name: "Port Manuel",
        description: "Redirection manuelle",
        status: "available",
      },
    ];
  }
}

async function startTunnel(provider = null) {
  const btn =
    document.getElementById("btn-tunnel") ||
    document.getElementById("btn-playit");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Démarrage...';
  }

  tunnelRetryCount = 0;
  const useProvider = provider || selectedProvider;

  try {
    showTunnelLoading(`Lancement de ${useProvider}...`);

    const resp = await apiFetch("/api/tunnel/start", {
      method: "POST",
      body: JSON.stringify({ port: 25565, provider: useProvider }),
    });

    if (resp.status === 401) {
      showToast("error", "Session expirée, reconnectez-vous");
      globalThis.location.href = "/login";
      return;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await resp.text();
      console.error("Réponse non-JSON:", text.substring(0, 200));
      throw new Error("Le serveur a renvoyé une réponse invalide.");
    }

    const data = await resp.json();

    if (data.status === "success" || data.status === "starting") {
      showToast("info", "Tunnel en cours de démarrage...");
      startTunnelPolling();
    } else if (data.status === "error") {
      showTunnelError(data.message || "Erreur inconnue");
    } else if (data.instructions) {
      showTunnelManual(data);
    } else {
      startTunnelPolling();
    }
  } catch (e) {
    console.error("Tunnel error:", e);
    showToast("error", "Erreur: " + e.message);
    showTunnelError("Impossible de démarrer: " + e.message);
  } finally {
    updateTunnelButton();
  }
}

async function stopTunnel() {
  const modalBtn =
    document.querySelector("#tunnel-modal .btn-danger") ||
    document.querySelector("[onclick='stopTunnel()']");
  if (modalBtn) {
    modalBtn.disabled = true;
    modalBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Arrêt...';
  }

  try {
    const resp = await apiFetch("/api/tunnel/stop", { method: "POST" });
    if (resp.ok) {
      showToast("success", "Tunnel arrêté");
    }
    stopTunnelPolling();

    // UI Reset
    const addressBox = document.getElementById("tunnel-address-box");
    if (addressBox) addressBox.style.display = "none";

    const statusEl = document.getElementById("tunnel-status");
    if (statusEl) {
      statusEl.className = "tunnel-status ready";
      statusEl.innerHTML = `
            <div class="tunnel-status-icon"><i class="fas fa-globe"></i></div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Prêt à partager</span>
                <span class="tunnel-provider-name">Sélectionnez un provider</span>
            </div>
        `;
    }
  } catch (e) {
    showToast("error", "Erreur lors de l'arrêt: " + e.message);
  } finally {
    updateTunnelButton(false);
    if (modalBtn) {
      modalBtn.disabled = false;
      modalBtn.innerHTML = '<i class="fas fa-stop"></i> Arrêter le tunnel';
    }
  }
}

function startTunnelPolling() {
  stopTunnelPolling();
  tunnelPolling = setInterval(checkTunnelStatus, TUNNEL_POLL_INTERVAL);
  setTimeout(checkTunnelStatus, 500);
}

function stopTunnelPolling() {
  if (tunnelPolling) {
    clearInterval(tunnelPolling);
    tunnelPolling = null;
  }
  tunnelRetryCount = 0;
}

async function checkTunnelStatus() {
  try {
    const resp = await apiFetch("/api/tunnel/status");
    if (!resp.ok) {
      tunnelRetryCount++;
      if (tunnelRetryCount >= TUNNEL_MAX_RETRIES) {
        stopTunnelPolling();
        showTunnelError("Timeout: impossible de récupérer le statut");
      }
      return;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      tunnelRetryCount++;
      return;
    }

    const data = await resp.json();
    tunnelRetryCount = 0;

    if ((data.status === "running" || data.active) && data.address) {
      showTunnelAddress(data.address, data.provider);
      updateTunnelButton(true);
    } else if (data.status === "connecting" || data.status === "starting") {
      showTunnelLoading("Connexion en cours...");
    } else if (
      data.status === "stopped" ||
      data.status === "inactive" ||
      !data.active
    ) {
      // Stopped logic
    } else if (data.status === "error") {
      showTunnelError(data.error || data.message || "Erreur du tunnel");
      stopTunnelPolling();
    }
  } catch (e) {
    tunnelRetryCount++;
    if (tunnelRetryCount >= TUNNEL_MAX_RETRIES) {
      stopTunnelPolling();
      showTunnelError("Connexion au service de tunnel perdue");
    }
  }
}

async function updateTunnelButton(runningState) {
  let running = runningState;
  if (running === undefined) {
    try {
      const resp = await apiFetch("/api/tunnel/status");
      const data = await resp.json();
      running = data.running || data.active || false;
    } catch (e) {
      running = false;
    }
  }

  const btn =
    document.getElementById("btn-tunnel") ||
    document.getElementById("btn-status-tunnel");
  if (!btn) return;

  btn.disabled = false;
  if (running) {
    btn.innerHTML = '<i class="fas fa-globe"></i> Tunnel Actif';
    btn.classList.add("active");
    btn.onclick = () => showTunnelModal();
  } else {
    btn.innerHTML = '<i class="fas fa-share-alt"></i> Partager Serveur';
    btn.classList.remove("active");
    btn.onclick = () => showTunnelModal();
  }

  // Dashboard mini status update
  const bar = document.getElementById("tunnel-status-bar");
  if (bar) bar.style.display = running ? "flex" : "none";
}

function showTunnelModal() {
  const modal = document.getElementById("tunnel-modal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("show");
  checkTunnelStatus();
}

function closeTunnelModal() {
  const modal = document.getElementById("tunnel-modal");
  if (modal) {
    modal.classList.remove("show");
    setTimeout(() => (modal.style.display = "none"), 300);
  }
}

function showTunnelLoading(message) {
  const statusEl = document.getElementById("tunnel-status");
  if (statusEl) {
    statusEl.className = "tunnel-status loading";
    statusEl.innerHTML = `
      <div class="tunnel-status-icon"><i class="fas fa-circle-notch fa-spin"></i></div>
      <div class="tunnel-status-info">
        <span class="tunnel-status-text">${message}</span>
        <span class="tunnel-provider-name">Initialisation...</span>
      </div>
    `;
  }
}

function showTunnelError(message) {
  const statusEl = document.getElementById("tunnel-status");
  if (statusEl) {
    statusEl.className = "tunnel-status error";
    statusEl.innerHTML = `
      <div class="tunnel-status-icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="tunnel-status-info">
        <span class="tunnel-status-text">Erreur</span>
        <span class="tunnel-provider-name">${message}</span>
      </div>
    `;
  }
  showToast("error", message);
}

function showTunnelAddress(address, provider) {
  const statusEl = document.getElementById("tunnel-status");
  const addressBox = document.getElementById("tunnel-address-box");
  const tunnelAddress = document.getElementById("tunnel-address");

  if (addressBox) addressBox.style.display = "block";
  if (tunnelAddress) tunnelAddress.value = address;

  if (statusEl) {
    statusEl.className = "tunnel-status active";
    statusEl.innerHTML = `
      <div class="tunnel-status-icon"><i class="fas fa-check-circle" style="color:#2ecc71"></i></div>
      <div class="tunnel-status-info">
        <span class="tunnel-status-text">Tunnel Actif !</span>
        <span class="tunnel-provider-name">${provider || "Service actif"}</span>
      </div>
    `;
  }

  const miniAddr = document.getElementById("tunnel-address-display");
  if (miniAddr) miniAddr.textContent = address;
}

function showTunnelManual(data) {
  const statusEl = document.getElementById("tunnel-status");
  if (statusEl) {
    statusEl.className = "tunnel-status manual";
    statusEl.innerHTML = `
      <div class="tunnel-status-icon"><i class="fas fa-cog"></i></div>
      <div class="tunnel-status-info">
        <span class="tunnel-status-text">Configuration Manuelle</span>
        <span class="tunnel-provider-name">${data.message || "Port forwarding"}</span>
      </div>
    `;
  }
}

// Affiche/masque le panneau de configuration manuelle
function showManualTunnel() {
  const manualConfig = document.getElementById("manual-tunnel-config");
  if (manualConfig) {
    const isHidden =
      manualConfig.style.display === "none" || !manualConfig.style.display;
    manualConfig.style.display = isHidden ? "block" : "none";
    if (!isHidden) {
      // Si on cache, s'assurer que l'UI est propre
      manualConfig.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

// Applique l'adresse manuelle fournie par l'utilisateur
function setManualTunnel() {
  const address = document.getElementById("manual-address")?.value?.trim();
  if (!address) {
    showToast("error", "Entrez une adresse");
    return;
  }

  // Afficher l'adresse manuelle
  const addressBox = document.getElementById("tunnel-address-box");
  const tunnelAddress = document.getElementById("tunnel-address");
  const actionsEl = document.getElementById("tunnel-actions");
  const statusEl = document.getElementById("tunnel-status");

  if (tunnelAddress) tunnelAddress.value = address;
  if (addressBox) addressBox.style.display = "block";
  if (actionsEl) actionsEl.style.display = "flex";

  if (statusEl) {
    statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-check-circle" style="color: var(--success-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Configuration manuelle</span>
                <span class="tunnel-provider-name">Port forwarding</span>
            </div>
        `;
    statusEl.className = "tunnel-status active";
  }

  const manualConfig = document.getElementById("manual-tunnel-config");
  if (manualConfig) manualConfig.style.display = "none";
  showToast("success", "Adresse configurée !");
}

function copyTunnelAddress() {
  const addr = document.getElementById("tunnel-address");
  const text = addr
    ? addr.value || addr.textContent
    : document.getElementById("tunnel-address-display")?.textContent;
  if (text && text !== "-") {
    navigator.clipboard.writeText(text).then(() => {
      showToast("success", "Adresse copiée !");
    });
  }
}

// Alias pour compatibilité avec le HTML
function openTunnelModal() {
  showTunnelModal(true);
}

function initTunnel() {
  globalThis.openTunnelModal = openTunnelModal;
  globalThis.closeTunnelModal = closeTunnelModal;
  globalThis.startTunnel = startTunnel;
  globalThis.stopTunnel = stopTunnel;
  globalThis.copyTunnelAddress = copyTunnelAddress;
  globalThis.loadTunnelProviders = loadTunnelProviders;
  globalThis.checkTunnelStatus = checkTunnelStatus;

  // Manual tunnel helpers
  globalThis.showManualTunnel = showManualTunnel;
  globalThis.setManualTunnel = setManualTunnel;

  // Backwards compatibility alias
  globalThis.showTunnelModal = showTunnelModal;

  loadTunnelProviders();
  updateTunnelButton();
}

initTunnel();
