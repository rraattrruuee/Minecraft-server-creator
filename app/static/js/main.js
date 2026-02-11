/* main.js — chargeur concret de modules (loader)
   Objectif: charger séquentiellement les fichiers de `app/static/js/` dans
   un ordre sûr, gérer les erreurs et appeler les éventuelles fonctions
   d'initialisation exporées par chaque module.

   Comportement:
   - charge les scripts en séquence (garantit l'ordre de dépendances)
   - timeout et gestion d'erreur par fichier
   - tente d'appeler `init*()` après chargement si la fonction existe
   - expose `window.MCP_loadComplete` (Promise) pour attendre la fin du
     chargement depuis d'autres scripts ou tests
   - support optionnel pour `dynamic import()` si `window.__MCP_USE_MODULES` est vrai
*/
(function () {
  "use strict";

  const MODULES = [
    "/static/js/mcp_utils.js",
    "/static/js/mcp_api.js",
    "/static/js/mcp_state.js",
    "/static/js/mcp_i18n.js",
    "/static/js/mcp_ui.js",
    "/static/js/mcp_preferences.js",
    "/static/js/mcp_auth.js",
    "/static/js/mcp_shortcuts.js",
    "/static/js/mcp_commands.js",
    "/static/js/mcp_console.js",
    "/static/js/mcp_logs.js",
    "/static/js/mcp_notifications.js",
    "/static/js/mcp_sounds.js",
    "/static/js/mcp_server_management.js",
    "/static/js/mcp_tunnel.js",
    "/static/js/mcp_versions.js",
    "/static/js/mcp_mods.js",
    "/static/js/mcp_plugins.js",
    "/static/js/mcp_players.js",
    "/static/js/mcp_player_data_tool.js",
    "/static/js/mcp_config.js",
    "/static/js/mcp_metrics.js",
    "/static/js/mcp_files.js",
    "/static/js/mcp_forms.js",
    "/static/js/mcp_security.js",
  ];

  // map of optional init function names per script base name
  const INIT_MAP = {
    mcp_utils: "initUtils",
    mcp_api: "initApi",
    mcp_state: "initState",
    mcp_i18n: "initI18n",
    mcp_ui: "initUI",
    mcp_preferences: "initPreferences",
    mcp_auth: "initAuth",
    mcp_shortcuts: "initShortcuts",
    mcp_commands: "initCommands",
    mcp_console: "initConsole",
    mcp_logs: "initLogs",
    mcp_notifications: "initNotifications",
    mcp_sounds: "initSounds",
    mcp_server_management: "initServerManagement",
    mcp_tunnel: "initTunnel",
    mcp_versions: "initVersions",
    mcp_mods: "initMods",
    mcp_plugins: "initPlugins",
    mcp_players: "initPlayers",
    mcp_player_data_tool: "initPlayerDataTool",
    mcp_config: "initConfig",
    mcp_metrics: "initMetrics",
    mcp_files: "initFiles",
    mcp_forms: "initForms",
    mcp_security: "initSecurity",
  };

  function basename(path) {
    return path.replace(/^.*\//, "").replace(/\.js$/, "");
  }

  function loadScript(src, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.defer = false;

      let timer = setTimeout(() => {
        script.onerror = script.onload = null;
        reject(new Error("Timeout loading " + src));
      }, timeout);

      script.onload = () => {
        clearTimeout(timer);
        resolve(src);
      };

      script.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error("Error loading " + src));
      };

      document.head.appendChild(script);
    });
  }

  async function loadSequentially(list) {
    const results = [];
    for (const src of list) {
      try {
        // If requested, use dynamic import (module) when possible
        if (window.__MCP_USE_MODULES) {
          // dynamic import needs absolute/relative path; wrap in try/catch
          try {
            await import(src + "?t=" + Date.now()); // cache busting for dev
            results.push({ src, ok: true });
          } catch (err) {
            // fallback to classic script injection
            await loadScript(src);
            results.push({ src, ok: true, fallback: true });
          }
        } else {
          await loadScript(src);
          results.push({ src, ok: true });
        }

        // Try calling optional init function if present
        const base = basename(src);
        const initName = INIT_MAP[base];
        if (initName && typeof window[initName] === "function") {
          try {
            window[initName]();
            // console.info(`${initName}() executed`);
          } catch (e) {
            console.warn(`Initialization function ${initName} failed:`, e);
          }
        }
      } catch (err) {
        // bubble up the error but continue loading the rest (best-effort)
        console.error("Error loading module", src, err);
        results.push({ src, ok: false, error: err });
        // show a visible toast when available
        try {
          if (typeof window.showToast === "function")
            window.showToast("error", `Échec chargement script ${src}`);
        } catch (e) {}
      }
    }
    return results;
  }

  // After all scripts load, replay any queued inline calls (like showSection queue)
  function replayQueuedCalls() {
    try {
      if (
        Array.isArray(window.__queuedShowSection) &&
        typeof window.__real_showSection === "function"
      ) {
        while (window.__queuedShowSection.length) {
          try {
            window.__real_showSection(window.__queuedShowSection.shift());
          } catch (e) {
            console.warn("replay showSection failed", e);
          }
        }
      }
    } catch (e) {
      console.warn("replayQueuedCalls error", e);
    }
  }

  // Expose a promise that resolves when loading is complete
  let _resolve, _reject;
  const completePromise = new Promise((res, rej) => {
    _resolve = res;
    _reject = rej;
  });
  window.MCP_loadComplete = completePromise;

  (async function main() {
    try {
      const res = await loadSequentially(MODULES);
      replayQueuedCalls();

      // Log a summary and resolve
      console.info("MCP loader finished. Modules summary:", res);
      _resolve(res);
    } catch (err) {
      console.error("MCP loader unexpected failure", err);
      try {
        _reject(err);
      } catch (e) {}
    }
  })();
})();
