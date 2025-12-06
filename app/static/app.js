let current = null;
let logInt = null;
let statusInt = null;
let selectedP = null;
let selectedPUuid = null;

// --- DICTIONNAIRE FRANCAIS ---
const CONFIG_FR = {
  motd: "Message de bienvenue (MOTD)",
  "server-port": "Port du serveur (defaut: 25565)",
  "max-players": "Nombre maximum de joueurs",
  "white-list": "Activer la Liste Blanche (Whitelist)",
  "online-mode": "Mode Officiel (true) / Cracke (false)",
  pvp: "Combat entre joueurs (PVP)",
  difficulty: "Difficulte (peaceful, easy, normal, hard)",
  gamemode: "Mode de jeu par defaut (survival, creative)",
  "allow-nether": "Autoriser le Nether",
  "view-distance": "Distance de vue (chunks)",
  "spawn-protection": "Protection du spawn (blocs)",
  "level-seed": "Graine de la map (Seed)",
  "allow-flight": "Autoriser le vol (Anti-Kick)",
  "enforce-whitelist": "Forcer la whitelist (Kick si pas dedans)",
};

window.onload = () => {
  loadList();
  loadVer();
};

// INIT
async function loadList() {
  try {
    let l = await (await fetch("/api/servers")).json();
    document.getElementById("srv-list").innerHTML = l
      .map((s) => `<div class="srv-item" onclick="sel('${s}',this)">${s}</div>`)
      .join("");
  } catch (e) {
    console.error("Erreur chargement serveurs:", e);
  }
}

async function loadVer() {
  try {
    let v = await (await fetch("/api/papermc/versions")).json();
    document.getElementById("new-ver").innerHTML = v
      .map((x) => `<option>${x}</option>`)
      .join("");
  } catch (e) {
    console.error("Erreur chargement versions:", e);
  }
}

function sel(n, el) {
  current = n;
  document
    .querySelectorAll(".srv-item")
    .forEach((e) => e.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("welcome").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  document.getElementById("srv-title").innerText = n;
  updateSt();
  startStatusPolling();
  nav("console");
}

function nav(v) {
  document
    .querySelectorAll(".view")
    .forEach((e) => e.classList.remove("active"));
  document
    .querySelectorAll(".tab")
    .forEach((e) => e.classList.remove("active"));
  document.getElementById("view-" + v).classList.add("active");
  if (event && event.target) event.target.classList.add("active");

  if (v === "console") startLog();
  else stopLog();
  if (v === "players") loadP();
  if (v === "config") loadC();
  if (v === "plugins") loadPlugins();
  if (v === "settings") loadSettings();
}

// STATUS POLLING avec metriques
function startStatusPolling() {
  stopStatusPolling();
  statusInt = setInterval(updateSt, 3000);
}

function stopStatusPolling() {
  if (statusInt) clearInterval(statusInt);
}

async function updateSt() {
  if (!current) return;
  try {
    let s = await (await fetch(`/api/server/${current}/status`)).json();
    let b = document.getElementById("badge");
    
    // Statut avec point animé
    b.className = "badge " + s.status;
    if (s.status === "online") {
      b.innerHTML = '<span class="status-dot pulse"></span> EN LIGNE';
      // Activer/désactiver les boutons
      document.getElementById("btn-start").disabled = true;
      document.getElementById("btn-restart").disabled = false;
      document.getElementById("btn-stop").disabled = false;
    } else {
      b.innerHTML = '<span class="status-dot"></span> HORS LIGNE';
      document.getElementById("btn-start").disabled = false;
      document.getElementById("btn-restart").disabled = true;
      document.getElementById("btn-stop").disabled = true;
    }
    
    // Afficher les metriques si online
    let metrics = document.getElementById("metrics");
    if (s.status === "online" && s.cpu !== undefined) {
      metrics.innerHTML = `
        <span class="metric">
          <i class="fa-solid fa-microchip"></i> CPU: ${s.cpu}%
        </span> 
        <span class="metric">
          <i class="fa-solid fa-memory"></i> RAM: ${s.ram_mb} MB
        </span>`;
    } else {
      metrics.innerHTML = "";
    }
  } catch (e) {
    console.error("Erreur status:", e);
  }
}

async function act(a) {
  try {
    await fetch(`/api/server/${current}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a }),
    });
    setTimeout(updateSt, 2000);
  } catch (e) {
    alert("Erreur: " + e.message);
  }
}

async function deleteSrv() {
  if (confirm("Supprimer ce serveur ? Cette action est irreversible.")) {
    try {
      await fetch(`/api/server/${current}/delete`, { method: "DELETE" });
      location.reload();
    } catch (e) {
      alert("Erreur suppression: " + e.message);
    }
  }
}

async function backupSrv() {
  if (confirm("Creer une sauvegarde du serveur ?")) {
    try {
      let r = await fetch(`/api/server/${current}/backup`, { method: "POST" });
      let j = await r.json();
      if (j.success) {
        alert("Sauvegarde creee: " + j.name);
      } else {
        alert("Erreur: " + j.message);
      }
    } catch (e) {
      alert("Erreur backup: " + e.message);
    }
  }
}

// LOGS
function startLog() {
  stopLog();
  fetchLog();
  logInt = setInterval(fetchLog, 2000);
}

function stopLog() {
  if (logInt) clearInterval(logInt);
}

async function fetchLog() {
  try {
    let r = await (await fetch(`/api/server/${current}/console`)).json();
    let html = r.logs
      .map((l) => {
        let c = "log-info";
        if (l.includes("ERROR") || l.includes("Exception") || l.includes("SEVERE")) c = "log-err";
        else if (l.includes("WARN")) c = "log-warn";
        return `<div class="${c}">${escapeHtml(l)}</div>`;
      })
      .join("");
    let b = document.getElementById("logs");
    b.innerHTML = html;
    b.scrollTop = b.scrollHeight;
  } catch (e) {
    console.error("Erreur logs:", e);
  }
}

function escapeHtml(text) {
  let div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendCmd() {
  let i = document.getElementById("cmd-in");
  if (!i.value.trim()) return;
  try {
    await fetch(`/api/server/${current}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: i.value }),
    });
    i.value = "";
    setTimeout(fetchLog, 500);
  } catch (e) {
    alert("Erreur commande: " + e.message);
  }
}

