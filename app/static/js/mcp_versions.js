// mcp_versions.js
// Gestion des versions (paper/forge/fabric)

async function loadForgeBuilds(version) {
  try {
    const resp = await apiFetch(`/api/forge/builds/${version}`);
    const data = await resp.json();
    const select = document.getElementById("forge-version");
    if (select && data.builds) {
      select.innerHTML = data.builds
        .map(
          (b) =>
            `<option value="${b.full_version}">${b.forge_version}</option>`,
        )
        .join("");
    }
  } catch (e) {
    console.warn("Forge builds error", e);
  }
}

async function loadFabricLoaders(mcVersion) {
  try {
    const resp = await apiFetch(
      `/api/fabric/loaders/${encodeURIComponent(mcVersion)}`,
    );
    const data = await resp.json();
    const loaders = data.loaders || [];
    const select = document.getElementById("fabric-loader");
    if (select) {
      select.innerHTML = loaders
        .map((l) => {
          const version =
            typeof l === "object" && l !== null
              ? l.version || l.name || JSON.stringify(l)
              : String(l);
          return `<option value="${escapeHtmlAttr(version)}">${escapeHtml(version)}</option>`;
        })
        .join("");
    }
  } catch (e) {
    console.warn("Fabric loaders error", e);
  }
}

async function loadVersions() {
  try {
    const serverType = document.getElementById("server-type")?.value || "paper";
    const select = document.getElementById("server-version");
    if (!select) return;
    if (serverType === "paper") {
      const response = await apiFetch("/api/papermc/versions");
      const data = await response.json();
      const versions = Array.isArray(data)
        ? data
        : data?.versions || data?.result || [];
      select.innerHTML = versions
        .map((v) => `<option value="${v}">${v}</option>`)
        .join("");
      select.onchange = function () {};
      document.getElementById("forge-version-group").style.display = "none";
      document.getElementById("fabric-loader-group").style.display = "none";
    } else if (serverType === "forge" || serverType === "neoforge") {
      const endpoint =
        serverType === "forge"
          ? "/api/forge/versions"
          : "/api/neoforge/versions";
      const r = await apiFetch(endpoint);
      const d = await r.json();
      let mcVersions = [];
      if (Array.isArray(d)) mcVersions = d;
      else if (Array.isArray(d.versions)) mcVersions = d.versions;
      else if (d && typeof d.versions === "object")
        mcVersions = Object.keys(d.versions);
      else if (d && typeof d === "object") mcVersions = Object.keys(d);
      select.innerHTML = mcVersions
        .map((v) => `<option value="${v}">${v}</option>`)
        .join("");
      select.onchange = function () {
        if (this.value) loadForgeBuilds(this.value);
      };
      document.getElementById("forge-version-group").style.display = "block";
      document.getElementById("fabric-loader-group").style.display = "none";
      if (mcVersions.length > 0) loadForgeBuilds(mcVersions[0]);
    } else if (serverType === "fabric") {
      const r = await apiFetch("/api/fabric/versions");
      const d = await r.json();
      let versions = [];
      if (Array.isArray(d)) versions = d;
      else if (Array.isArray(d.game)) versions = d.game;
      else if (d && d.versions) {
        if (Array.isArray(d.versions.game)) versions = d.versions.game;
        else if (Array.isArray(d.versions)) versions = d.versions;
      }
      if (!Array.isArray(versions) || versions.length === 0) {
        console.warn("Fabric versions response has unexpected shape:", d);
        select.innerHTML =
          '<option value="">(Aucune version disponible)</option>';
        document.getElementById("fabric-loader-group").style.display = "none";
      } else {
        select.innerHTML = versions
          .map((v) => `<option value="${v}">${v}</option>`)
          .join("");
      }
    }
  } catch (e) {
    console.error("loadVersions failed", e);
  }
}

function initVersions() {
  globalThis.loadVersions = loadVersions;
  globalThis.loadForgeBuilds = loadForgeBuilds;
  globalThis.loadFabricLoaders = loadFabricLoaders;
  globalThis._mcp_loadVersions = loadVersions;
  globalThis.onServerTypeChangeDebounced = function () {
    if (typeof onServerTypeChange === "function") onServerTypeChange();
    loadVersions();
  };
}
