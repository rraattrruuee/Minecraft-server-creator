// mcp_players.js
// Gestion des joueurs (liste, kick, ban, op, etc.)

let onlinePlayersCache = [];
let cachedPlayers = {};

function isPlayerOnline(name) {
  if (!name) return false;
  return onlinePlayersCache.includes(name.toLowerCase());
}

async function loadPlayers() {
  if (!currentServer) return;
  try {
    let onlinePlayers = [];
    try {
      const onlineResp = await apiFetch(
        `/api/server/${currentServer}/online-players`,
      );
      if (onlineResp.ok) {
        const data = await onlineResp.json();
        onlinePlayers = data.players || [];
      }
    } catch (e) {
      console.warn("Impossible de récupérer les joueurs en ligne:", e);
    }
    onlinePlayersCache = onlinePlayers.map((p) =>
      typeof p === "string" ? p.toLowerCase() : p.name.toLowerCase(),
    );

    const response = await apiFetch(`/api/server/${currentServer}/players`);
    const allPlayers = await response.json();
    const grid = document.getElementById("players-grid");
    if (!grid) return;

    updatePlayerTabCount(
      onlinePlayers.length,
      allPlayers ? allPlayers.length : 0,
    );

    if (!allPlayers || allPlayers.length === 0) {
      grid.innerHTML =
        '<div class="empty-state"><i class="fas fa-users"></i><p>Aucun joueur</p></div>';
      return;
    }

    const sortedPlayers = [...allPlayers].sort((a, b) => {
      const aOnline = isPlayerOnline(a.name);
      const bOnline = isPlayerOnline(b.name);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    grid.innerHTML = sortedPlayers
      .map((player) => {
        const isOnline = isPlayerOnline(player.name);
        const statusClass = isOnline ? "online" : "offline";
        const statusIcon = isOnline ? "circle" : "circle";
        const statusColor = isOnline ? "#4CAF50" : "#666";
        const statusText = isOnline ? "En ligne" : "Hors ligne";

        return `
            <div class="player-card ${statusClass}" onclick="openPlayerModal('${player.name}', '${player.uuid}')" style="cursor:pointer">
                <div class="player-status-indicator" style="background:${statusColor}" title="${statusText}"></div>
                <img src="https://mc-heads.net/avatar/${player.name}/48" 
                     alt="${player.name}" 
                     class="player-avatar"
                     loading="lazy"
                     onerror="this.src='https://mc-heads.net/avatar/MHF_Steve/48'">
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-status ${statusClass}">
                        <i class="fas fa-${statusIcon}" style="color:${statusColor}"></i> ${statusText}
                    </span>
                </div>
                <div class="player-actions">
                    ${
                      isOnline
                        ? `
                        <button onclick="event.stopPropagation(); sendWhisperToPlayer('${player.name}')" title="Message" class="btn-small btn-success">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button onclick="event.stopPropagation(); playerAction('${player.name}', 'kick')" title="Kick" class="btn-small btn-warning">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    `
                        : ""
                    }
                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'op')" title="OP" class="btn-small">
                        <i class="fas fa-crown"></i>
                    </button>
                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'ban')" title="Ban" class="btn-small btn-danger">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
            `;
      })
      .join("");
  } catch (error) {
    console.error("Erreur joueurs:", error);
    sessionStats.errors++;

    const grid = document.getElementById("players-grid");
    if (grid) {
      grid.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erreur de chargement des joueurs</p>
                    <button onclick="loadPlayers()" class="btn-retry">
                        <i class="fas fa-sync"></i> Réessayer
                    </button>
                </div>
            `;
    }
  }
}

async function playerAction(name, action) {
  if (!currentServer || !name) return;
  if (action === "ban" && !confirm(`Bannir ${name} ?`)) return;

  try {
    const res = await apiFetch(`/api/server/${currentServer}/command`, {
      method: "POST",
      body: JSON.stringify({ command: `${action} ${name}` }),
    });
    const result = await res.json();
    if (result.status === "success") {
      showToast("success", `Action ${action} effectuée pour ${name}`);
      setTimeout(loadPlayers, 1000);
    }
  } catch (e) {
    showToast("error", "Erreur action joueur");
  }
}

function updatePlayerTabCount(online, total) {
  const tab = document.querySelector('.tab[data-view="players"]');
  if (tab) {
    let badge = tab.querySelector(".badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      tab.appendChild(badge);
    }
    badge.textContent = online;
    badge.style.display = online > 0 ? "inline-block" : "none";
  }
}

function initPlayers() {
  globalThis.loadPlayers = loadPlayers;
  globalThis.playerAction = playerAction;
  globalThis._mcp_loadPlayers = loadPlayers;
}

try {
  initPlayers();
} catch (e) {
  console.warn("initPlayers failed", e);
}