// PLAYERS
async function loadP() {
  try {
    let p = await (await fetch(`/api/server/${current}/players`)).json();
    document.getElementById("p-grid").style.display = "grid";
    document.getElementById("p-detail").style.display = "none";

    if (p.length === 0)
      document.getElementById("p-grid").innerHTML =
        "<div style='color:#777'>Aucun joueur enregistre sur ce serveur.</div>";
    else
      document.getElementById("p-grid").innerHTML = p
        .map(
          (pl) => `
          <div class="p-card" onclick="openP('${pl.uuid}','${pl.name}')">
              <img src="https://mc-heads.net/avatar/${pl.name}" onerror="this.src='https://mc-heads.net/avatar/steve'">
              <div><b>${pl.name}</b></div>
          </div>
      `,
        )
        .join("");
  } catch (e) {
    console.error("Erreur chargement joueurs:", e);
  }
}

async function openP(uuid, name) {
  selectedP = name;
  selectedPUuid = uuid;
  document.getElementById("p-grid").style.display = "none";
  document.getElementById("p-detail").style.display = "block";
  document.getElementById("p-name").innerText = name;
  document.getElementById("p-head").src = `https://mc-heads.net/avatar/${name}`;

  try {
    let d = await (await fetch(`/api/server/${current}/player/${uuid}`)).json();
    document.getElementById("st-time").innerText = d.stats.play_time;
    document.getElementById("st-kills").innerText = d.stats.kills;
    document.getElementById("st-deaths").innerText = d.stats.deaths;
    document.getElementById("st-blocks").innerText = d.stats.blocks;
    
    // Infos supplementaires
    let info = [];
    if (d.xp_level) info.push(`Niveau ${d.xp_level}`);
    if (d.position) info.push(`Pos: ${d.position.x}, ${d.position.y}, ${d.position.z}`);
    document.getElementById("p-info").innerText = info.join(" | ");

    // Inventory
    let slots = new Array(41).fill(null);
    d.inventory.forEach((i) => {
      if (i.slot >= 0 && i.slot < 41) slots[i.slot] = i;
    });

    let h = "";
    for (let i = 9; i < 36; i++) h += mkSlot(slots[i]);
    for (let i = 0; i < 9; i++) h += mkSlot(slots[i]);
    document.getElementById("inv-grid").innerHTML = h;
  } catch (e) {
    console.error("Erreur chargement joueur:", e);
  }
}

