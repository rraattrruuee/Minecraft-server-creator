// mcp_commands.js
// Command handling: history, autocomplete, favorites

const MINECRAFT_COMMANDS = [
  "say",
  "tell",
  "msg",
  "whisper",
  "me",
  "teammsg",
  "kick",
  "ban",
  "ban-ip",
  "pardon",
  "pardon-ip",
  "banlist",
  "op",
  "deop",
  "whitelist add",
  "whitelist remove",
  "whitelist list",
  "whitelist on",
  "whitelist off",
  "gamemode survival",
  "gamemode creative",
  "gamemode adventure",
  "gamemode spectator",
  "time set day",
  "time set night",
  "time set noon",
  "time set midnight",
  "time add",
  "weather clear",
  "weather rain",
  "weather thunder",
  "difficulty peaceful",
  "difficulty easy",
  "difficulty normal",
  "difficulty hard",
  "give",
  "clear",
  "effect give",
  "effect clear",
  "enchant",
  "tp",
  "teleport",
  "spawnpoint",
  "setworldspawn",
  "spreadplayers",
  "kill",
  "summon",
  "setblock",
  "fill",
  "clone",
  "execute",
  "gamerule",
  "scoreboard",
  "title",
  "bossbar",
  "team",
  "stop",
  "save-all",
  "save-on",
  "save-off",
  "reload",
  "list",
  "seed",
  "plugins",
  "version",
  "tps",
  "gc",
  "worldborder set",
  "worldborder center",
  "worldborder add",
  "experience add",
  "experience set",
  "xp",
  "locate",
  "locatebiome",
  "playsound",
  "stopsound",
  "attribute",
  "damage",
  "data",
  "function",
  "schedule",
];

async function sendCommand(cmd) {
  try {
    if (!currentServer) return;
    let command = typeof cmd === "string" && cmd.trim() ? cmd.trim() : null;
    const input = document.getElementById("cmd-input");
    if (!command) command = input ? input.value.trim() : "";
    if (!command) return;

    if (command !== commandHistory[0]) {
      commandHistory.unshift(command);
      if (commandHistory.length > MAX_COMMAND_HISTORY) commandHistory.pop();
      saveCommandHistory();
    }
    commandHistoryIndex = -1;

    sessionStats.commandsSent++;
    sessionStats.apiCalls++;

    try {
      const response = await apiFetch(`/api/server/${currentServer}/command`, {
        method: "POST",
        body: JSON.stringify({ command }),
      });
      const result = await response.json();
      if (result.status === "success") {
        try {
          if (input) input.value = "";
        } catch (e) {}
        appendCommandToConsole(command);
        setTimeout(loadLogs, 500);
      } else {
        showToast("error", result.message || "Erreur");
      }
    } catch (error) {
      console.error("Erreur commande:", error);
      sessionStats.errors++;
      showToast("error", "Erreur envoi commande");
    }
  } catch (error) {
    console.error("sendCommand top-level error:", error);
    sessionStats.errors++;
    try {
      showToast("error", "Erreur envoi commande");
    } catch (e) {}
  }
}

function appendCommandToConsole(command) {
  const logsDiv = document.getElementById("logs");
  if (logsDiv) {
    const cmdLine = document.createElement("div");
    cmdLine.className = "log-line log-command";
    cmdLine.innerHTML = `<span class="cmd-prompt-inline">></span> ${escapeHtml(command)}`;
    logsDiv.appendChild(cmdLine);
    if (autoScroll) logsDiv.scrollTop = logsDiv.scrollHeight;
  }
}

function handleCommandInput(event) {
  const input = document.getElementById("cmd-input");
  if (event.key === "Enter") sendCommand();
  else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (commandHistoryIndex < commandHistory.length - 1) {
      commandHistoryIndex++;
      input.value = commandHistory[commandHistoryIndex] || "";
    }
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    if (commandHistoryIndex > 0) {
      commandHistoryIndex--;
      input.value = commandHistory[commandHistoryIndex] || "";
    } else {
      commandHistoryIndex = -1;
      input.value = "";
    }
  } else if (event.key === "Tab") {
    event.preventDefault();
    autocompleteCommand();
  }
}

function autocompleteCommand() {
  const input = document.getElementById("cmd-input");
  if (!input) return;
  const value = input.value.toLowerCase();
  if (!value) return;
  const matches = MINECRAFT_COMMANDS.filter((cmd) =>
    cmd.toLowerCase().startsWith(value),
  );
  if (matches.length === 1) input.value = matches[0] + " ";
  else if (matches.length > 1) showCommandSuggestions(matches);
}

function showCommandSuggestions(suggestions) {
  let popup = document.getElementById("cmd-suggestions");
  const wrapper = document.querySelector(".console-input");
  if (!popup && wrapper) {
    popup = document.createElement("div");
    popup.id = "cmd-suggestions";
    popup.className = "cmd-suggestions";
    wrapper.appendChild(popup);
  }
  if (popup) {
    popup.innerHTML = suggestions
      .slice(0, 10)
      .map(
        (s) =>
          `<div class="cmd-suggestion" onclick="selectSuggestion('${s}')">${s}</div>`,
      )
      .join("");
    popup.style.display = "block";
    setTimeout(() => {
      popup.style.display = "none";
    }, 5000);
  }
}

function selectSuggestion(cmd) {
  const input = document.getElementById("cmd-input");
  if (input) {
    input.value = cmd + " ";
    input.focus();
  }
  const popup = document.getElementById("cmd-suggestions");
  if (popup) popup.style.display = "none";
}

function initCommands() {
  // Expose internal names with and without underscore for compatibility
  globalThis._mcp_sendCommand = sendCommand;
  globalThis._mcp_handleCommandInput = handleCommandInput;
  globalThis._mcp_autocompleteCommand = autocompleteCommand;
  globalThis._mcp_showCommandSuggestions = showCommandSuggestions;
  globalThis._mcp_selectSuggestion = selectSuggestion;
  globalThis._mcp_appendCommandToConsole = appendCommandToConsole;

  // Public aliases (if nothing else defines them)
  if (typeof globalThis.sendCommand !== "function")
    globalThis.sendCommand = sendCommand;
  if (typeof globalThis.handleCommandInput !== "function")
    globalThis.handleCommandInput = handleCommandInput;
  if (typeof globalThis.autocompleteCommand !== "function")
    globalThis.autocompleteCommand = autocompleteCommand;
  if (typeof globalThis.showCommandSuggestions !== "function")
    globalThis.showCommandSuggestions = showCommandSuggestions;
  if (typeof globalThis.selectSuggestion !== "function")
    globalThis.selectSuggestion = selectSuggestion;
  if (typeof globalThis.appendCommandToConsole !== "function")
    globalThis.appendCommandToConsole = appendCommandToConsole;
}

try {
  initCommands();
} catch (e) {
  console.warn("initCommands failed", e);
}
