// mcp_config.js
// Gestion de la configuration properties du serveur

const CONFIG_LABELS = {
  motd: "Message d'accueil (MOTD)",
  "server-port": "Port du serveur",
  "max-players": "Nombre max de joueurs",
  "white-list": "Liste blanche activée",
  "online-mode": "Mode en ligne (anti-crack)",
  pvp: "Combat PvP activé",
  difficulty: "Difficulté du jeu",
  gamemode: "Mode de jeu par défaut",
  "allow-nether": "Nether activé",
  "allow-end": "End activé",
  "view-distance": "Distance de vue (chunks)",
  "simulation-distance": "Distance simulation (chunks)",
  "spawn-protection": "Protection du spawn (blocs)",
  "level-seed": "Seed du monde",
  "level-name": "Nom du monde",
  "level-type": "Type de monde",
  "allow-flight": "Vol autorisé (anti-kick)",
  "enforce-whitelist": "Forcer la whitelist",
  "spawn-monsters": "Apparition des monstres",
  "spawn-animals": "Apparition des animaux",
  "spawn-npcs": "Apparition des PNJ",
  hardcore: "Mode Hardcore",
  "enable-command-block": "Blocs de commande activés",
  "generate-structures": "Génération des structures",
  "max-world-size": "Taille max du monde",
  "player-idle-timeout": "Timeout inactivité (min)",
  "op-permission-level": "Niveau permission OP",
  "enable-rcon": "RCON activé",
  "rcon.port": "Port RCON",
  "rcon.password": "Mot de passe RCON",
  "enable-query": "Query activé",
  "query.port": "Port Query",
  "server-ip": "IP du serveur (vide = toutes)",
  "network-compression-threshold": "Seuil compression réseau",
  "max-tick-time": "Temps max par tick (ms)",
  "use-native-transport": "Transport natif Linux",
  "prevent-proxy-connections": "Bloquer les proxys",
  "enable-status": "Statut serveur activé",
  "broadcast-console-to-ops": "Console visible par OPs",
  "broadcast-rcon-to-ops": "RCON visible par OPs",
  "function-permission-level": "Niveau permission fonctions",
  "rate-limit": "Limite de requêtes",
  "sync-chunk-writes": "Écriture chunks synchrone",
  "resource-pack": "URL du resource pack",
  "resource-pack-sha1": "SHA1 du resource pack",
  "require-resource-pack": "Resource pack obligatoire",
  "entity-broadcast-range-percentage": "Portée diffusion entités (%)",
  "force-gamemode": "Forcer le mode de jeu",
  "hide-online-players": "Cacher joueurs en ligne",
};

async function loadConfig() {
  if (!currentServer) return;
  try {
    const response = await apiFetch(`/api/server/${currentServer}/config`);
    const config = await response.json();
    const grid = document.getElementById("config-grid");
    if (!grid) return;

    const sortedEntries = Object.entries(config).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    grid.innerHTML = sortedEntries
      .map(([key, value]) => {
        const label = CONFIG_LABELS[key] || key;
        const inputId = `config-${key.replace(/\./g, "-")}`;
        const isBoolean =
          typeof value === "boolean" || value === "true" || value === "false";
        const isNumber =
          !Number.isNaN(Number(value)) && value !== "" && !isBoolean;

        if (isBoolean) {
          const checked = value === true || value === "true";
          return `
                    <div class="config-item config-toggle">
                        <label class="config-label">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <label class="switch">
                            <input type="checkbox" id="${inputId}" data-key="${key}" ${checked ? "checked" : ""}>
                            <span class="switch-slider"></span>
                        </label>
                    </div>
                `;
        } else if (isNumber) {
          return `
                    <div class="config-item">
                        <label class="config-label" for="${inputId}">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <input type="number" id="${inputId}" class="config-input" value="${escapeHtml(String(value))}" data-key="${key}">
                    </div>
                `;
        } else {
          const isLong = key === "motd" || String(value).length > 50;
          if (isLong) {
            return `
                        <div class="config-item config-wide">
                            <label class="config-label" for="${inputId}">
                                <span class="config-name">${label}</span>
                                <span class="config-key">${key}</span>
                            </label>
                            <textarea id="${inputId}" class="config-textarea" data-key="${key}" rows="2">${escapeHtml(String(value))}</textarea>
                        </div>
                    `;
          }
          return `
                    <div class="config-item">
                        <label class="config-label" for="${inputId}">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <input type="text" id="${inputId}" class="config-input" value="${escapeHtml(String(value))}" data-key="${key}">
                    </div>
                `;
        }
      })
      .join("");
  } catch (error) {
    console.error("Erreur config:", error);
  }
}

async function saveConfig() {
  if (!currentServer) return;
  try {
    const config = {};
    document
      .querySelectorAll("#config-grid input, #config-grid textarea")
      .forEach((el) => {
        const key = el.dataset.key;
        if (el.type === "checkbox") {
          config[key] = el.checked;
        } else {
          config[key] = el.value;
        }
      });

    const response = await apiFetch(`/api/server/${currentServer}/config`, {
      method: "POST",
      body: JSON.stringify(config),
    });
    const result = await response.json();
    if (result.status === "success") {
      if (typeof showToast === "function")
        showToast("success", "Configuration sauvegardée !");
    } else {
      if (typeof showToast === "function")
        showToast("error", result.message || "Erreur sauvegarde");
    }
  } catch (error) {
    console.error("Erreur saveConfig:", error);
  }
}

async function manualUpdateServerConfig() {
  if (!currentServer) return;
  try {
    const meta = {
      mc_version: document.getElementById("server-meta-version")?.value || "",
      server_type:
        document.getElementById("server-meta-type")?.value || "paper",
      loader_version:
        document.getElementById("server-meta-loader")?.value || "",
      forge_version: document.getElementById("server-meta-forge")?.value || "",
    };
    const response = await apiFetch(
      `/api/server/${currentServer}/config/meta`,
      {
        method: "POST",
        body: JSON.stringify(meta),
      },
    );
    const result = await response.json();
    if (result.status === "success") {
      showToast("success", "Configuration meta mise à jour !");
      // Appliquer les changements UI
      if (typeof applyServerConfigContext === "function") {
        applyServerConfigContext(currentServer, meta, true);
      }
    } else {
      showToast("error", result.message || "Erreur mise à jour");
    }
  } catch (error) {
    console.error("Erreur manualUpdateServerConfig:", error);
    showToast("error", "Erreur lors de la mise à jour");
  }
}

function initConfig() {
  globalThis.loadConfig = loadConfig;
  globalThis.saveConfig = saveConfig;
  globalThis.loadServerProperties = loadConfig;
  globalThis.saveServerProperties = saveConfig;
  globalThis.manualUpdateServerConfig = manualUpdateServerConfig;
  globalThis._mcp_loadConfig = loadConfig;
  globalThis._mcp_saveConfig = saveConfig;
}

try {
  initConfig();
} catch (e) {
  console.warn("initConfig failed", e);
}