function mkSlot(i) {
  if (!i) return '<div class="slot"></div>';
  let url = `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/item/${i.id}.png`;
  return `<div class="slot" title="${i.id} x${i.count}"><img src="${url}" onerror="this.style.display='none'"><span>${i.count}</span></div>`;
}

function closeP() {
  document.getElementById("p-grid").style.display = "grid";
  document.getElementById("p-detail").style.display = "none";
}

async function pAct(a) {
  if (confirm("Executer cette action sur " + selectedP + " ?")) {
    try {
      await fetch(`/api/server/${current}/player/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo: selectedP, act: a }),
      });
      alert("Commande envoyee !");
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  }
}

// PLUGINS
async function loadPlugins() {
  try {
    let installed = await (await fetch(`/api/server/${current}/plugins`)).json();
    let html = "";
    
    if (installed.length === 0) {
      html = "<div style='color:#777'>Aucun plugin installe.</div>";
    } else {
      html = installed.map(p => `
        <div class="plugin-item">
          <div class="plugin-info">
            <b>${p.name}</b>
            <small>${p.size_mb} MB</small>
          </div>
          <button class="btn-danger-sm" onclick="uninstallPlugin('${p.name}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `).join("");
    }
    
    document.getElementById("installed-plugins").innerHTML = html;
  } catch (e) {
    console.error("Erreur chargement plugins:", e);
  }
}

async function searchPl() {
  let q = document.getElementById("pl-search").value;
  try {
    let r = await (await fetch(`/api/hangar/search?q=${encodeURIComponent(q)}`)).json();
    
    if (r.result.length === 0) {
      document.getElementById("pl-results").innerHTML = "<div style='color:#777'>Aucun resultat.</div>";
      return;
    }
    
    document.getElementById("pl-results").innerHTML = r.result
      .map(
        (p) => `
          <div class="plugin-card">
              <img src="${p.avatarUrl || 'https://docs.papermc.io/img/paper.png'}" width="40" onerror="this.src='https://docs.papermc.io/img/paper.png'">
              <div class="plugin-details">
                <b>${escapeHtml(p.name)}</b>
                <small>${escapeHtml(p.description || '')}</small>
              </div>
              <button class="btn-primary" onclick="inst('${p.namespace.owner}','${p.namespace.slug}')">
                <i class="fa-solid fa-download"></i> Install
              </button>
          </div>
      `,
      )
      .join("");
  } catch (e) {
    console.error("Erreur recherche:", e);
  }
}

async function inst(a, s) {
  if (!confirm("Installer ce plugin ?")) return;
  try {
    let r = await fetch(`/api/server/${current}/plugins/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: a, slug: s }),
    });
    let j = await r.json();
    if (j.success) {
      alert("Plugin installe avec succes !");
      loadPlugins();
    } else {
      alert("Erreur: " + j.message);
    }
  } catch (e) {
    alert("Erreur installation: " + e.message);
  }
}

async function uninstallPlugin(name) {
  if (!confirm("Supprimer ce plugin ?")) return;
  try {
    let r = await fetch(`/api/server/${current}/plugins/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plugin_name: name }),
    });
    let j = await r.json();
    if (j.success) {
      alert("Plugin supprime !");
      loadPlugins();
    } else {
      alert("Erreur: " + j.message);
    }
  } catch (e) {
    alert("Erreur suppression: " + e.message);
  }
}

// CONFIG AVEC TRADUCTION
async function loadC() {
  try {
    let p = await (await fetch(`/api/server/${current}/properties`)).json();
    let h = "";

    Object.keys(p)
      .sort((a, b) => (CONFIG_FR[a] ? -1 : 1))
      .forEach((k) => {
        let label = CONFIG_FR[k] || k;
        let val = p[k];
        let input = `<input name="${k}" value="${escapeHtml(val)}">`;

        if (val === "true" || val === "false") {
          input = `<select name="${k}" style="width:100%; padding:10px; background:#222; color:white; border:1px solid #444; border-radius:8px;">
                  <option value="true" ${val === "true" ? "selected" : ""}>Active (True)</option>
                  <option value="false" ${val === "false" ? "selected" : ""}>Desactive (False)</option>
              </select>`;
        }

        h += `<div class="form-group"><label>${label}</label>${input}</div>`;
      });
    document.getElementById("config-form").innerHTML = h;
  } catch (e) {
    console.error("Erreur chargement config:", e);
  }
}

