let current = null;
let logInt = null;
let selectedP = null;

// --- DICTIONNAIRE FRANCAIS ---
const CONFIG_FR = {
  motd: "Message de bienvenue (MOTD)",
  "server-port": "Port du serveur (défaut: 25565)",
  "max-players": "Nombre maximum de joueurs",
  "white-list": "Activer la Liste Blanche (Whitelist)",
  "online-mode": "Mode Officiel (true) / Cracké (false)",
  pvp: "Combat entre joueurs (PVP)",
  difficulty: "Difficulté (peaceful, easy, normal, hard)",
  gamemode: "Mode de jeu par défaut (survival, creative)",
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
  let l = await (await fetch("/api/servers")).json();
  document.getElementById("srv-list").innerHTML = l
    .map((s) => `<div class="srv-item" onclick="sel('${s}',this)">${s}</div>`)
    .join("");
}
async function loadVer() {
  let v = await (await fetch("/api/papermc/versions")).json();
  document.getElementById("new-ver").innerHTML = v
    .map((x) => `<option>${x}</option>`)
    .join("");
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
  event.target.classList.add("active");

  if (v === "console") startLog();
  else stopLog();
  if (v === "players") loadP();
  if (v === "config") loadC();
}

// LOGIC
async function updateSt() {
  if (!current) return;
  let s = await (await fetch(`/api/server/${current}/status`)).json();
  let b = document.getElementById("badge");
  b.className = "badge " + s.status;
  b.innerText = s.status.toUpperCase();
}
async function act(a) {
  await fetch(`/api/server/${current}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a }),
  });
  setTimeout(updateSt, 2000);
}
async function deleteSrv() {
  if (confirm("Supprimer ?")) {
    await fetch(`/api/server/${current}/delete`, { method: "DELETE" });
    location.reload();
  }
}

// LOGS
function startLog() {
  stopLog();
  fetchLog();
  logInt = setInterval(fetchLog, 2000);
}
function stopLog() {
  clearInterval(logInt);
}
async function fetchLog() {
  let r = await (await fetch(`/api/server/${current}/console`)).json();
  let html = r.logs
    .map((l) => {
      let c = "log-info";
      if (l.includes("ERROR") || l.includes("Exception")) c = "log-err";
      return `<div class="${c}">${l}</div>`;
    })
    .join("");
  let b = document.getElementById("logs");
  b.innerHTML = html;
  b.scrollTop = b.scrollHeight;
}
async function sendCmd() {
  let i = document.getElementById("cmd-in");
  await fetch(`/api/server/${current}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: i.value }),
  });
  i.value = "";
  setTimeout(fetchLog, 500);
}

// PLAYERS
async function loadP() {
  let p = await (await fetch(`/api/server/${current}/players`)).json();
  document.getElementById("p-grid").style.display = "grid";
  document.getElementById("p-detail").style.display = "none";

  if (p.length === 0)
    document.getElementById("p-grid").innerHTML =
      "<div style='color:#777'>Aucun joueur.</div>";
  else
    document.getElementById("p-grid").innerHTML = p
      .map(
        (pl) => `
        <div class="p-card" onclick="openP('${pl.uuid}','${pl.name}')">
            <img src="https://mc-heads.net/avatar/${pl.name}">
            <div><b>${pl.name}</b></div>
        </div>
    `,
      )
      .join("");
}
async function openP(uuid, name) {
  selectedP = name;
  document.getElementById("p-grid").style.display = "none";
  document.getElementById("p-detail").style.display = "block";
  document.getElementById("p-name").innerText = name;
  document.getElementById("p-head").src = `https://mc-heads.net/avatar/${name}`;

  let d = await (await fetch(`/api/server/${current}/player/${uuid}`)).json();
  document.getElementById("st-time").innerText = d.stats.play_time;
  document.getElementById("st-kills").innerText = d.stats.kills;
  document.getElementById("st-deaths").innerText = d.stats.deaths;

  // Inventory
  let slots = new Array(41).fill(null);
  d.inventory.forEach((i) => {
    if (i.slot >= 0 && i.slot < 41) slots[i.slot] = i;
  });

  let h = "";
  for (let i = 9; i < 36; i++) h += mkSlot(slots[i]);
  for (let i = 0; i < 9; i++) h += mkSlot(slots[i]);
  document.getElementById("inv-grid").innerHTML = h;
}
function mkSlot(i) {
  if (!i) return '<div class="slot"></div>';
  let url = `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/item/${i.id}.png`;
  return `<div class="slot" title="${i.id}"><img src="${url}"><span>${i.count}</span></div>`;
}
function closeP() {
  document.getElementById("p-grid").style.display = "grid";
  document.getElementById("p-detail").style.display = "none";
}
async function pAct(a) {
  if (confirm("Confirmer ?"))
    await fetch(`/api/server/${current}/player/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo: selectedP, act: a }),
    });
}

// PLUGINS
async function searchPl() {
  let q = document.getElementById("pl-search").value;
  let r = await (await fetch(`/api/hangar/search?q=${q}`)).json();
  document.getElementById("pl-results").innerHTML = r.result
    .map(
      (p) => `
        <div style="display:flex; gap:10px; background:#18181b; padding:10px; margin-bottom:10px; border-radius:8px; align-items:center;">
            <img src="${p.avatarUrl || "https://docs.papermc.io/img/paper.png"}" width="40" style="border-radius:4px">
            <div style="flex:1"><b>${p.name}</b><br><small style="color:#777">${p.description || ""}</small></div>
            <button class="btn-primary" onclick="inst('${p.namespace.owner}','${p.namespace.slug}')">Install</button>
        </div>
    `,
    )
    .join("");
}
async function inst(a, s) {
  if (!confirm("Installer ?")) return;
  let r = await fetch(`/api/server/${current}/plugins/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author: a, slug: s }),
  });
  let j = await r.json();
  alert(j.success ? "Succès" : "Erreur");
}

// CONFIG AVEC TRADUCTION
async function loadC() {
  let p = await (await fetch(`/api/server/${current}/properties`)).json();
  let h = "";

  Object.keys(p)
    .sort((a, b) => (CONFIG_FR[a] ? -1 : 1))
    .forEach((k) => {
      let label = CONFIG_FR[k] || k;
      let val = p[k];
      let input = `<input name="${k}" value="${val}">`;

      if (val === "true" || val === "false") {
        input = `<select name="${k}" style="width:100%; padding:10px; background:#222; color:white; border:1px solid #444; border-radius:8px;">
                <option value="true" ${val === "true" ? "selected" : ""}>Activé (True)</option>
                <option value="false" ${val === "false" ? "selected" : ""}>Désactivé (False)</option>
            </select>`;
      }

      h += `<div class="form-group"><label>${label}</label>${input}</div>`;
    });
  document.getElementById("config-form").innerHTML = h;
}
async function saveProps() {
  let d = {};
  document
    .querySelectorAll("#config-form [name]")
    .forEach((i) => (d[i.name] = i.value));
  await fetch(`/api/server/${current}/properties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  alert("Sauvegardé");
}

function openModal() {
  document.getElementById("modal").style.display = "flex";
}
async function createSrv() {
  let n = document.getElementById("new-name").value;
  let v = document.getElementById("new-ver").value;
  await fetch("/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: n, version: v }),
  });
  location.reload();
}