async function saveProps() {
  let d = {};
  document
    .querySelectorAll("#config-form [name]")
    .forEach((i) => (d[i.name] = i.value));
  try {
    await fetch(`/api/server/${current}/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    alert("Configuration sauvegardee ! Redemarrez le serveur pour appliquer.");
  } catch (e) {
    alert("Erreur sauvegarde: " + e.message);
  }
}

// SETTINGS (RAM, etc.)
async function loadSettings() {
  try {
    let config = await (await fetch(`/api/server/${current}/config`)).json();
    
    document.getElementById("set-ram-min").value = config.ram_min || "1G";
    document.getElementById("set-ram-max").value = config.ram_max || "2G";
    document.getElementById("set-java-path").value = config.java_path || "java";
    
    // Charger les backups
    let backups = await (await fetch(`/api/server/${current}/backups`)).json();
    if (backups.length === 0) {
      document.getElementById("backups-list").innerHTML = "<div style='color:#777'>Aucune sauvegarde.</div>";
    } else {
      document.getElementById("backups-list").innerHTML = backups.map(b => `
        <div class="backup-item">
          <span>${b.name}</span>
          <small>${b.size_mb} MB - ${new Date(b.date).toLocaleString()}</small>
        </div>
      `).join("");
    }
  } catch (e) {
    console.error("Erreur chargement settings:", e);
  }
}

async function saveSettings() {
  let config = {
    ram_min: document.getElementById("set-ram-min").value,
    ram_max: document.getElementById("set-ram-max").value,
    java_path: document.getElementById("set-java-path").value || "java"
  };
  
  try {
    await fetch(`/api/server/${current}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    alert("Parametres sauvegardes ! Redemarrez le serveur pour appliquer.");
  } catch (e) {
    alert("Erreur sauvegarde: " + e.message);
  }
}

function openModal() {
  document.getElementById("modal").style.display = "flex";
  // Animation d'entrée
  setTimeout(() => {
    document.querySelector(".modal-content").style.transform = "scale(1)";
    document.querySelector(".modal-content").style.opacity = "1";
  }, 10);
}

function closeModal() {
  document.querySelector(".modal-content").style.transform = "scale(0.9)";
  document.querySelector(".modal-content").style.opacity = "0";
  setTimeout(() => {
    document.getElementById("modal").style.display = "none";
  }, 200);
}

async function createSrv() {
  let n = document.getElementById("new-name").value.trim();
  let v = document.getElementById("new-ver").value;
  let ramMin = parseInt(document.getElementById("new-ram-min").value);
  let ramMax = parseInt(document.getElementById("new-ram-max").value);
  let storage = document.getElementById("new-storage").value;
  let path = document.getElementById("new-path").value.trim();
  
  if (!n) {
    alert("Veuillez entrer un nom de serveur");
    return;
  }
  
  // Valider le nom
  if (!/^[a-zA-Z0-9_-]+$/.test(n)) {
    alert("Le nom ne peut contenir que des lettres, chiffres, - et _");
    return;
  }
  
  // Valider la RAM
  if (ramMin >= ramMax) {
    alert("La RAM maximale doit etre superieure a la RAM minimale");
    return;
  }
  
  if (ramMin < 512) {
    alert("La RAM minimale doit etre au moins 512 MB");
    return;
  }
  
  try {
    closeModal();
    
    // Afficher progression
    showNotification("Creation en cours... Telechargement de PaperMC " + v, "info");
    
    let payload = { 
      name: n, 
      version: v, 
      ram_min: ramMin + "M",
      ram_max: ramMax + "M"
    };
    
    if (storage) payload.storage_limit = parseInt(storage);
    if (path) payload.base_path = path;
    
    let r = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    let j = await r.json();
    if (j.status === "success") {
      showNotification("Serveur cree avec succes !", "success");
      setTimeout(() => location.reload(), 1500);
    } else {
      showNotification("Erreur: " + j.message, "error");
    }
  } catch (e) {
    showNotification("Erreur creation: " + e.message, "error");
  }
}

function showNotification(message, type = "info") {
  // Créer notification toast
  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <i class="fa-solid fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(notif);
  
  // Animation d'entrée
  setTimeout(() => notif.classList.add("show"), 10);
  
  // Retirer après 5 secondes
  setTimeout(() => {
    notif.classList.remove("show");
    setTimeout(() => notif.remove(), 300);
  }, 5000);
}
