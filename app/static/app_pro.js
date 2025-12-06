// MCPanel JS - Ultimate Edition v2.0 with Visual Effects + 50 Improvements

// ================================
// GLOBAL STATE
// ================================
let currentServer = null;
let logInterval = null;
let statusInterval = null;
let metricsInterval = null;
let mainChart = null;
let metricsHistory = { cpu: [], ram: [], timestamps: [] };
let currentUser = null;
let translations = {};
let currentLang = 'fr';
let autoScroll = true;
let logFilter = 'all';
let allLogs = [];

// Amélioration 1: Historique des commandes
let commandHistory = [];
let commandHistoryIndex = -1;
const MAX_COMMAND_HISTORY = 100;

// Amélioration 2: Cache système
const dataCache = {
    servers: null,
    versions: null,
    metrics: null,
    lastUpdate: {}
};
const CACHE_DURATION = 30000;

// Amélioration 3: Statistiques de session
const sessionStats = {
    startTime: Date.now(),
    apiCalls: 0,
    errors: 0,
    commandsSent: 0,
    notifications: 0
};

// Amélioration 4: État de connexion
let isOnline = navigator.onLine;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Amélioration 5: Préférences utilisateur étendues
const userPreferences = {
    soundEnabled: true,
    desktopNotifications: false,
    compactMode: false,
    showTimestamps: true,
    logMaxLines: 1000,
    autoRefresh: true,
    refreshInterval: 5000
};

// Amélioration 6: Commandes favorites
let favoriteCommands = [];

// Amélioration 7: Players en cache pour éviter les requêtes répétées
let cachedPlayers = {};

// Amélioration 8: Dernière activité
let lastActivity = Date.now();
const IDLE_TIMEOUT = 300000; // 5 minutes

// ================================
// INITIALISATION AMÉLIORÉE
// ================================

// Amélioration 9: Charger les préférences au démarrage
function loadUserPreferences() {
    const saved = localStorage.getItem('mcpanel_userprefs');
    if (saved) {
        try {
            Object.assign(userPreferences, JSON.parse(saved));
        } catch (e) {
            console.warn('Erreur chargement préférences:', e);
        }
    }
    
    // Charger l'historique des commandes
    loadCommandHistory();
    
    // Charger les commandes favorites
    loadFavoriteCommands();
    renderFavoriteCommands();
}

function saveUserPreferences() {
    localStorage.setItem('mcpanel_userprefs', JSON.stringify(userPreferences));
}

// Amélioration 10: Charger l'historique des commandes
function loadCommandHistory() {
    const saved = localStorage.getItem('mcpanel_cmdhistory');
    if (saved) {
        try {
            commandHistory = JSON.parse(saved);
        } catch (e) {}
    }
}

function saveCommandHistory() {
    localStorage.setItem('mcpanel_cmdhistory', JSON.stringify(commandHistory.slice(0, 50)));
}

// Amélioration 11: Commandes favorites
function loadFavoriteCommands() {
    const saved = localStorage.getItem('mcpanel_favcmds');
    if (saved) {
        try {
            favoriteCommands = JSON.parse(saved);
        } catch (e) {}
    }
}

function saveFavoriteCommands() {
    localStorage.setItem('mcpanel_favcmds', JSON.stringify(favoriteCommands));
}

function addFavoriteCommand(cmd) {
    if (!favoriteCommands.includes(cmd)) {
        favoriteCommands.push(cmd);
        saveFavoriteCommands();
        showToast('success', 'Commande ajoutée aux favoris');
        renderFavoriteCommands();
    }
}

function removeFavoriteCommand(cmd) {
    favoriteCommands = favoriteCommands.filter(c => c !== cmd);
    saveFavoriteCommands();
    showToast('info', 'Commande retirée des favoris');
    renderFavoriteCommands();
}

// Amélioration : Ajouter la commande actuelle aux favoris
function addCurrentCommandToFavorites() {
    const input = document.getElementById('cmd-input');
    const cmd = input?.value?.trim();
    if (cmd) {
        addFavoriteCommand(cmd);
    } else {
        showToast('info', 'Entrez une commande d\'abord');
    }
}

// Amélioration : Afficher les commandes favorites
function renderFavoriteCommands() {
    const container = document.getElementById('favorite-commands-list');
    const bar = document.getElementById('favorite-commands-bar');
    if (!container) return;
    
    if (favoriteCommands.length === 0) {
        if (bar) bar.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    
    if (bar) bar.style.display = 'flex';
    
    container.innerHTML = favoriteCommands.map(cmd => `
        <button class="fav-cmd-btn" onclick="useFavoriteCommand('${escapeHtmlAttr(cmd)}')" title="${escapeHtmlAttr(cmd)}">
            <span class="fav-cmd-text">${escapeHtml(cmd.length > 15 ? cmd.substring(0, 15) + '...' : cmd)}</span>
            <span class="fav-cmd-remove" onclick="event.stopPropagation(); removeFavoriteCommand('${escapeHtmlAttr(cmd)}')">
                <i class="fas fa-times"></i>
            </span>
        </button>
    `).join('');
}

// Amélioration : Utiliser une commande favorite
function useFavoriteCommand(cmd) {
    const input = document.getElementById('cmd-input');
    if (input) {
        input.value = cmd;
        input.focus();
    }
}

// Amélioration : Échapper les attributs HTML
function escapeHtmlAttr(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Amélioration 12: Détection de connexion
function setupConnectionDetection() {
    window.addEventListener('online', () => {
        isOnline = true;
        reconnectAttempts = 0;
        showToast('✅ Connexion rétablie', 'success');
        if (currentServer) {
            startStatusPolling();
            startLogStream();
        }
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        showToast('⚠️ Connexion perdue', 'warning');
        stopStatusPolling();
        stopLogStream();
    });
}

// Amélioration 13: Détection d'inactivité
function setupIdleDetection() {
    const resetActivity = () => { lastActivity = Date.now(); };
    
    document.addEventListener('mousemove', resetActivity);
    document.addEventListener('keydown', resetActivity);
    document.addEventListener('click', resetActivity);
    
    setInterval(() => {
        if (Date.now() - lastActivity > IDLE_TIMEOUT) {
            // Réduire la fréquence des requêtes en mode inactif
            if (logInterval) {
                clearInterval(logInterval);
                logInterval = setInterval(loadLogs, 30000); // 30s au lieu de 5s
            }
        }
    }, 60000);
}

// Amélioration 14: Raccourcis clavier globaux
function setupGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignorer si on est dans un input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Sauf pour les raccourcis avec Ctrl
            if (!e.ctrlKey) return;
        }
        
        // Ctrl+S - Sauvegarder la config
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            const configView = document.getElementById('view-config');
            if (configView && configView.classList.contains('active')) {
                saveConfig();
            }
        }
        
        // Ctrl+Enter - Envoyer la commande
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            sendCommand();
        }
        
        // F1-F5 - Changer d'onglet
        if (e.key === 'F1') { e.preventDefault(); switchTab('console'); }
        if (e.key === 'F2') { e.preventDefault(); switchTab('players'); }
        if (e.key === 'F3') { e.preventDefault(); switchTab('plugins'); }
        if (e.key === 'F4') { e.preventDefault(); switchTab('config'); }
        if (e.key === 'F5') { e.preventDefault(); switchTab('backups'); }
        
        // Ctrl+R - Rafraîchir
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            refreshAll();
        }
        
        // Escape - Fermer les modals
        if (e.key === 'Escape') {
            closeModal();
            closePlayerModal();
            closeScheduleModal();
        }
    });
}

// Amélioration 15: Navigation historique commandes
function handleCommandInput(event) {
    const input = document.getElementById('cmd-input');
    
    if (event.key === 'Enter') {
        sendCommand();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (commandHistoryIndex < commandHistory.length - 1) {
            commandHistoryIndex++;
            input.value = commandHistory[commandHistoryIndex] || '';
        }
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (commandHistoryIndex > 0) {
            commandHistoryIndex--;
            input.value = commandHistory[commandHistoryIndex] || '';
        } else {
            commandHistoryIndex = -1;
            input.value = '';
        }
    } else if (event.key === 'Tab') {
        event.preventDefault();
        autocompleteCommand();
    }
}

// Amélioration 16: Autocomplétion des commandes Minecraft
const MINECRAFT_COMMANDS = [
    'say', 'tell', 'msg', 'whisper', 'me', 'teammsg',
    'kick', 'ban', 'ban-ip', 'pardon', 'pardon-ip', 'banlist',
    'op', 'deop', 'whitelist add', 'whitelist remove', 'whitelist list', 'whitelist on', 'whitelist off',
    'gamemode survival', 'gamemode creative', 'gamemode adventure', 'gamemode spectator',
    'time set day', 'time set night', 'time set noon', 'time set midnight', 'time add',
    'weather clear', 'weather rain', 'weather thunder',
    'difficulty peaceful', 'difficulty easy', 'difficulty normal', 'difficulty hard',
    'give', 'clear', 'effect give', 'effect clear', 'enchant',
    'tp', 'teleport', 'spawnpoint', 'setworldspawn', 'spreadplayers',
    'kill', 'summon', 'setblock', 'fill', 'clone', 'execute',
    'gamerule', 'scoreboard', 'title', 'bossbar', 'team',
    'stop', 'save-all', 'save-on', 'save-off', 'reload',
    'list', 'seed', 'plugins', 'version', 'tps', 'gc',
    'worldborder set', 'worldborder center', 'worldborder add',
    'experience add', 'experience set', 'xp',
    'locate', 'locatebiome', 'playsound', 'stopsound',
    'attribute', 'damage', 'data', 'function', 'schedule'
];

function autocompleteCommand() {
    const input = document.getElementById('cmd-input');
    if (!input) return;
    
    const value = input.value.toLowerCase();
    if (!value) return;
    
    const matches = MINECRAFT_COMMANDS.filter(cmd => 
        cmd.toLowerCase().startsWith(value)
    );
    
    if (matches.length === 1) {
        input.value = matches[0] + ' ';
    } else if (matches.length > 1) {
        showCommandSuggestions(matches);
    }
}

function showCommandSuggestions(suggestions) {
    let popup = document.getElementById('cmd-suggestions');
    const wrapper = document.querySelector('.console-input');
    
    if (!popup && wrapper) {
        popup = document.createElement('div');
        popup.id = 'cmd-suggestions';
        popup.className = 'cmd-suggestions';
        wrapper.appendChild(popup);
    }
    
    if (popup) {
        popup.innerHTML = suggestions.slice(0, 10).map(s => 
            `<div class="cmd-suggestion" onclick="selectSuggestion('${s}')">${s}</div>`
        ).join('');
        popup.style.display = 'block';
        
        setTimeout(() => { popup.style.display = 'none'; }, 5000);
    }
}

function selectSuggestion(cmd) {
    const input = document.getElementById('cmd-input');
    if (input) {
        input.value = cmd + ' ';
        input.focus();
    }
    
    const popup = document.getElementById('cmd-suggestions');
    if (popup) popup.style.display = 'none';
}

// Amélioration 17: Fonction debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Amélioration 18: Fonction throttle
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Amélioration 19: Notifications de bureau
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendDesktopNotification(title, body, icon = '/static/icon.png') {
    if (!userPreferences.desktopNotifications) return;
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon });
    }
}

// Amélioration 20: Sons de notification
function playNotificationSound(type = 'info') {
    if (!userPreferences.soundEnabled) return;
    
    // Utiliser l'API Web Audio pour jouer un son simple
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        const frequencies = {
            success: 800,
            error: 300,
            warning: 500,
            info: 600
        };
        
        oscillator.frequency.value = frequencies[type] || 600;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        // Ignorer les erreurs audio
    }
}



    // ================================
    // Améliorations 21 à 60 : Robustesse avancée
    // ================================

    // Amélioration 21: Surveillance mémoire JS
    setInterval(() => {
        if (window.performance && performance.memory) {
            sessionStats.jsHeap = performance.memory.usedJSHeapSize;
        }
    }, 10000);

    // Amélioration 22: Nettoyage à la fermeture (utiliser pagehide au lieu de unload)
    window.addEventListener('pagehide', () => {
        // Nettoyage global - sauvegarder les préférences
        try {
            saveUserPreferences();
        } catch (e) {}
    });

    // Amélioration 23: Limitation du nombre d'API calls simultanés
    let apiCallCount = 0;
    const MAX_API_CALLS = 5;

    // Amélioration 24: Retry automatique sur fetch réseau
    async function robustFetch(url, options = {}, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                apiCallCount++;
                if (apiCallCount > MAX_API_CALLS) throw new Error('Trop d\'appels API simultanés');
                const res = await fetch(url, options);
                apiCallCount--;
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res;
            } catch (e) {
                apiCallCount--;
                if (i === retries - 1) throw e;
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
            }
        }
    }

    // Amélioration 25: Timeout sur fetch
    async function fetchWithTimeout(url, options = {}, timeout = 8000) {
        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
        ]);
    }

    // Amélioration 26: Validation stricte des entrées utilisateur
    function validateInput(str, type = 'text') {
        if (typeof str !== 'string') return false;
        if (type === 'text') return str.length < 200 && !/\0/.test(str);
        if (type === 'cmd') return /^\/?[a-z0-9_\- ]+$/i.test(str);
        return true;
    }

    // Amélioration 27: Historique des erreurs JS
    let jsErrorLog = [];
    window.addEventListener('error', e => {
        jsErrorLog.push({
            message: e.message,
            file: e.filename,
            line: e.lineno,
            time: Date.now()
        });
        if (jsErrorLog.length > 100) jsErrorLog.shift();
    });

    // Amélioration 28: Affichage d'un message d'erreur global
    function showGlobalError(msg) {
        let el = document.getElementById('global-error');
        if (!el) {
            el = document.createElement('div');
            el.id = 'global-error';
            el.style = 'position:fixed;top:0;left:0;width:100vw;background:#c00;color:#fff;z-index:9999;padding:8px;text-align:center;font-weight:bold;';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        setTimeout(() => { el.remove(); }, 8000);
    }

    // Amélioration 29: Mode dégradé si API down
    async function checkApiHealth() {
        try {
            await fetch('/api/ping', {cache:'no-store'});
            document.body.classList.remove('api-down');
        } catch {
            document.body.classList.add('api-down');
            showGlobalError('API injoignable');
        }
    }
    setInterval(checkApiHealth, 15000);

    // Amélioration 30: Limitation du spam de notifications
    let lastNotifTime = 0;
    function throttledNotify(title, body) {
        if (Date.now() - lastNotifTime < 2000) return;
        lastNotifTime = Date.now();
        sendDesktopNotification(title, body);
    }

    // Amélioration 31: Sauvegarde automatique des logs côté client
    function saveLogsToFile() {
        const blob = new Blob([allLogs.join('\n')], {type:'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mcpanel_logs_' + (new Date()).toISOString().replace(/[:.]/g,'-') + '.txt';
        a.click();
    }

    // Amélioration 32: Nettoyage périodique du cache
    setInterval(() => {
        for (const k in dataCache) {
            if (dataCache[k] && Date.now() - (dataCache.lastUpdate[k]||0) > CACHE_DURATION*2) {
                dataCache[k] = null;
            }
        }
    }, 60000);

    // Amélioration 33: Mode compact automatique sur mobile
    if (window.innerWidth < 600) userPreferences.compactMode = true;

    // Amélioration 34: Affichage du temps de réponse API
    async function timedFetch(url, options) {
        const t0 = performance.now();
        const res = await fetch(url, options);
        const t1 = performance.now();
        sessionStats.apiLastResponse = t1 - t0;
        return res;
    }

    // Amélioration 35: Affichage du statut réseau
    window.addEventListener('online', () => showGlobalError('Connexion rétablie'));
    window.addEventListener('offline', () => showGlobalError('Connexion perdue'));

    // Amélioration 36: Limite de lignes dans la console
    function trimConsoleLogs(max = userPreferences.logMaxLines) {
        if (allLogs.length > max) allLogs = allLogs.slice(-max);
    }

    // Amélioration 37: Mode lecture seule pour la console
    let consoleReadOnly = false;

    // Amélioration 38: Affichage du nombre de joueurs connectés
    function updatePlayerCount(count) {
        const el = document.getElementById('player-count');
        if (el) el.textContent = count;
    }

    // Amélioration 39: Mode sombre automatique selon l'heure
    function autoDarkMode() {
        const h = new Date().getHours();
        document.body.classList.toggle('dark', h < 8 || h > 19);
    }
    setInterval(autoDarkMode, 60000);

    // Amélioration 40: Protection contre double clic sur boutons critiques
    function preventDoubleClick(btn) {
        btn.disabled = true;
        setTimeout(() => { btn.disabled = false; }, 1500);
    }

    // Amélioration 41: Affichage de la version du client
    function showClientVersion() {
        let el = document.getElementById('client-version');
        if (!el) {
            el = document.createElement('div');
            el.id = 'client-version';
            el.style = 'position:fixed;bottom:0;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'MCPanel Ultimate v2.0 - 2025-12-06';
    }
    showClientVersion();

    // Amélioration 42: Affichage du temps de session
    setInterval(() => {
        let el = document.getElementById('session-time');
        if (!el) {
            el = document.createElement('div');
            el.id = 'session-time';
            el.style = 'position:fixed;bottom:0;left:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        const d = Math.floor((Date.now() - sessionStats.startTime)/1000);
        el.textContent = 'Session: ' + Math.floor(d/60) + 'm' + (d%60) + 's';
    }, 10000);

    // Amélioration 43: Mode accessibilité (tabindex sur boutons)
    document.querySelectorAll('button').forEach(b => b.setAttribute('tabindex', '0'));

    // Amélioration 44: Focus automatique sur la console à l'ouverture
    window.addEventListener('load', () => {
        const c = document.getElementById('console-input');
        if (c) c.focus();
    });

    // Amélioration 45: Affichage du statut du tunnel dans le titre
    function updateTunnelStatusTitle(status) {
        document.title = 'MCPanel [' + status + ']';
    }

    // Amélioration 46: Affichage du ping serveur
    async function updateServerPing() {
        try {
            const t0 = Date.now();
            await fetch('/api/ping');
            const t1 = Date.now();
            let el = document.getElementById('server-ping');
            if (!el) {
                el = document.createElement('div');
                el.id = 'server-ping';
                el.style = 'position:fixed;top:0;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
                document.body.appendChild(el);
            }
            el.textContent = 'Ping: ' + (t1-t0) + 'ms';
        } catch {}
    }
    setInterval(updateServerPing, 15000);

    // Amélioration 47: Affichage du statut du backend
    async function updateBackendStatus() {
        try {
            await fetch('/api/status');
            document.body.classList.remove('backend-down');
        } catch {
            document.body.classList.add('backend-down');
        }
    }
    setInterval(updateBackendStatus, 20000);

    // Amélioration 48: Mode démo (lecture seule)
    let demoMode = false;

    // Amélioration 49: Affichage du nombre d'erreurs JS
    setInterval(() => {
        let el = document.getElementById('js-error-count');
        if (!el) {
            el = document.createElement('div');
            el.id = 'js-error-count';
            el.style = 'position:fixed;top:30px;right:0;background:#c00;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'JS Errors: ' + jsErrorLog.length;
    }, 12000);

    // Amélioration 50: Mode veille automatique (désactive les requêtes)
    let sleepMode = false;
    setInterval(() => {
        if (Date.now() - lastActivity > IDLE_TIMEOUT) sleepMode = true;
        else sleepMode = false;
    }, 10000);

    // Amélioration 51: Affichage du statut du cache
    function showCacheStatus() {
        let el = document.getElementById('cache-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cache-status';
            el.style = 'position:fixed;top:60px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Cache: ' + (dataCache.servers ? 'OK' : 'Vide');
    }

    // Amélioration 52: Affichage du nombre de notifications
    setInterval(() => {
        let el = document.getElementById('notif-count');
        if (!el) {
            el = document.createElement('div');
            el.id = 'notif-count';
            el.style = 'position:fixed;top:90px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Notifications: ' + sessionStats.notifications;
    }, 15000);

    // Amélioration 53: Affichage du nombre de commandes envoyées
    setInterval(() => {
        let el = document.getElementById('cmd-count');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cmd-count';
            el.style = 'position:fixed;top:120px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Cmds: ' + sessionStats.commandsSent;
    }, 15000);

    // Amélioration 54: Affichage du nombre d'appels API
    setInterval(() => {
        let el = document.getElementById('api-count');
        if (!el) {
            el = document.createElement('div');
            el.id = 'api-count';
            el.style = 'position:fixed;top:150px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'API: ' + sessionStats.apiCalls;
    }, 15000);

    // Amélioration 55: Affichage du nombre de joueurs en cache
    setInterval(() => {
        let el = document.getElementById('player-cache-count');
        if (!el) {
            el = document.createElement('div');
            el.id = 'player-cache-count';
            el.style = 'position:fixed;top:180px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Players cache: ' + Object.keys(cachedPlayers).length;
    }, 20000);

    // Amélioration 56: Affichage du statut du mode compact
    function showCompactStatus() {
        let el = document.getElementById('compact-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'compact-status';
            el.style = 'position:fixed;top:210px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Compact: ' + (userPreferences.compactMode ? 'Oui' : 'Non');
    }

    // Amélioration 57: Affichage du statut du mode sombre
    function showDarkStatus() {
        let el = document.getElementById('dark-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'dark-status';
            el.style = 'position:fixed;top:240px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Dark: ' + (document.body.classList.contains('dark') ? 'Oui' : 'Non');
    }

    // Amélioration 58: Affichage du statut du mode veille
    function showSleepStatus() {
        let el = document.getElementById('sleep-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'sleep-status';
            el.style = 'position:fixed;top:270px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Sleep: ' + (sleepMode ? 'Oui' : 'Non');
    }

    // Amélioration 59: Affichage du statut du mode démo
    function showDemoStatus() {
        let el = document.getElementById('demo-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'demo-status';
            el.style = 'position:fixed;top:300px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Démo: ' + (demoMode ? 'Oui' : 'Non');
    }

    // Amélioration 60: Affichage du statut du mode lecture seule
    function showReadOnlyStatus() {
        let el = document.getElementById('readonly-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'readonly-status';
            el.style = 'position:fixed;top:330px;right:0;background:#222;color:#fff;padding:2px 8px;font-size:12px;z-index:9999;opacity:0.7;';
            document.body.appendChild(el);
        }
        el.textContent = 'Lecture seule: ' + (consoleReadOnly ? 'Oui' : 'Non');
    }

// ================================
// Améliorations 61 à 100 : Fonctionnalités avancées
// ================================

// Amélioration 61: Système de confirmation pour actions critiques
function confirmAction(message, callback) {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
        <div class="confirm-content">
            <p>${message}</p>
            <button class="btn-confirm">Confirmer</button>
            <button class="btn-cancel">Annuler</button>
        </div>
    `;
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.querySelector('.confirm-content').style.cssText = 'background:#1e1e2e;padding:30px;border-radius:12px;text-align:center;';
    modal.querySelector('.btn-confirm').style.cssText = 'background:#4CAF50;color:#fff;border:none;padding:10px 20px;margin:10px;border-radius:6px;cursor:pointer;';
    modal.querySelector('.btn-cancel').style.cssText = 'background:#f44336;color:#fff;border:none;padding:10px 20px;margin:10px;border-radius:6px;cursor:pointer;';
    modal.querySelector('.btn-confirm').onclick = () => { modal.remove(); callback(); };
    modal.querySelector('.btn-cancel').onclick = () => modal.remove();
    document.body.appendChild(modal);
}

// Amélioration 62: Clipboard utility robuste
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copié !', 'success');
        return true;
    } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotification('Copié !', 'success');
        return true;
    }
}

// Amélioration 63: Export des données de session
function exportSessionData() {
    const data = {
        sessionStats,
        commandHistory,
        allLogs: allLogs.slice(-500),
        jsErrorLog,
        userPreferences,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mcpanel_session_' + Date.now() + '.json';
    a.click();
}

// Amélioration 64: Import des préférences
function importPreferences(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.userPreferences) {
                Object.assign(userPreferences, data.userPreferences);
                saveUserPreferences();
                showNotification('Préférences importées', 'success');
            }
        } catch {
            showNotification('Erreur d\'import', 'error');
        }
    };
    reader.readAsText(file);
}

// Amélioration 65: Système de thèmes personnalisés
const customThemes = {
    default: { bg: '#1e1e2e', text: '#fff', accent: '#8b5cf6' },
    ocean: { bg: '#0d1b2a', text: '#e0e1dd', accent: '#3a86ff' },
    forest: { bg: '#1b4332', text: '#d8f3dc', accent: '#40916c' },
    sunset: { bg: '#2d1b3d', text: '#ffeedd', accent: '#ff6b6b' }
};

function applyCustomTheme(themeName) {
    const theme = customThemes[themeName] || customThemes.default;
    document.documentElement.style.setProperty('--bg-primary', theme.bg);
    document.documentElement.style.setProperty('--text-primary', theme.text);
    document.documentElement.style.setProperty('--accent', theme.accent);
    localStorage.setItem('mcpanel_theme', themeName);
}

// Amélioration 66: Détection du type de serveur
function detectServerType(serverName) {
    const types = {
        paper: /paper/i,
        spigot: /spigot/i,
        bukkit: /bukkit/i,
        vanilla: /vanilla/i,
        forge: /forge/i,
        fabric: /fabric/i
    };
    for (const [type, regex] of Object.entries(types)) {
        if (regex.test(serverName)) return type;
    }
    return 'unknown';
}

// Amélioration 67: Formatage automatique des tailles
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Amélioration 68: Formatage automatique des durées
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return d + 'j ' + (h % 24) + 'h';
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    if (m > 0) return m + 'm ' + (s % 60) + 's';
    return s + 's';
}

// Amélioration 69: Détection des patterns d'erreur dans les logs
const errorPatterns = [
    /\[ERROR\]/i,
    /\[SEVERE\]/i,
    /\[FATAL\]/i,
    /Exception/i,
    /Error:/i,
    /Failed to/i,
    /Could not/i,
    /Unable to/i
];

function isErrorLine(line) {
    return errorPatterns.some(p => p.test(line));
}

// Amélioration 70: Compteur d'erreurs dans les logs
function countLogErrors() {
    return allLogs.filter(isErrorLine).length;
}

// Amélioration 71: Extraction des IPs des joueurs
function extractPlayerIPs() {
    const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
    const ips = new Set();
    allLogs.forEach(line => {
        const matches = line.match(ipRegex);
        if (matches) matches.forEach(ip => ips.add(ip));
    });
    return Array.from(ips);
}

// Amélioration 72: Détection des crashes serveur
function detectCrashes() {
    const crashPatterns = [
        /server crashed/i,
        /OutOfMemoryError/i,
        /StackOverflowError/i,
        /server is stopping/i
    ];
    return allLogs.filter(line => crashPatterns.some(p => p.test(line)));
}

// Amélioration 73: Système de bookmarks pour les logs
let logBookmarks = [];

function addLogBookmark(lineIndex, note = '') {
    logBookmarks.push({ index: lineIndex, note, time: Date.now() });
    localStorage.setItem('mcpanel_bookmarks', JSON.stringify(logBookmarks));
}

function loadLogBookmarks() {
    try {
        logBookmarks = JSON.parse(localStorage.getItem('mcpanel_bookmarks') || '[]');
    } catch { logBookmarks = []; }
}

// Amélioration 74: Recherche dans les logs
function searchLogs(query, caseSensitive = false) {
    const regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
    return allLogs.map((line, i) => ({ line, index: i })).filter(l => regex.test(l.line));
}

// Amélioration 75: Statistiques des logs
function getLogStats() {
    return {
        total: allLogs.length,
        errors: countLogErrors(),
        warnings: allLogs.filter(l => /\[WARN\]/i.test(l)).length,
        info: allLogs.filter(l => /\[INFO\]/i.test(l)).length,
        players: extractPlayerIPs().length
    };
}

// Amélioration 76: Système de macros personnalisées
let userMacros = {};

function saveMacro(name, commands) {
    userMacros[name] = commands;
    localStorage.setItem('mcpanel_macros', JSON.stringify(userMacros));
}

function loadMacros() {
    try {
        userMacros = JSON.parse(localStorage.getItem('mcpanel_macros') || '{}');
    } catch { userMacros = {}; }
}

function executeMacro(name) {
    const commands = userMacros[name];
    if (!commands) return;
    commands.forEach((cmd, i) => {
        setTimeout(() => sendCommand(cmd), i * 500);
    });
}

// Amélioration 77: Planification de commandes
let scheduledCommands = [];

function scheduleCommand(cmd, delayMs) {
    const id = setTimeout(() => {
        sendCommand(cmd);
        scheduledCommands = scheduledCommands.filter(s => s.id !== id);
    }, delayMs);
    scheduledCommands.push({ id, cmd, executeAt: Date.now() + delayMs });
}

function cancelScheduledCommand(id) {
    clearTimeout(id);
    scheduledCommands = scheduledCommands.filter(s => s.id !== id);
}

// Amélioration 78: Système de templates de serveur
const serverTemplates = {
    survival: { gamemode: 'survival', difficulty: 'normal', pvp: true },
    creative: { gamemode: 'creative', difficulty: 'peaceful', pvp: false },
    hardcore: { gamemode: 'survival', difficulty: 'hard', hardcore: true },
    minigames: { gamemode: 'adventure', difficulty: 'normal', pvp: true }
};

// Amélioration 79: Vérification de la version Minecraft
function parseMinecraftVersion(version) {
    const match = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3] || 0)
    };
}

// Amélioration 80: Comparaison de versions
function compareVersions(v1, v2) {
    const a = parseMinecraftVersion(v1);
    const b = parseMinecraftVersion(v2);
    if (!a || !b) return 0;
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

// Amélioration 81: Système de favoris serveurs
let favoriteServers = [];

function toggleFavoriteServer(serverName) {
    const idx = favoriteServers.indexOf(serverName);
    if (idx >= 0) favoriteServers.splice(idx, 1);
    else favoriteServers.push(serverName);
    localStorage.setItem('mcpanel_favservers', JSON.stringify(favoriteServers));
}

function loadFavoriteServers() {
    try {
        favoriteServers = JSON.parse(localStorage.getItem('mcpanel_favservers') || '[]');
    } catch { favoriteServers = []; }
}

// Amélioration 82: Tri intelligent des serveurs
function sortServers(servers, by = 'name') {
    const sorted = [...servers];
    switch (by) {
        case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'status': sorted.sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0)); break;
        case 'favorite': sorted.sort((a, b) => {
            const aFav = favoriteServers.includes(a.name);
            const bFav = favoriteServers.includes(b.name);
            return (bFav ? 1 : 0) - (aFav ? 1 : 0);
        }); break;
    }
    return sorted;
}

// Amélioration 83: Gestionnaire de ressources
const resourceManager = {
    images: new Map(),
    loadImage(url) {
        if (this.images.has(url)) return this.images.get(url);
        const img = new Image();
        img.src = url;
        this.images.set(url, img);
        return img;
    }
};

// Amélioration 84: Système de plugins favoriés
let favoritePlugins = [];

function toggleFavoritePlugin(pluginName) {
    const idx = favoritePlugins.indexOf(pluginName);
    if (idx >= 0) favoritePlugins.splice(idx, 1);
    else favoritePlugins.push(pluginName);
    localStorage.setItem('mcpanel_favplugins', JSON.stringify(favoritePlugins));
}

// Amélioration 85: Cache des informations plugins
const pluginCache = new Map();

function cachePluginInfo(name, info) {
    pluginCache.set(name, { info, cachedAt: Date.now() });
}

function getPluginFromCache(name, maxAge = 300000) {
    const cached = pluginCache.get(name);
    if (cached && Date.now() - cached.cachedAt < maxAge) return cached.info;
    return null;
}

// Amélioration 86: Système d'alertes personnalisées
let customAlerts = [];

function addCustomAlert(condition, message) {
    customAlerts.push({ condition, message, active: true });
    localStorage.setItem('mcpanel_alerts', JSON.stringify(customAlerts));
}

function checkCustomAlerts(data) {
    customAlerts.forEach(alert => {
        if (alert.active && alert.condition(data)) {
            showNotification(alert.message, 'warning');
        }
    });
}

// Amélioration 87: Moniteur de performance client
const clientPerformance = {
    fps: 0,
    lastFrame: 0,
    frames: 0
};

function measureFPS() {
    clientPerformance.frames++;
    const now = performance.now();
    if (now - clientPerformance.lastFrame >= 1000) {
        clientPerformance.fps = clientPerformance.frames;
        clientPerformance.frames = 0;
        clientPerformance.lastFrame = now;
    }
    requestAnimationFrame(measureFPS);
}
requestAnimationFrame(measureFPS);

// Amélioration 88: Détection des goulots d'étranglement
function detectBottlenecks() {
    const issues = [];
    if (clientPerformance.fps < 30) issues.push('FPS faible');
    if (jsErrorLog.length > 10) issues.push('Nombreuses erreurs JS');
    if (apiCallCount > 3) issues.push('API surchargée');
    return issues;
}

// Amélioration 89: Mode haute performance
let highPerfMode = false;

function toggleHighPerfMode() {
    highPerfMode = !highPerfMode;
    if (highPerfMode) {
        userPreferences.refreshInterval = 10000;
        document.body.classList.add('high-perf');
    } else {
        userPreferences.refreshInterval = 5000;
        document.body.classList.remove('high-perf');
    }
}

// Amélioration 90: Système de widgets personnalisables
let widgetLayout = [];

function saveWidgetLayout(layout) {
    widgetLayout = layout;
    localStorage.setItem('mcpanel_widgets', JSON.stringify(layout));
}

function loadWidgetLayout() {
    try {
        widgetLayout = JSON.parse(localStorage.getItem('mcpanel_widgets') || '[]');
    } catch { widgetLayout = []; }
}

// Amélioration 91: Gestionnaire de raccourcis personnalisés (étendu)
let userCustomShortcuts = {};

function setUserCustomShortcut(key, action) {
    userCustomShortcuts[key] = action;
    localStorage.setItem('mcpanel_user_shortcuts', JSON.stringify(userCustomShortcuts));
}

function loadUserCustomShortcuts() {
    try {
        userCustomShortcuts = JSON.parse(localStorage.getItem('mcpanel_user_shortcuts') || '{}');
    } catch { userCustomShortcuts = {}; }
}

// Amélioration 92: Système de notes par serveur
let serverNotes = {};

function saveServerNote(serverName, note) {
    serverNotes[serverName] = note;
    localStorage.setItem('mcpanel_notes', JSON.stringify(serverNotes));
}

function loadServerNotes() {
    try {
        serverNotes = JSON.parse(localStorage.getItem('mcpanel_notes') || '{}');
    } catch { serverNotes = {}; }
}

// Amélioration 93: Historique des actions
let actionHistory = [];

function logAction(action, details = {}) {
    actionHistory.push({
        action,
        details,
        time: Date.now()
    });
    if (actionHistory.length > 500) actionHistory.shift();
}

// Amélioration 94: Système d'undo/redo
const undoStack = [];
const redoStack = [];

function pushUndo(state) {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
}

function undo() {
    if (undoStack.length === 0) return null;
    const state = undoStack.pop();
    redoStack.push(state);
    return JSON.parse(state);
}

function redo() {
    if (redoStack.length === 0) return null;
    const state = redoStack.pop();
    undoStack.push(state);
    return JSON.parse(state);
}

// Amélioration 95: Validation des fichiers de configuration
function validateServerProperties(content) {
    const errors = [];
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        if (line.trim() && !line.startsWith('#') && !line.includes('=')) {
            errors.push({ line: i + 1, message: 'Format invalide' });
        }
    });
    return errors;
}

// Amélioration 96: Générateur de mot de passe RCON
function generateRconPassword(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Amélioration 97: Calcul du temps de fonctionnement
function calculateUptime(startTime) {
    if (!startTime) return 'N/A';
    return formatDuration(Date.now() - startTime);
}

// Amélioration 98: Système de backup automatique des préférences
setInterval(() => {
    const backup = {
        userPreferences,
        commandHistory,
        favoriteCommands,
        favoriteServers,
        serverNotes,
        userCustomShortcuts,
        timestamp: Date.now()
    };
    localStorage.setItem('mcpanel_backup_' + Date.now(), JSON.stringify(backup));
    // Nettoyer les vieux backups (garder les 5 derniers)
    const keys = Object.keys(localStorage).filter(k => k.startsWith('mcpanel_backup_')).sort();
    while (keys.length > 5) {
        localStorage.removeItem(keys.shift());
    }
}, 300000); // Toutes les 5 minutes

// Amélioration 99: Restauration depuis backup
function restoreFromBackup() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('mcpanel_backup_')).sort();
    if (keys.length === 0) {
        showNotification('Aucun backup disponible', 'warning');
        return;
    }
    const latestKey = keys[keys.length - 1];
    try {
        const backup = JSON.parse(localStorage.getItem(latestKey));
        Object.assign(userPreferences, backup.userPreferences || {});
        commandHistory = backup.commandHistory || [];
        favoriteCommands = backup.favoriteCommands || [];
        favoriteServers = backup.favoriteServers || [];
        serverNotes = backup.serverNotes || {};
        userCustomShortcuts = backup.userCustomShortcuts || {};
        saveUserPreferences();
        showNotification('Restauration réussie', 'success');
    } catch {
        showNotification('Erreur de restauration', 'error');
    }
}

// Amélioration 100: Indicateur de santé globale du système
function getSystemHealth() {
    let score = 100;
    if (!isOnline) score -= 30;
    if (jsErrorLog.length > 5) score -= jsErrorLog.length * 2;
    if (clientPerformance.fps < 30) score -= 20;
    if (sleepMode) score -= 10;
    if (apiCallCount > 3) score -= 15;
    score = Math.max(0, Math.min(100, score));
    
    let status = 'excellent';
    if (score < 90) status = 'good';
    if (score < 70) status = 'fair';
    if (score < 50) status = 'poor';
    if (score < 30) status = 'critical';
    
    return { score, status };
}

// Affichage de la santé système
setInterval(() => {
    const health = getSystemHealth();
    let el = document.getElementById('system-health');
    if (!el) {
        el = document.createElement('div');
        el.id = 'system-health';
        el.style = 'position:fixed;bottom:30px;right:10px;background:#222;color:#fff;padding:5px 12px;font-size:12px;z-index:9999;border-radius:12px;opacity:0.9;';
        document.body.appendChild(el);
    }
    const colors = { excellent: '#4CAF50', good: '#8BC34A', fair: '#FFC107', poor: '#FF9800', critical: '#f44336' };
    el.style.background = colors[health.status];
    el.textContent = '🏥 ' + health.score + '% - ' + health.status.toUpperCase();
}, 10000);

// Initialiser les systèmes au chargement
window.addEventListener('load', () => {
    loadLogBookmarks();
    loadMacros();
    loadFavoriteServers();
    loadWidgetLayout();
    loadUserCustomShortcuts();
    loadServerNotes();
});

// ================================

// VISUAL EFFECTS SYSTEM

// ================================



const visualSettings = {

    shader: 'none', // none, bloom, neon, chromatic, vignette, scanlines, rgb-split

    fullbright: false,

    upscaling: 'off' // off, quality, balanced, performance, ultra, fsr

};



function loadVisualSettings() {

    const saved = localStorage.getItem('mcpanel_visual');

    if (saved) {

        Object.assign(visualSettings, JSON.parse(saved));

    }

    applyVisualSettings();

}



function saveVisualSettings() {

    localStorage.setItem('mcpanel_visual', JSON.stringify(visualSettings));

    applyVisualSettings();

}



function applyVisualSettings() {

    const html = document.documentElement;

    

    // Shader

    html.removeAttribute('data-shader');

    if (visualSettings.shader !== 'none') {

        html.setAttribute('data-shader', visualSettings.shader);

    }

    

    // Fullbright

    html.setAttribute('data-fullbright', visualSettings.fullbright);

    

    // Upscaling

    html.removeAttribute('data-upscaling');

    if (visualSettings.upscaling !== 'off') {

        html.setAttribute('data-upscaling', visualSettings.upscaling);

    }

    

    // Update UI

    updateVisualUI();

}



function updateVisualUI() {

    // Shader buttons

    document.querySelectorAll('.shader-preset-btn').forEach(btn => {

        btn.classList.toggle('active', btn.dataset.shader === visualSettings.shader);

    });

    

    // Upscaling buttons

    document.querySelectorAll('.upscaling-btn').forEach(btn => {

        btn.classList.toggle('active', btn.dataset.upscaling === visualSettings.upscaling);

    });

    

    // Fullbright toggle

    const fullbrightToggle = document.getElementById('fullbright-toggle');

    if (fullbrightToggle) fullbrightToggle.checked = visualSettings.fullbright;

}



function setShaderPreset(shader) {

    visualSettings.shader = shader;

    saveVisualSettings();

    

    const shaderNames = {

        'none': 'Désactivé',

        'bloom': 'Bloom ✨',

        'neon': 'Néon 💡',

        'chromatic': 'Chromatique 🌈',

        'vignette': 'Vignette 🔲',

        'scanlines': 'CRT 📺',

        'rgb-split': 'RGB Split 🎮'

    };

    

    showToast(`Shader: ${shaderNames[shader] || shader}`, 'info');

    

    // Animation de transition

    document.body.style.animation = 'shader-transition 0.5s ease';

    setTimeout(() => document.body.style.animation = '', 500);

}



function toggleFullbright(enabled) {

    visualSettings.fullbright = enabled;

    saveVisualSettings();

    showToast(enabled ? '☀️ Fullbright activé' : '🌙 Fullbright désactivé', 'info');

}



function setUpscaling(mode) {

    visualSettings.upscaling = mode;

    saveVisualSettings();

    

    const modeNames = {

        'off': 'Désactivé',

        'quality': 'DLSS Qualité',

        'balanced': 'DLSS Équilibré',

        'performance': 'DLSS Performance',

        'ultra': 'DLSS Ultra Performance',

        'fsr': 'AMD FSR'

    };

    

    showToast(`Upscaling: ${modeNames[mode]}`, 'info');

}



function initVisualEffectsControls() {

    // Shader preset buttons

    document.querySelectorAll('.shader-preset-btn').forEach(btn => {

        btn.addEventListener('click', () => {

            setShaderPreset(btn.dataset.shader);

            

            // Animation de feedback

            btn.style.transform = 'scale(1.2)';

            setTimeout(() => btn.style.transform = '', 200);

        });

    });

    

    // Fullbright toggle

    const fullbrightToggle = document.getElementById('fullbright-toggle');

    if (fullbrightToggle) {

        fullbrightToggle.addEventListener('change', (e) => {

            toggleFullbright(e.target.checked);

        });

    }

    

    // Upscaling buttons

    document.querySelectorAll('.upscaling-btn').forEach(btn => {

        btn.addEventListener('click', () => {

            setUpscaling(btn.dataset.upscaling);

            

            // Animation de feedback

            btn.style.transform = 'scale(1.2)';

            setTimeout(() => btn.style.transform = '', 200);

        });

    });

    

    // Appliquer les paramètres chargés

    updateVisualUI();

}



// ================================

// PERFORMANCE SYSTEM

// ================================



const performanceSettings = {

    mode: 'balanced', // eco, balanced, gpu, no-gpu

    gpuEnabled: true,

    animationsEnabled: true,

    blurEnabled: true,

    refreshRate: 60000, // ms entre les rafraîchissements

    maxLogLines: 500,

    chartPoints: 20

};



function loadPerformanceSettings() {

    const saved = localStorage.getItem('mcpanel_performance');

    if (saved) {

        Object.assign(performanceSettings, JSON.parse(saved));

    }

    applyPerformanceMode();

}



function savePerformanceSettings() {

    localStorage.setItem('mcpanel_performance', JSON.stringify(performanceSettings));

    applyPerformanceMode();

}



function applyPerformanceMode() {

    const html = document.documentElement;

    

    // Supprimer les anciens modes

    html.removeAttribute('data-perf');

    

    // Appliquer le nouveau mode

    if (!performanceSettings.gpuEnabled) {

        html.setAttribute('data-perf', 'no-gpu');

    } else {

        html.setAttribute('data-perf', performanceSettings.mode);

    }

    

    // Ajuster les intervalles selon le mode

    switch(performanceSettings.mode) {

        case 'eco':

            performanceSettings.refreshRate = 120000; // 2 min

            performanceSettings.maxLogLines = 200;

            performanceSettings.chartPoints = 10;

            break;

        case 'balanced':

            performanceSettings.refreshRate = 60000; // 1 min

            performanceSettings.maxLogLines = 500;

            performanceSettings.chartPoints = 20;

            break;

        case 'gpu':

            performanceSettings.refreshRate = 30000; // 30s

            performanceSettings.maxLogLines = 1000;

            performanceSettings.chartPoints = 30;

            break;

    }

    

    // Mettre à jour l'intervalle des métriques

    if (metricsInterval) {

        clearInterval(metricsInterval);

        metricsInterval = setInterval(loadSystemMetrics, performanceSettings.refreshRate);

    }

    

    // Mettre à jour l'UI des paramètres

    updatePerformanceUI();

}



function updatePerformanceUI() {

    const gpuToggle = document.getElementById('gpu-toggle');

    

    if (gpuToggle) gpuToggle.checked = performanceSettings.gpuEnabled;

    

    // Mettre à jour les radio buttons

    const modeRadios = document.querySelectorAll('input[name="perf-mode"]');

    modeRadios.forEach(radio => {

        radio.checked = radio.value === performanceSettings.mode;

    });

}



function setPerformanceMode(mode) {

    performanceSettings.mode = mode;

    savePerformanceSettings();

    showToast(`Mode performance: ${mode.toUpperCase()}`, 'info');

}



function toggleGPU(enabled) {

    performanceSettings.gpuEnabled = enabled;

    savePerformanceSettings();

    showToast(enabled ? 'GPU activé' : 'GPU désactivé - Mode compatibilité', 'info');

}

// =====================================================
// API FETCH ROBUSTE - 50 CORRECTIONS
// =====================================================

// Correction 1: Timeout pour les requêtes
const API_TIMEOUT = 30000; // 30 secondes

// Correction 2: Retry automatique
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Correction 3: Queue de requêtes pour éviter les surcharges
const requestQueue = [];
let isProcessingQueue = false;

// Correction 4: Statistiques de requêtes
const apiStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTime: 0
};

// Correction 5: apiFetch robuste avec timeout, retry, et gestion d'erreurs
async function apiFetch(url, options = {}, retries = 0) {
    const startTime = performance.now();
    apiStats.totalRequests++;
    sessionStats.apiCalls++;
    
    // Vérifier la connexion
    if (!navigator.onLine) {
        sessionStats.errors++;
        throw new Error('Pas de connexion internet');
    }
    
    // Options par défaut
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Accept': 'application/json',
            ...options.headers
        }
    };
    
    // Créer un AbortController pour le timeout
    const controller = new AbortController();
    const timeout = options.timeout || API_TIMEOUT;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...defaultOptions,
            ...options,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Correction 6: Gérer les erreurs HTTP
        if (!response.ok) {
            // Correction 7: Session expirée
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Session expirée');
            }
            
            // Correction 8: Rate limiting
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || 5;
                await sleep(retryAfter * 1000);
                if (retries < MAX_RETRIES) {
                    return apiFetch(url, options, retries + 1);
                }
            }
            
            // Correction 9: Erreurs serveur (5xx) - retry
            if (response.status >= 500 && retries < MAX_RETRIES) {
                await sleep(RETRY_DELAY * (retries + 1));
                return apiFetch(url, options, retries + 1);
            }
        }
        
        apiStats.successfulRequests++;
        apiStats.totalTime += performance.now() - startTime;
        
        return response;
        
    } catch (error) {
        clearTimeout(timeoutId);
        apiStats.failedRequests++;
        sessionStats.errors++;
        
        // Correction 10: Timeout - retry
        if (error.name === 'AbortError') {
            console.warn(`Timeout pour ${url}`);
            if (retries < MAX_RETRIES) {
                await sleep(RETRY_DELAY);
                return apiFetch(url, options, retries + 1);
            }
            throw new Error('La requête a expiré');
        }
        
        // Correction 11: Erreur réseau - retry
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            if (retries < MAX_RETRIES) {
                await sleep(RETRY_DELAY * (retries + 1));
                return apiFetch(url, options, retries + 1);
            }
        }
        
        throw error;
    }
}

// Correction 12: Helper pour parser JSON de manière sécurisée
async function safeJsonParse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Réponse non-JSON:', text.substring(0, 200));
        throw new Error('Le serveur a renvoyé une réponse invalide (non-JSON)');
    }
    return response.json();
}

// Correction 13: Helper sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Correction 13: Gestion session expirée
function handleSessionExpired() {
    showToast('Session expirée, reconnexion...', 'warning');
    setTimeout(() => {
        window.location.href = '/login';
    }, 2000);
}

// Correction 14: Wrapper pour les requêtes JSON
async function apiJson(url, options = {}) {
    try {
        const response = await apiFetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erreur ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API Error (${url}):`, error);
        throw error;
    }
}

// Correction 15: Requête POST simplifiée
async function apiPost(url, data) {
    return apiJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

// Correction 16: Debounce amélioré
function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Correction 17: Throttle amélioré
function throttle(func, limit) {
    let inThrottle;
    let lastResult;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            lastResult = func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
        return lastResult;
    };
}

// Correction 18: Retry wrapper générique
async function withRetry(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await sleep(delay * (i + 1));
        }
    }
}

// Correction 19: Validation des données
function validateRequired(data, fields) {
    const missing = fields.filter(f => !data[f] && data[f] !== 0 && data[f] !== false);
    if (missing.length > 0) {
        throw new Error(`Champs requis manquants: ${missing.join(', ')}`);
    }
    return true;
}

// Correction 20: Sanitize input
function sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
}

// Correction 21: Escape HTML
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Correction 22: Format bytes
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Correction 23: Format duration
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// Correction 24: Parse server response safely
function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        console.warn('JSON parse error:', e);
        return null;
    }
}

// Correction 25: Local storage safe access
function safeGetItem(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn(`Error reading ${key}:`, e);
        return defaultValue;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.warn(`Error saving ${key}:`, e);
        return false;
    }
}

// Correction 26: Element existence check
function getEl(id) {
    return document.getElementById(id);
}

function getEls(selector) {
    return document.querySelectorAll(selector);
}

function safeSetText(id, text) {
    const el = getEl(id);
    if (el) el.textContent = text;
}

function safeSetHtml(id, html) {
    const el = getEl(id);
    if (el) el.innerHTML = html;
}

// Correction 27: Event listener safe add
function safeAddListener(el, event, handler, options) {
    if (typeof el === 'string') el = getEl(el);
    if (el && typeof el.addEventListener === 'function') {
        el.addEventListener(event, handler, options);
    }
}

// Correction 28: Remove listeners safely
function safeRemoveListener(el, event, handler) {
    if (typeof el === 'string') el = getEl(el);
    if (el && typeof el.removeEventListener === 'function') {
        el.removeEventListener(event, handler);
    }
}

// Correction 29: Interval management
const intervals = new Map();

function startInterval(name, fn, delay) {
    stopInterval(name);
    intervals.set(name, setInterval(fn, delay));
}

function stopInterval(name) {
    if (intervals.has(name)) {
        clearInterval(intervals.get(name));
        intervals.delete(name);
    }
}

function stopAllIntervals() {
    intervals.forEach((id, name) => {
        clearInterval(id);
    });
    intervals.clear();
}

// Correction 30: Animation frame manager
const animationFrames = new Map();

function startAnimation(name, fn) {
    stopAnimation(name);
    const animate = () => {
        fn();
        animationFrames.set(name, requestAnimationFrame(animate));
    };
    animationFrames.set(name, requestAnimationFrame(animate));
}

function stopAnimation(name) {
    if (animationFrames.has(name)) {
        cancelAnimationFrame(animationFrames.get(name));
        animationFrames.delete(name);
    }
}

// Correction 31: Copy to clipboard robuste
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast('Copié!', 'success');
            return true;
        }
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copié!', 'success');
        return true;
    } catch (e) {
        showToast('Erreur de copie', 'error');
        return false;
    }
}

// Correction 32: Scroll to element
function scrollToElement(el, options = {}) {
    if (typeof el === 'string') el = getEl(el);
    if (!el) return;
    
    el.scrollIntoView({
        behavior: options.smooth !== false ? 'smooth' : 'auto',
        block: options.block || 'center',
        inline: options.inline || 'nearest'
    });
}

// Correction 33: Check visible in viewport
function isInViewport(el) {
    if (typeof el === 'string') el = getEl(el);
    if (!el) return false;
    
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Correction 34: Create element helper
function createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    
    Object.entries(props).forEach(([key, value]) => {
        if (key === 'className') el.className = value;
        else if (key === 'innerHTML') el.innerHTML = value;
        else if (key === 'textContent') el.textContent = value;
        else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        }
        else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (key === 'dataset' && typeof value === 'object') {
            Object.entries(value).forEach(([k, v]) => el.dataset[k] = v);
        }
        else el.setAttribute(key, value);
    });
    
    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    });
    
    return el;
}

// Correction 35: Confirm dialog promise
function confirmDialog(message, title = 'Confirmation') {
    return new Promise(resolve => {
        const modal = createElement('div', { className: 'modal confirm-modal show' });
        modal.innerHTML = `
            <div class="modal-content confirm-content">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" data-action="cancel">Annuler</button>
                    <button class="btn btn-primary" data-action="confirm">Confirmer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action) {
                modal.remove();
                resolve(action === 'confirm');
            }
        });
    });
}

// Correction 36: Toast amélioré avec queue
const toastQueue = [];
let toastShowing = false;

function showToastQueued(message, type = 'info', duration = 3000) {
    toastQueue.push({ message, type, duration });
    processToastQueue();
}

function processToastQueue() {
    if (toastShowing || toastQueue.length === 0) return;
    
    toastShowing = true;
    const { message, type, duration } = toastQueue.shift();
    
    showToast(message, type);
    
    setTimeout(() => {
        toastShowing = false;
        processToastQueue();
    }, Math.min(duration, 1500));
}

// Correction 37: Loading state manager
const loadingStates = new Map();

function setLoading(name, isLoading = true) {
    loadingStates.set(name, isLoading);
    
    const btn = getEl(`btn-${name}`);
    if (btn) {
        btn.disabled = isLoading;
        if (isLoading) {
            btn.dataset.originalContent = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else if (btn.dataset.originalContent) {
            btn.innerHTML = btn.dataset.originalContent;
        }
    }
}

function isLoading(name) {
    return loadingStates.get(name) === true;
}

// Correction 38: Error boundary wrapper
async function safeExecute(fn, errorMessage = 'Une erreur est survenue') {
    try {
        return await fn();
    } catch (error) {
        console.error(errorMessage, error);
        showToast(`${errorMessage}: ${error.message}`, 'error');
        return null;
    }
}

// Correction 39: URL parameter helpers
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function setUrlParam(name, value) {
    const url = new URL(window.location.href);
    if (value === null || value === undefined) {
        url.searchParams.delete(name);
    } else {
        url.searchParams.set(name, value);
    }
    window.history.replaceState({}, '', url.toString());
}

// Correction 40: Date formatting
function formatDate(date, format = 'short') {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    
    if (format === 'short') return d.toLocaleDateString('fr-FR');
    if (format === 'long') return d.toLocaleDateString('fr-FR', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    if (format === 'time') return d.toLocaleTimeString('fr-FR');
    if (format === 'full') return d.toLocaleString('fr-FR');
    if (format === 'relative') return getRelativeTime(d);
    
    return d.toLocaleString('fr-FR');
}

function getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return formatDate(date, 'short');
}

// Correction 41: Number formatting
function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return '-';
    return Number(num).toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

// Correction 42: Percentage formatting
function formatPercent(value, decimals = 1) {
    if (value === null || value === undefined) return '-';
    return `${Number(value).toFixed(decimals)}%`;
}

// Correction 43: Clamp value
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Correction 44: Random ID generator
function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Correction 45: Deep clone
function deepClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.warn('Deep clone failed:', e);
        return obj;
    }
}

// Correction 46: Merge objects deep
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

// Correction 47: Event emitter simple
const eventBus = {
    listeners: {},
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    },
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => {
            try { cb(data); } catch (e) { console.error('Event handler error:', e); }
        });
    }
};

// Correction 48: Performance monitor
const perfMonitor = {
    marks: new Map(),
    
    start(name) {
        this.marks.set(name, performance.now());
    },
    
    end(name, log = false) {
        const start = this.marks.get(name);
        if (!start) return 0;
        
        const duration = performance.now() - start;
        this.marks.delete(name);
        
        if (log) console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
        return duration;
    }
};

// Correction 49: Browser feature detection
const browserFeatures = {
    clipboard: !!navigator.clipboard,
    notifications: 'Notification' in window,
    localStorage: (() => {
        try { localStorage.setItem('test', 'test'); localStorage.removeItem('test'); return true; }
        catch (e) { return false; }
    })(),
    webgl: (() => {
        try { 
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
        } catch (e) { return false; }
    })(),
    touch: 'ontouchstart' in window
};

// Correction 50: Global error handler amélioré
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', { message, source, lineno, colno, error });
    sessionStats.errors++;
    
    // Ne pas afficher les erreurs de ressources externes
    if (source && !source.includes(window.location.hostname)) return;
    
    showToast('Une erreur JavaScript est survenue', 'error');
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    sessionStats.errors++;
};

// Init

window.addEventListener('DOMContentLoaded', async () => {
    // Amélioration 21: Charger toutes les préférences en premier
    loadUserPreferences();
    loadPerformanceSettings();
    loadVisualSettings();
    
    // Amélioration 22: Setup des détections et raccourcis
    setupConnectionDetection();
    setupIdleDetection();
    setupGlobalShortcuts();
    requestNotificationPermission();
    
    await checkAuth();
    loadTheme();
    
    // Initialiser les contrôles d'effets visuels
    initVisualEffectsControls();
    
    await Promise.all([
        loadServerList(),
        loadVersions(),
        loadNotifications(),
        loadSystemMetrics()
    ]);
    
    startMetricsPolling();
    initCharts();
    
    // Amélioration 23: Afficher les infos de session
    console.log('🎮 MCPanel v2.0 loaded');
    console.log('💡 Raccourcis: F1-F5 onglets, Ctrl+S sauvegarder, ↑↓ historique, Tab autocomplétion');
    console.log(`📊 Session démarrée à ${new Date().toLocaleTimeString()}`);
});

// Auth



async function checkAuth() {

    try {

        const response = await apiFetch('/api/auth/user');

        if (response.status === 401) {

            window.location.href = '/login';

            return;

        }

        const data = await response.json();

        if (data.status === 'success') {

            currentUser = data.user;

            updateUserUI();

        }

    } catch (error) {

        console.error('Erreur auth:', error);

    }

}



function updateUserUI() {

    if (!currentUser) return;

    

    const userName = document.getElementById('user-name');

    const userRole = document.getElementById('user-role');

    

    if (userName) userName.textContent = currentUser.username;

    if (userRole) userRole.textContent = currentUser.role === 'admin' ? 'Administrateur' : 'Utilisateur';

    

    document.querySelectorAll('.admin-only').forEach(el => {

        el.style.display = currentUser.role === 'admin' ? '' : 'none';

    });

}



async function logout() {

    window.location.href = '/logout';

}



// ================================

// THEME

// ================================



function loadTheme() {

    const savedTheme = localStorage.getItem('theme') || 'dark';

    setTheme(savedTheme);

}



function setTheme(theme) {

    document.documentElement.setAttribute('data-theme', theme);

    localStorage.setItem('theme', theme);

    document.querySelectorAll('.theme-btn').forEach(btn => {

        btn.classList.toggle('active', btn.dataset.theme === theme);

    });

}



// ================================

// SECTIONS NAVIGATION

// ================================



function showSection(sectionName) {

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    const section = document.getElementById(`section-${sectionName}`);

    if (section) section.classList.add('active');

    

    document.querySelectorAll('.nav-item').forEach(item => {

        item.classList.toggle('active', item.dataset.section === sectionName);

    });

    

    if (sectionName === 'settings') loadSettings();

    if (sectionName === 'notifications') loadNotifications();

}



function openSettings() {

    showSection('settings');

}



// ================================

// SYSTEM METRICS - Optimized

// ================================



let metricsLoaded = false;

let lastMetricsUpdate = 0;



function startMetricsPolling() {

    loadSystemMetrics();

    // Utilise l'intervalle défini par les paramètres de performance

    metricsInterval = setInterval(loadSystemMetrics, performanceSettings.refreshRate);

}



async function loadSystemMetrics() {

    // Évite les appels trop fréquents

    const now = Date.now();

    if (now - lastMetricsUpdate < 5000) return;

    lastMetricsUpdate = now;

    

    try {

        const response = await apiFetch('/api/metrics/system');

        const data = await response.json();

        

        const cpuPercent = data.cpu?.percent || 0;

        const ramUsed = data.memory?.used_gb || 0;

        const ramTotal = data.memory?.total_gb || 0;

        const ramPercent = data.memory?.percent || 0;

        const diskUsed = data.disk?.used_gb || 0;

        const diskTotal = data.disk?.total_gb || 0;

        const diskPercent = data.disk?.percent || 0;

        

        // Batch DOM updates

        requestAnimationFrame(() => {

            updateElement('dash-cpu', cpuPercent.toFixed(1) + '%');

            updateElement('dash-ram', `${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GB`);

            updateElement('dash-disk', `${diskUsed.toFixed(0)} / ${diskTotal.toFixed(0)} GB`);

            updateElement('mini-cpu', cpuPercent.toFixed(0) + '%');

            updateElement('mini-ram', ramPercent.toFixed(0) + '%');

            updateElement('mini-disk', diskPercent.toFixed(0) + '%');

            

            const diskProgress = document.getElementById('disk-progress');

            if (diskProgress) diskProgress.style.width = diskPercent + '%';

        });

        

        // Limiter l'historique selon le mode de performance

        const time = new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});

        metricsHistory.cpu.push(cpuPercent);

        metricsHistory.ram.push(ramPercent);

        metricsHistory.timestamps.push(time);

        

        const maxHistory = performanceSettings.chartPoints;

        if (metricsHistory.cpu.length > maxHistory) {

            metricsHistory.cpu.shift();

            metricsHistory.ram.shift();

            metricsHistory.timestamps.shift();

        }

        

        if (metricsLoaded) {

            updateMainChart();

        } else {

            metricsLoaded = true;

            updateMainChart();

        }

    } catch (error) {

        console.error('Erreur metriques:', error);

    }

}



function updateElement(id, value) {

    const el = document.getElementById(id);

    if (el) el.textContent = value;

}



// ================================

// CHARTS

// ================================



function initCharts() {

    // Ne pas initialiser le chart en mode ECO

    if (performanceSettings.mode === 'eco') return;

    

    const mainCtx = document.getElementById('main-chart');

    if (!mainCtx || typeof Chart === 'undefined') return;

    

    // Désactiver les animations en mode balanced

    const animationConfig = performanceSettings.mode === 'balanced' ? 

        { duration: 0 } : { duration: 400, easing: 'easeOutQuart' };

    

    mainChart = new Chart(mainCtx, {

        type: 'line',

        data: {

            labels: [],

            datasets: [

                { 

                    label: 'CPU %', 

                    data: [], 

                    borderColor: '#3b82f6', 

                    backgroundColor: 'rgba(59, 130, 246, 0.08)', 

                    fill: true, 

                    tension: 0.3,

                    borderWidth: 2,

                    pointRadius: 0,

                    pointHoverRadius: 4

                },

                { 

                    label: 'RAM %', 

                    data: [], 

                    borderColor: '#10b981', 

                    backgroundColor: 'rgba(16, 185, 129, 0.08)', 

                    fill: true, 

                    tension: 0.3,

                    borderWidth: 2,

                    pointRadius: 0,

                    pointHoverRadius: 4

                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            animation: animationConfig,

            interaction: {

                intersect: false,

                mode: 'index'

            },

            plugins: { 

                legend: { 

                    position: 'top', 

                    labels: { color: '#666666', font: { size: 12 } } 

                } 

            },

            scales: {

                x: { 

                    grid: { color: 'rgba(255, 255, 255, 0.04)' }, 

                    ticks: { color: '#666666', maxTicksLimit: 8, font: { size: 10 } } 

                },

                y: { 

                    min: 0, 

                    max: 100, 

                    grid: { color: 'rgba(255, 255, 255, 0.04)' }, 

                    ticks: { color: '#666666', font: { size: 10 } } 

                }

            }

        }

    });

}



function updateMainChart() {

    if (!mainChart) return;

    mainChart.data.labels = metricsHistory.timestamps;

    mainChart.data.datasets[0].data = metricsHistory.cpu;

    mainChart.data.datasets[1].data = metricsHistory.ram;

    mainChart.update('none'); // 'none' désactive l'animation pour cette mise à jour

}



// ================================

// SERVER LIST

// ================================



let lastServerList = [];



async function loadServerList(forceRefresh = false) {

    try {

        const response = await apiFetch('/api/servers');

        const servers = await response.json();

        

        // Ne reconstruire le DOM que si la liste a change ou si forceRefresh

        const serversChanged = forceRefresh || JSON.stringify(servers) !== JSON.stringify(lastServerList);

        lastServerList = servers;

        

        // Sidebar - toujours mettre a jour car leger

        const serverList = document.getElementById('server-list');

        if (serverList && serversChanged) {

            if (servers.length === 0) {

                serverList.innerHTML = '<p class="no-servers">Aucun serveur</p>';

            } else {

                serverList.innerHTML = servers.map(server => `

                    <div class="server-item ${currentServer === server ? 'active' : ''}" onclick="selectServer('${server}')">

                        <i class="fas fa-server"></i>

                        <span>${server}</span>

                    </div>

                `).join('');

            }

        }

        

        // Dashboard table - seulement si change

        const serversTable = document.getElementById('servers-table');

        if (serversTable && serversChanged) {

            if (servers.length === 0) {

                serversTable.innerHTML = '<p class="empty-message">Aucun serveur. Crez-en un !</p>';

            } else {

                serversTable.innerHTML = `<table><thead><tr><th>Nom</th><th>Statut</th><th>Actions</th></tr></thead><tbody>

                    ${servers.map(server => `<tr><td><i class="fas fa-server"></i> ${server}</td><td><span class="status-dot-small" id="status-${server}"></span></td><td><button class="btn-table" onclick="selectServer('${server}')"><i class="fas fa-eye"></i></button></td></tr>`).join('')}

                </tbody></table>`;

            }

        }

        

        // Servers grid - seulement si change

        const serversGrid = document.getElementById('servers-grid');

        if (serversGrid && serversChanged) {

            if (servers.length === 0) {

                serversGrid.innerHTML = '<p class="empty-message">Aucun serveur. Crez-en un !</p>';

            } else {

                serversGrid.innerHTML = servers.map(server => `

                    <div class="server-card" onclick="selectServer('${server}')">

                        <div class="server-card-header"><i class="fas fa-server"></i><h3>${server}</h3></div>

                        <div class="server-card-status" id="card-status-${server}"><span class="status-dot offline"></span><span>Hors ligne</span></div>

                    </div>

                `).join('');

            }

        }

        

        // Mettre a jour les compteurs

        updateElement('dash-servers-total', servers.length);

        updateElement('dash-servers-online', 0);

        

        // Mettre a jour les statuts en arrie¨re-plan sans bloquer

        if (servers.length > 0) {

            updateAllServerStatuses(servers);

        }

    } catch (error) {

        console.error('Erreur chargement serveurs:', error);

    }

}



async function updateAllServerStatuses(servers) {

    let onlineCount = 0;

    for (const server of servers) {

        try {

            const statusRes = await apiFetch(`/api/server/${server}/status`);

            const status = await statusRes.json();

            const isOnline = status.running;

            if (isOnline) onlineCount++;

            

            // Mise a jour silencieuse des indicateurs

            const statusDot = document.getElementById(`status-${server}`);

            if (statusDot) statusDot.className = `status-dot-small ${isOnline ? 'online' : 'offline'}`;

            

            const cardStatus = document.getElementById(`card-status-${server}`);

            if (cardStatus) {

                cardStatus.innerHTML = `<span class="status-dot ${isOnline ? 'online' : 'offline'}"></span><span>${isOnline ? 'En ligne' : 'Hors ligne'}</span>`;

            }

        } catch (e) {}

    }

    updateElement('dash-servers-online', onlineCount);

}



function selectServer(serverName) {

    currentServer = serverName;

    showSection('servers');

    

    const listView = document.getElementById('servers-list-view');

    const detailView = document.getElementById('server-detail-view');

    const detailName = document.getElementById('detail-server-name');

    

    if (listView) listView.style.display = 'none';

    if (detailView) detailView.style.display = 'block';

    if (detailName) detailName.textContent = serverName;

    

    // Mettre a jour l'adresse du serveur

    updateServerAddressDisplay(serverName, '25565');

    

    document.querySelectorAll('.server-item').forEach(item => {

        item.classList.toggle('active', item.textContent.trim() === serverName);

    });

    

    updateStatus();

    startStatusPolling();

    switchTab('console');

}



function showServersList() {

    currentServer = null;

    stopStatusPolling();

    stopLogStream();

    

    const listView = document.getElementById('servers-list-view');

    const detailView = document.getElementById('server-detail-view');

    

    if (listView) listView.style.display = 'block';

    if (detailView) detailView.style.display = 'none';

    

    document.querySelectorAll('.server-item').forEach(item => item.classList.remove('active'));

    // Ne pas recharger la liste automatiquement pour eviter les flashs

}



// ================================

// STATUS POLLING

// ================================



function startStatusPolling() {

    stopStatusPolling();

    // Mise a jour toutes les 30 secondes

    statusInterval = setInterval(updateStatus, 30000);

}



function stopStatusPolling() {

    if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }

}



async function updateStatus() {

    if (!currentServer) return;

    try {

        const response = await apiFetch(`/api/server/${currentServer}/status`);

        const status = await response.json();

        

        const badge = document.getElementById('detail-status');

        const statusText = document.getElementById('detail-status-text');

        const startBtn = document.getElementById('btn-start');

        const stopBtn = document.getElementById('btn-stop');

        const restartBtn = document.getElementById('btn-restart');

        

        if (status.running) {

            if (badge) badge.className = 'status-badge online';

            if (statusText) statusText.textContent = 'EN LIGNE';

            if (startBtn) startBtn.style.display = 'none';

            if (stopBtn) stopBtn.style.display = 'flex';

            if (restartBtn) restartBtn.disabled = false;

            updateElement('stat-cpu', (status.cpu || 0).toFixed(1) + '%');

            updateElement('stat-ram', (status.ram_mb || 0) + ' MB');

            updateElement('stat-players', status.players || '0');

            updateElement('stat-tps', status.tps || '20.0');

        } else {

            if (badge) badge.className = 'status-badge offline';

            if (statusText) statusText.textContent = 'HORS LIGNE';

            if (startBtn) startBtn.style.display = 'flex';

            if (stopBtn) stopBtn.style.display = 'none';

            if (restartBtn) restartBtn.disabled = true;

            updateElement('stat-cpu', '0%');

            updateElement('stat-ram', '0 MB');

            updateElement('stat-players', '0');

            updateElement('stat-tps', '0');

        }

    } catch (error) { console.error('Erreur statut:', error); }

}



// ================================

// SERVER ACTIONS

// ================================



async function serverAction(action) {

    if (!currentServer) return;

    try {

        showToast('info', `${action === 'start' ? 'Demarrage' : action === 'stop' ? 'Arreªt' : 'Redemarrage'} en cours...`);

        const response = await apiFetch(`/api/server/${currentServer}/${action}`, { 

            method: 'POST',

            credentials: 'include'

        });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', result.message || 'Action effectue');

            setTimeout(updateStatus, 1000);

        } else {

            showToast('error', result.message || 'Action echoue');

        }

    } catch (error) {

        console.error('Erreur action:', error);

        showToast('error', 'Erreur lors de l\'action');

    }

}



async function backupServer() {

    if (!currentServer) return;

    try {

        showToast('info', 'Creation de la sauvegarde...');

        const response = await apiFetch(`/api/server/${currentServer}/backup`, { method: 'POST' });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', 'Sauvegarde cree');

            const backupsView = document.getElementById('view-backups');

            if (backupsView && backupsView.classList.contains('active')) loadBackups();

        } else {

            showToast('error', result.message || 'Erreur sauvegarde');

        }

    } catch (error) {

        console.error('Erreur backup:', error);

        showToast('error', 'Erreur lors de la sauvegarde');

    }

}



async function deleteServer() {

    if (!currentServer) return;

    if (!confirm(`Supprimer le serveur "${currentServer}" ?\n\nCette action est irreversible !`)) return;

    

    const serverToDelete = currentServer;

    

    try {

        showToast('info', 'Suppression en cours...');

        const response = await apiFetch(`/api/server/${serverToDelete}`, { method: 'DELETE' });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', 'Serveur supprime');

            // Reset current server

            currentServer = null;

            // Reset lastServerList pour forcer le refresh

            lastServerList = [];

            // Recharger la liste des serveurs avec force refresh

            await loadServerList(true);

            // Retourner a la vue liste

            showServersList();

        } else {

            showToast('error', result.message || 'Erreur suppression');

        }

    } catch (error) {

        console.error('Erreur suppression:', error);

        showToast('error', 'Erreur lors de la suppression');

    }

}



// ================================

// TABS

// ================================



function switchTab(viewName) {

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    

    const view = document.getElementById(`view-${viewName}`);

    const tab = document.querySelector(`.tab[data-view="${viewName}"]`);

    if (view) view.classList.add('active');

    if (tab) tab.classList.add('active');

    

    if (viewName === 'console') startLogStream();

    else stopLogStream();

    

    if (viewName === 'players') loadPlayers();

    if (viewName === 'plugins') loadInstalledPlugins();

    if (viewName === 'config') loadConfig();

    if (viewName === 'backups') loadBackups();

    if (viewName === 'stats') refreshServerStats();

}



// ================================

// CONSOLE

// ================================



function startLogStream() {

    stopLogStream();

    loadLogs();

    // Mise a jour des logs toutes les 5 secondes

    logInterval = setInterval(loadLogs, 5000);

}



function stopLogStream() {

    if (logInterval) { clearInterval(logInterval); logInterval = null; }

}



async function loadLogs() {

    if (!currentServer) return;

    try {

        const response = await apiFetch(`/api/server/${currentServer}/logs`);

        const data = await response.json();

        allLogs = data.logs || [];

        renderLogs();

    } catch (error) { console.error('Erreur logs:', error); }

}



// Optimized log rendering with virtual scrolling consideration

let logRenderPending = false;



function renderLogs() {

    if (logRenderPending) return;

    logRenderPending = true;

    

    requestAnimationFrame(() => {

        logRenderPending = false;

        

        const logsDiv = document.getElementById('logs');

        if (!logsDiv) return;

        

        const searchTerm = document.getElementById('log-search')?.value.toLowerCase() || '';

        

        let filteredLogs = allLogs.filter(line => {

            if (logFilter !== 'all') {

                if (logFilter === 'error' && !line.includes('ERROR') && !line.includes('SEVERE')) return false;

                if (logFilter === 'warn' && !line.includes('WARN')) return false;

                if (logFilter === 'info' && !line.includes('INFO')) return false;

            }

            if (searchTerm && !line.toLowerCase().includes(searchTerm)) return false;

            return true;

        });

        

        // Limiter le nombre de logs affichés pour les performances

        const maxLogs = performanceSettings.maxLogLines;

        if (filteredLogs.length > maxLogs) {

            filteredLogs = filteredLogs.slice(-maxLogs);

        }

        

        if (filteredLogs.length === 0) {

            logsDiv.innerHTML = '<div class="log-empty">Aucun log</div>';

            return;

        }

        

        // Utiliser DocumentFragment pour de meilleures performances

        const fragment = document.createDocumentFragment();

        filteredLogs.forEach(line => {

            const div = document.createElement('div');

            div.className = 'log-line';

            if (line.includes('ERROR') || line.includes('SEVERE')) div.className += ' error';

            else if (line.includes('WARN')) div.className += ' warning';

            else if (line.includes('INFO')) div.className += ' info';

            div.textContent = line;

            fragment.appendChild(div);

        });

        

        logsDiv.innerHTML = '';

        logsDiv.appendChild(fragment);

        

        if (autoScroll) logsDiv.scrollTop = logsDiv.scrollHeight;

    });

}



function filterLogs(filter) {

    logFilter = filter;

    document.querySelectorAll('.filter-btn').forEach(btn => {

        btn.classList.toggle('active', btn.dataset.filter === filter);

    });

    renderLogs();

}



// Debounce pour la recherche

let searchTimeout = null;

function searchLogs() {

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(renderLogs, 200);

}



function exportLogs() {

    if (allLogs.length === 0) { showToast('info', 'Aucun log a exporter'); return; }

    const blob = new Blob([allLogs.join('\n')], { type: 'text/plain' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `${currentServer}_logs_${new Date().toISOString().slice(0, 10)}.txt`;

    a.click();

    URL.revokeObjectURL(url);

    showToast('success', 'Logs exportes');

}



// Amélioration 24: handleCommandInput amélioré est défini plus haut

async function sendCommand() {
    if (!currentServer) return;
    const input = document.getElementById('cmd-input');
    const command = input.value.trim();
    if (!command) return;
    
    // Amélioration 25: Ajouter à l'historique
    if (command !== commandHistory[0]) {
        commandHistory.unshift(command);
        if (commandHistory.length > MAX_COMMAND_HISTORY) {
            commandHistory.pop();
        }
        saveCommandHistory();
    }
    commandHistoryIndex = -1;
    
    // Amélioration 26: Incrémenter les stats
    sessionStats.commandsSent++;
    sessionStats.apiCalls++;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const result = await response.json();
        if (result.status === 'success') {
            input.value = '';
            
            // Amélioration 27: Afficher la commande dans la console
            appendCommandToConsole(command);
            
            setTimeout(loadLogs, 500);
        } else {
            showToast('error', result.message || 'Erreur');
        }
    } catch (error) {
        console.error('Erreur commande:', error);
        sessionStats.errors++;
        showToast('error', 'Erreur envoi commande');
    }
}

// Amélioration 28: Afficher la commande envoyée dans la console
function appendCommandToConsole(command) {
    const logsDiv = document.getElementById('logs');
    if (logsDiv) {
        const cmdLine = document.createElement('div');
        cmdLine.className = 'log-line log-command';
        cmdLine.innerHTML = `<span class="cmd-prompt-inline">></span> ${escapeHtml(command)}`;
        logsDiv.appendChild(cmdLine);
        if (autoScroll) {
            logsDiv.scrollTop = logsDiv.scrollHeight;
        }
    }
}

// Amélioration 29: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================================

// PLAYERS

// ================================



let currentPlayerName = null;
let currentPlayerUUID = null;
let onlinePlayersCache = []; // Liste des joueurs en ligne

async function loadPlayers() {
    if (!currentServer) return;
    
    sessionStats.apiCalls++;
    
    try {
        // Récupérer les joueurs en ligne via RCON ou logs
        let onlinePlayers = [];
        try {
            const onlineResp = await apiFetch(`/api/server/${currentServer}/online-players`);
            if (onlineResp.ok) {
                const contentType = onlineResp.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const onlineData = await onlineResp.json();
                    onlinePlayers = onlineData.players || [];
                }
            }
        } catch (e) {
            console.warn('Impossible de récupérer les joueurs en ligne:', e);
        }
        onlinePlayersCache = onlinePlayers.map(p => p.name ? p.name.toLowerCase() : p.toLowerCase());
        
        // Récupérer tous les joueurs (usercache.json)
        const response = await apiFetch(`/api/server/${currentServer}/players`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Réponse invalide');
        }
        
        const allPlayers = await response.json();
        const grid = document.getElementById('players-grid');
        if (!grid) return;
        
        // Mettre à jour le compteur
        const onlineCount = onlinePlayers.length;
        const totalCount = allPlayers ? allPlayers.length : 0;
        updatePlayerTabCount(onlineCount, totalCount);
        
        if (!allPlayers || allPlayers.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>Aucun joueur n'a encore rejoint ce serveur</p>
                    <small>Les joueurs apparaîtront ici après leur première connexion</small>
                </div>
            `;
            return;
        }
        
        // Cache des joueurs
        allPlayers.forEach(p => {
            cachedPlayers[p.name] = { ...p, lastSeen: Date.now() };
        });
        
        // Trier: en ligne d'abord, puis par nom
        const sortedPlayers = [...allPlayers].sort((a, b) => {
            const aOnline = isPlayerOnline(a.name);
            const bOnline = isPlayerOnline(b.name);
            if (aOnline && !bOnline) return -1;
            if (!aOnline && bOnline) return 1;
            return a.name.localeCompare(b.name);
        });
        
        grid.innerHTML = sortedPlayers.map(player => {
            const isOnline = isPlayerOnline(player.name);
            const statusClass = isOnline ? 'online' : 'offline';
            const statusIcon = isOnline ? 'circle' : 'circle';
            const statusColor = isOnline ? '#4CAF50' : '#666';
            const statusText = isOnline ? 'En ligne' : 'Hors ligne';
            
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
                    ${isOnline ? `
                        <button onclick="event.stopPropagation(); sendWhisperToPlayer('${player.name}')" title="Message" class="btn-small btn-success">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button onclick="event.stopPropagation(); playerAction('${player.name}', 'kick')" title="Kick" class="btn-small btn-warning">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'op')" title="OP" class="btn-small">
                        <i class="fas fa-crown"></i>
                    </button>
                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'ban')" title="Ban" class="btn-small btn-danger">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) { 
        console.error('Erreur joueurs:', error);
        sessionStats.errors++;
        
        const grid = document.getElementById('players-grid');
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

// Vérifier si un joueur est en ligne
function isPlayerOnline(playerName) {
    if (!playerName) return false;
    return onlinePlayersCache.includes(playerName.toLowerCase());
}

// Mettre à jour le compteur de joueurs dans l'onglet
function updatePlayerTabCount(onlineCount, totalCount) {
    const tab = document.querySelector('.tab[data-view="players"]');
    if (tab) {
        const icon = tab.querySelector('i');
        const iconHtml = icon ? icon.outerHTML : '<i class="fas fa-users"></i>';
        if (totalCount > 0) {
            tab.innerHTML = `${iconHtml} Joueurs <span class="badge-counter">${onlineCount}/${totalCount}</span>`;
        } else {
            tab.innerHTML = `${iconHtml} Joueurs`;
        }
    }
}

// Envoyer un message privé
function sendWhisperToPlayer(playerName) {
    const message = prompt(`Message à ${playerName}:`);
    if (message && message.trim()) {
        executeCommand(`tell ${playerName} ${message.trim()}`);
    }
}

// Exécuter une commande silencieuse
async function executeCommand(command) {
    if (!currentServer) return;
    
    try {
        await apiFetch(`/api/server/${currentServer}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
    } catch (error) {
        console.error('Erreur commande:', error);
    }
}

async function openPlayerModal(name, uuid) {
    currentPlayerName = name;
    currentPlayerUUID = uuid;
    
    // Mettre a jour le header du modal
    const avatar = document.getElementById('player-modal-avatar');
    const nameEl = document.getElementById('player-modal-name');
    const uuidEl = document.getElementById('player-modal-uuid');
    
    if (avatar) avatar.src = `https://mc-heads.net/body/${name}/100`;
    if (nameEl) nameEl.textContent = name;
    if (uuidEl) uuidEl.textContent = uuid || 'UUID inconnu';
    
    // Afficher le modal
    const modal = document.getElementById('player-modal');
    if (modal) modal.classList.add('show');
    
    // Charger les details du joueur
    await loadPlayerDetails(uuid);
}

function closePlayerModal() {
    const modal = document.getElementById('player-modal');
    if (modal) modal.classList.remove('show');

    currentPlayerName = null;

    currentPlayerUUID = null;

}



async function loadPlayerDetails(uuid) {

    if (!currentServer || !uuid) return;

    

    try {

        const response = await apiFetch(`/api/server/${currentServer}/player/${uuid}`);

        const data = await response.json();

        

        // Mettre à jour les stats avec interface interactive
        const healthValue = data.health || 20;
        const foodValue = data.food || 20;
        const xpLevel = data.xp_level || 0;
        
        // Barre de vie interactive
        const healthContainer = document.getElementById('player-health-container');
        if (healthContainer) {
            healthContainer.innerHTML = renderHealthBar(healthValue, currentPlayerName);
        } else {
            document.getElementById('player-health').textContent = healthValue;
        }
        
        // Barre de faim interactive
        const foodContainer = document.getElementById('player-food-container');
        if (foodContainer) {
            foodContainer.innerHTML = renderFoodBar(foodValue, currentPlayerName);
        } else {
            document.getElementById('player-food').textContent = foodValue;
        }

        document.getElementById('player-xp').textContent = xpLevel;

        document.getElementById('player-deaths').textContent = data.stats?.deaths || 0;

        document.getElementById('player-playtime').textContent = data.stats?.play_time || '0h 0m';

        

        if (data.position) {

            document.getElementById('player-pos').textContent = 

                `${data.position.x}, ${data.position.y}, ${data.position.z}`;

        } else {

            document.getElementById('player-pos').textContent = 'N/A';

        }

        

        // Afficher l'inventaire avec textures améliorées

        renderInventory('player-inventory', data.inventory || [], 36);

        renderInventory('player-enderchest', data.enderchest || [], 27);

        renderArmor(data.armor || [], data.offhand);

        

    } catch (error) {

        console.error('Erreur chargement details joueur:', error);

        showToast('error', 'Impossible de charger les details du joueur');

    }

}

/**
 * Rend la barre de vie interactive avec coeurs Minecraft
 */
function renderHealthBar(health, playerName) {
    const maxHealth = 20;
    const fullHearts = Math.floor(health / 2);
    const halfHeart = health % 2 === 1;
    const emptyHearts = Math.floor((maxHealth - health) / 2);
    
    let hearts = '';
    
    // Coeurs pleins
    for (let i = 0; i < fullHearts; i++) {
        hearts += '<span class="mc-heart full">❤</span>';
    }
    // Demi coeur
    if (halfHeart) {
        hearts += '<span class="mc-heart half">💔</span>';
    }
    // Coeurs vides
    for (let i = 0; i < emptyHearts; i++) {
        hearts += '<span class="mc-heart empty">🖤</span>';
    }
    
    const isOnline = isPlayerOnline(playerName);
    const disabledAttr = isOnline ? '' : 'disabled';
    const disabledClass = isOnline ? '' : 'disabled';
    
    return `
        <div class="mc-stat-bar health-bar">
            <div class="hearts-display">${hearts}</div>
            <div class="stat-controls">
                <button class="btn-stat-control btn-heal ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'health', -2)" title="Retirer 1 coeur" ${disabledAttr}>
                    <i class="fas fa-minus"></i>
                </button>
                <span class="stat-value">${health}/20</span>
                <button class="btn-stat-control btn-heal ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'health', 2)" title="Ajouter 1 coeur" ${disabledAttr}>
                    <i class="fas fa-plus"></i>
                </button>
                <button class="btn-stat-control btn-full-heal ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'health', 20)" title="Soigner complètement" ${disabledAttr}>
                    <i class="fas fa-heart"></i> Max
                </button>
            </div>
            ${!isOnline ? '<span class="stat-offline-notice">Joueur hors ligne</span>' : ''}
        </div>
    `;
}

/**
 * Rend la barre de faim interactive avec jambons Minecraft
 */
function renderFoodBar(food, playerName) {
    const maxFood = 20;
    const fullFood = Math.floor(food / 2);
    const halfFood = food % 2 === 1;
    const emptyFood = Math.floor((maxFood - food) / 2);
    
    let foodIcons = '';
    
    // Nourriture pleine
    for (let i = 0; i < fullFood; i++) {
        foodIcons += '<span class="mc-food full">🍖</span>';
    }
    // Demi nourriture
    if (halfFood) {
        foodIcons += '<span class="mc-food half">🍗</span>';
    }
    // Nourriture vide
    for (let i = 0; i < emptyFood; i++) {
        foodIcons += '<span class="mc-food empty">🦴</span>';
    }
    
    const isOnline = isPlayerOnline(playerName);
    const disabledAttr = isOnline ? '' : 'disabled';
    const disabledClass = isOnline ? '' : 'disabled';
    
    return `
        <div class="mc-stat-bar food-bar">
            <div class="food-display">${foodIcons}</div>
            <div class="stat-controls">
                <button class="btn-stat-control btn-food ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'food', -2)" title="Affamer" ${disabledAttr}>
                    <i class="fas fa-minus"></i>
                </button>
                <span class="stat-value">${food}/20</span>
                <button class="btn-stat-control btn-food ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'food', 2)" title="Nourrir" ${disabledAttr}>
                    <i class="fas fa-plus"></i>
                </button>
                <button class="btn-stat-control btn-full-food ${disabledClass}" onclick="modifyPlayerStat('${playerName}', 'food', 20)" title="Rassasier complètement" ${disabledAttr}>
                    <i class="fas fa-drumstick-bite"></i> Max
                </button>
            </div>
            ${!isOnline ? '<span class="stat-offline-notice">Joueur hors ligne</span>' : ''}
        </div>
    `;
}

/**
 * Modifie les stats d'un joueur (vie ou faim) via commande
 */
async function modifyPlayerStat(playerName, stat, amount) {
    if (!currentServer || !playerName) return;
    
    try {
        let command = '';
        
        if (stat === 'health') {
            if (amount === 20) {
                // Soigner complètement
                command = `effect give ${playerName} minecraft:instant_health 1 10`;
            } else if (amount > 0) {
                // Ajouter de la vie
                command = `effect give ${playerName} minecraft:instant_health 1 0`;
            } else {
                // Retirer de la vie
                command = `damage ${playerName} ${Math.abs(amount)}`;
            }
        } else if (stat === 'food') {
            if (amount === 20) {
                // Rassasier complètement
                command = `effect give ${playerName} minecraft:saturation 1 10`;
            } else if (amount > 0) {
                // Nourrir
                command = `effect give ${playerName} minecraft:saturation 1 0`;
            } else {
                // Affamer
                command = `effect give ${playerName} minecraft:hunger 5 1`;
            }
        }
        
        if (command) {
            const response = await apiFetch(`/api/server/${currentServer}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });
            
            if (response.ok) {
                showNotification(`${stat === 'health' ? 'Vie' : 'Faim'} modifiée pour ${playerName}`, 'success');
                // Recharger les détails du joueur après un délai
                setTimeout(() => loadPlayerDetails(currentPlayerUUID), 1000);
            } else {
                throw new Error('Commande échouée');
            }
        }
    } catch (error) {
        console.error('Erreur modification stat:', error);
        showNotification('Impossible de modifier les stats du joueur', 'error');
    }
}

/**
 * URLs des textures Minecraft avec fallbacks multiples
 */
const TEXTURE_SOURCES = [
    (id) => `https://mc.nerothe.com/img/1.21.1/${id}.png`,
    (id) => `https://minecraft-api.vercel.app/images/items/${id}.png`,
    (id) => `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/item/${id}.png`,
    (id) => `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/${id}.png`,
    (id) => `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.4/items/${id}.png`,
    (id) => `https://crafatar.com/renders/body/${id}?scale=4&overlay=true` // For player heads
];

// Cache pour éviter les requêtes répétées
const textureCache = new Map();
const failedTextures = new Set();

function getItemImageUrl(itemId) {
    // Clean up item ID
    const id = itemId.replace('minecraft:', '').toLowerCase();
    
    // Vérifier le cache
    if (textureCache.has(id)) {
        return textureCache.get(id);
    }
    
    // Retourner la première source (les fallbacks sont gérés par handleItemImageError)
    return TEXTURE_SOURCES[0](id);
}

function handleItemImageError(img, itemId) {
    const id = itemId.replace('minecraft:', '').toLowerCase();
    
    if (!img.dataset.fallbackIndex) {
        img.dataset.fallbackIndex = 1;
    }
    
    const idx = parseInt(img.dataset.fallbackIndex);
    if (idx < TEXTURE_SOURCES.length) {
        img.dataset.fallbackIndex = idx + 1;
        img.src = TEXTURE_SOURCES[idx](id);
    } else {
        // Afficher une icône par défaut avec le nom
        img.style.display = 'none';
        const parent = img.parentElement;
        if (parent && !parent.querySelector('.item-fallback')) {
            const fallback = document.createElement('div');
            fallback.className = 'item-fallback';
            fallback.innerHTML = `<i class="fas fa-cube"></i><span>${formatItemName(id).substring(0, 8)}</span>`;
            parent.appendChild(fallback);
        }
    }
}

/**
 * Rend l'inventaire d'un joueur avec grille Minecraft style
 * @param {string} containerId - ID du conteneur HTML
 * @param {Array} items - Liste des items {slot, id, count}
 * @param {number} slots - Nombre total de slots (36 pour inventaire, 27 pour enderchest)
 */
function renderInventory(containerId, items, slots) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Map des items par slot
    const itemMap = new Map();
    let totalItems = 0;
    
    items.forEach(item => {
        itemMap.set(item.slot, item);
        totalItems += item.count || 1;
    });
    
    const invType = containerId.includes('enderchest') ? 'enderchest' : 'inventory';
    const usedSlots = items.length;
    
    // Construction du HTML
    let slotsHtml = '';
    for (let i = 0; i < slots; i++) {
        const item = itemMap.get(i);
        if (item) {
            const itemName = formatItemName(item.id);
            slotsHtml += `
                <div class="inv-slot has-item" title="${itemName} x${item.count}">
                    <img src="${getItemImageUrl(item.id)}" 
                         onerror="handleItemImageError(this, '${item.id}')"
                         alt="${itemName}">
                    ${item.count > 1 ? `<span class="item-count">${item.count}</span>` : ''}
                </div>`;
        } else {
            slotsHtml += '<div class="inv-slot"></div>';
        }
    }
    
    container.innerHTML = `
        <div class="inventory-header">
            <span class="inventory-count">
                <i class="fas fa-box"></i> ${usedSlots}/${slots} slots • ${totalItems} items
            </span>
            <button class="btn-add-item" onclick="openAddItemModal('${invType}')">
                <i class="fas fa-plus"></i> Ajouter
            </button>
        </div>
        <div class="inventory-grid">${slotsHtml}</div>
    `;
}

/**
 * Ouvre le modal pour ajouter un item
 */
function openAddItemModal(invType, slot = null) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('add-item-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-item-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content modal-medium">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> Ajouter un item</h3>
                    <button class="btn-close" onclick="closeAddItemModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="add-item-form">
                        <div class="form-group">
                            <label>Rechercher un item</label>
                            <div class="search-input-wrapper">
                                <i class="fas fa-search"></i>
                                <input type="text" id="item-search-input" 
                                       placeholder="Ex: diamond_sword, netherite_pickaxe..."
                                       oninput="searchMinecraftItems(this.value)">
                            </div>
                        </div>
                        
                        <div class="item-categories">
                            <button class="category-btn active" onclick="filterItemCategory('all', this)">Tous</button>
                            <button class="category-btn" onclick="filterItemCategory('weapons', this)">Armes</button>
                            <button class="category-btn" onclick="filterItemCategory('tools', this)">Outils</button>
                            <button class="category-btn" onclick="filterItemCategory('armor', this)">Armure</button>
                            <button class="category-btn" onclick="filterItemCategory('blocks', this)">Blocs</button>
                            <button class="category-btn" onclick="filterItemCategory('food', this)">Nourriture</button>
                            <button class="category-btn" onclick="filterItemCategory('misc', this)">Divers</button>
                        </div>
                        
                        <div class="items-grid" id="items-search-results">
                            <!-- Items seront affichés ici -->
                        </div>
                        
                        <div class="selected-item-preview" id="selected-item-preview" style="display: none;">
                            <div class="preview-content">
                                <img id="preview-item-img" src="" alt="">
                                <div class="preview-info">
                                    <strong id="preview-item-name"></strong>
                                    <span id="preview-item-id"></span>
                                </div>
                            </div>
                            <div class="quantity-selector">
                                <label>Quantité:</label>
                                <button class="qty-btn" onclick="adjustItemQuantity(-10)">-10</button>
                                <button class="qty-btn" onclick="adjustItemQuantity(-1)">-</button>
                                <input type="number" id="item-quantity" value="1" min="1" max="64">
                                <button class="qty-btn" onclick="adjustItemQuantity(1)">+</button>
                                <button class="qty-btn" onclick="adjustItemQuantity(10)">+10</button>
                                <button class="qty-btn qty-max" onclick="setItemQuantity(64)">64</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeAddItemModal()">Annuler</button>
                    <button class="btn-primary" id="btn-give-item" onclick="giveItemToPlayer()" disabled>
                        <i class="fas fa-gift"></i> Donner l'item
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Stocker le type d'inventaire et le slot
    modal.dataset.invType = invType;
    modal.dataset.slot = slot !== null ? slot : '';
    
    // Afficher le modal
    modal.classList.add('show');
    
    // Charger les items populaires par défaut
    loadPopularItems();
    
    // Focus sur la recherche
    setTimeout(() => {
        document.getElementById('item-search-input').focus();
    }, 100);
}

/**
 * Ferme le modal d'ajout d'item
 */
function closeAddItemModal() {
    const modal = document.getElementById('add-item-modal');
    if (modal) {
        modal.classList.remove('show');
        // Reset
        document.getElementById('item-search-input').value = '';
        document.getElementById('selected-item-preview').style.display = 'none';
        document.getElementById('btn-give-item').disabled = true;
        selectedItemToGive = null;
    }
}

// Item sélectionné pour donner
let selectedItemToGive = null;

/**
 * Liste des items Minecraft populaires par catégorie
 */
const MINECRAFT_ITEMS = {
    weapons: [
        'diamond_sword', 'netherite_sword', 'iron_sword', 'golden_sword', 'stone_sword', 'wooden_sword',
        'bow', 'crossbow', 'trident', 'mace'
    ],
    tools: [
        'diamond_pickaxe', 'netherite_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'stone_pickaxe',
        'diamond_axe', 'netherite_axe', 'iron_axe', 'diamond_shovel', 'netherite_shovel',
        'diamond_hoe', 'netherite_hoe', 'shears', 'flint_and_steel', 'fishing_rod'
    ],
    armor: [
        'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',
        'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots',
        'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots',
        'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots',
        'elytra', 'shield', 'turtle_helmet'
    ],
    blocks: [
        'diamond_block', 'netherite_block', 'iron_block', 'gold_block', 'emerald_block',
        'obsidian', 'crying_obsidian', 'glowstone', 'sea_lantern', 'beacon',
        'tnt', 'end_crystal', 'respawn_anchor', 'enchanting_table', 'anvil'
    ],
    food: [
        'golden_apple', 'enchanted_golden_apple', 'cooked_beef', 'cooked_porkchop',
        'golden_carrot', 'bread', 'cake', 'cookie', 'pumpkin_pie', 'suspicious_stew'
    ],
    misc: [
        'ender_pearl', 'eye_of_ender', 'blaze_rod', 'nether_star', 'dragon_egg',
        'totem_of_undying', 'elytra', 'firework_rocket', 'experience_bottle', 'name_tag',
        'diamond', 'netherite_ingot', 'emerald', 'lapis_lazuli', 'redstone'
    ]
};

/**
 * Charge les items populaires
 */
function loadPopularItems() {
    const container = document.getElementById('items-search-results');
    if (!container) return;
    
    // Afficher tous les items populaires
    const allItems = [
        ...MINECRAFT_ITEMS.weapons.slice(0, 4),
        ...MINECRAFT_ITEMS.tools.slice(0, 4),
        ...MINECRAFT_ITEMS.armor.slice(0, 4),
        ...MINECRAFT_ITEMS.food.slice(0, 4),
        ...MINECRAFT_ITEMS.misc.slice(0, 4)
    ];
    
    displayItemsGrid(allItems);
}

/**
 * Filtre les items par catégorie
 */
function filterItemCategory(category, btn) {
    // Update active button
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    let items;
    if (category === 'all') {
        items = [
            ...MINECRAFT_ITEMS.weapons,
            ...MINECRAFT_ITEMS.tools,
            ...MINECRAFT_ITEMS.armor,
            ...MINECRAFT_ITEMS.food,
            ...MINECRAFT_ITEMS.misc
        ];
    } else {
        items = MINECRAFT_ITEMS[category] || [];
    }
    
    displayItemsGrid(items);
}

/**
 * Recherche des items Minecraft
 */
function searchMinecraftItems(query) {
    if (!query || query.length < 2) {
        loadPopularItems();
        return;
    }
    
    const searchTerm = query.toLowerCase().replace(/\s+/g, '_');
    const allItems = [
        ...MINECRAFT_ITEMS.weapons,
        ...MINECRAFT_ITEMS.tools,
        ...MINECRAFT_ITEMS.armor,
        ...MINECRAFT_ITEMS.blocks,
        ...MINECRAFT_ITEMS.food,
        ...MINECRAFT_ITEMS.misc
    ];
    
    const filtered = allItems.filter(item => item.includes(searchTerm));
    
    // Si pas de résultat dans la liste, permettre l'entrée manuelle
    if (filtered.length === 0) {
        displayItemsGrid([searchTerm], true);
    } else {
        displayItemsGrid(filtered);
    }
}

/**
 * Affiche la grille d'items
 */
function displayItemsGrid(items, isCustom = false) {
    const container = document.getElementById('items-search-results');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<div class="no-items">Aucun item trouvé</div>';
        return;
    }
    
    let html = '';
    items.forEach(item => {
        const itemName = formatItemName(item);
        html += `
            <div class="item-option ${isCustom ? 'custom-item' : ''}" 
                 onclick="selectItemToGive('${item}')"
                 title="${itemName}">
                <img src="${getItemImageUrl(item)}" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                     alt="${itemName}">
                <div class="item-fallback-icon" style="display:none;">
                    <i class="fas fa-cube"></i>
                </div>
                <span class="item-option-name">${itemName}</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Sélectionne un item à donner
 */
function selectItemToGive(itemId) {
    selectedItemToGive = itemId;
    
    // Afficher la preview
    const preview = document.getElementById('selected-item-preview');
    preview.style.display = 'flex';
    
    document.getElementById('preview-item-img').src = getItemImageUrl(itemId);
    document.getElementById('preview-item-name').textContent = formatItemName(itemId);
    document.getElementById('preview-item-id').textContent = `minecraft:${itemId}`;
    document.getElementById('item-quantity').value = 1;
    
    // Activer le bouton
    document.getElementById('btn-give-item').disabled = false;
    
    // Highlight l'item sélectionné
    document.querySelectorAll('.item-option').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

/**
 * Ajuste la quantité d'item
 */
function adjustItemQuantity(delta) {
    const input = document.getElementById('item-quantity');
    let value = parseInt(input.value) + delta;
    value = Math.max(1, Math.min(64, value));
    input.value = value;
}

/**
 * Définit la quantité d'item
 */
function setItemQuantity(value) {
    document.getElementById('item-quantity').value = value;
}

/**
 * Donne l'item au joueur via commande
 */
async function giveItemToPlayer() {
    if (!selectedItemToGive || !currentPlayerName || !currentServer) {
        showToast('error', 'Erreur: informations manquantes');
        return;
    }
    
    const quantity = parseInt(document.getElementById('item-quantity').value) || 1;
    const command = `give ${currentPlayerName} minecraft:${selectedItemToGive} ${quantity}`;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        if (response.ok) {
            showToast('success', `${formatItemName(selectedItemToGive)} x${quantity} donné à ${currentPlayerName}`);
            closeAddItemModal();
            
            // Rafraîchir l'inventaire après un délai
            setTimeout(() => {
                if (currentPlayerUUID) {
                    loadPlayerDetails(currentPlayerUUID);
                }
            }, 1000);
        } else {
            throw new Error('Erreur commande');
        }
    } catch (error) {
        console.error('Erreur give item:', error);
        showToast('error', 'Impossible de donner l\'item');
    }
}

/**
 * Ouvre le menu contextuel pour un item
 */
function openItemContextMenu(event, invType, slot, itemId, count) {
    event.stopPropagation();
    
    // Supprimer ancien menu
    const oldMenu = document.getElementById('item-context-menu');
    if (oldMenu) oldMenu.remove();
    
    const itemName = formatItemName(itemId);
    
    const menu = document.createElement('div');
    menu.id = 'item-context-menu';
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="context-menu-header">
            <img src="${getItemImageUrl(itemId)}" alt="${itemName}">
            <div>
                <strong>${itemName}</strong>
                <span>x${count}</span>
            </div>
        </div>
        <div class="context-menu-actions">
            <button onclick="clearInventorySlot(${slot}, '${itemId}')">
                <i class="fas fa-trash"></i> Supprimer
            </button>
            <button onclick="giveMoreOfItem('${itemId}')">
                <i class="fas fa-plus"></i> En donner plus
            </button>
            <button onclick="copyItemCommand('${itemId}')">
                <i class="fas fa-copy"></i> Copier commande
            </button>
        </div>
    `;
    
    // Positionner le menu
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '10000';
    
    document.body.appendChild(menu);
    
    // Fermer au clic ailleurs
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

/**
 * Supprime un item du slot (via clear)
 */
async function clearInventorySlot(slot, itemId) {
    if (!currentPlayerName || !currentServer) return;
    
    const itemName = itemId.replace('minecraft:', '');
    const command = `clear ${currentPlayerName} ${itemId} 64`;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        if (response.ok) {
            showToast('success', `${formatItemName(itemName)} supprimé de l'inventaire`);
            
            // Fermer le menu contextuel
            const menu = document.getElementById('item-context-menu');
            if (menu) menu.remove();
            
            // Rafraîchir l'inventaire
            setTimeout(() => {
                if (currentPlayerUUID) {
                    loadPlayerDetails(currentPlayerUUID);
                }
            }, 500);
        }
    } catch (error) {
        showToast('error', 'Erreur lors de la suppression');
    }
}

/**
 * Donne plus d'un item existant
 */
function giveMoreOfItem(itemId) {
    const menu = document.getElementById('item-context-menu');
    if (menu) menu.remove();
    
    openAddItemModal('inventory');
    
    // Pré-sélectionner l'item
    setTimeout(() => {
        selectItemToGive(itemId.replace('minecraft:', ''));
    }, 200);
}

/**
 * Copie la commande give pour un item
 */
function copyItemCommand(itemId) {
    const command = `/give @p ${itemId} 1`;
    navigator.clipboard.writeText(command).then(() => {
        showToast('success', 'Commande copiée!');
    });
    
    const menu = document.getElementById('item-context-menu');
    if (menu) menu.remove();
}

function renderArmor(armor, offhand) {

    const container = document.getElementById('player-armor');

    if (!container) return;

    

    const armorSlots = [

        { slot: 103, name: 'Casque', icon: 'hard-hat' },

        { slot: 102, name: 'Plastron', icon: 'tshirt' },

        { slot: 101, name: 'Jambieres', icon: 'socks' },

        { slot: 100, name: 'Bottes', icon: 'shoe-prints' }

    ];

    

    const armorMap = {};

    armor.forEach(item => {

        armorMap[item.slot] = item;

    });

    

    let html = '';

    armorSlots.forEach(slot => {

        const item = armorMap[slot.slot];

        if (item) {

            const itemName = formatItemName(item.id);

            html += `

                <div class="armor-slot has-item" title="${itemName}">

                    <img src="${getItemImageUrl(item.id)}" 

                         onerror="handleItemImageError(this, '${item.id}')"

                         alt="${slot.name}">

                    <span>${slot.name}</span>

                </div>

            `;

        } else {

            html += `

                <div class="armor-slot">

                    <i class="fas fa-${slot.icon}"></i>

                    <span>${slot.name}</span>

                </div>

            `;

        }

    });

    

    // Offhand

    if (offhand) {

        const offhandName = formatItemName(offhand.id);

        html += `

            <div class="armor-slot has-item" title="${offhandName}">

                <img src="${getItemImageUrl(offhand.id)}" 

                     onerror="handleItemImageError(this, '${offhand.id}')"

                     alt="Offhand">

                <span>Seconde main</span>

            </div>

        `;

    } else {

        html += `

            <div class="armor-slot">

                <i class="fas fa-hand-paper"></i>

                <span>Seconde main</span>

            </div>

        `;

    }

    

    container.innerHTML = html;

}



function formatItemName(id) {

    return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

}



function switchInventoryTab(tab) {

    // Desactiver tous les onglets

    document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));

    document.querySelectorAll('.inventory-container').forEach(c => c.style.display = 'none');

    

    // Activer l'onglet selectionne

    event.target.closest('.inv-tab').classList.add('active');

    document.getElementById(`${tab}-view`).style.display = 'block';

}



async function playerAction(pseudo, action) {

    if (!currentServer) return;

    

    // Confirmation pour les actions dangereuses

    if (action === 'ban' && !confirm(`Voulez-vous vraiment bannir ${pseudo} ?`)) return;

    if (action === 'kick' && !confirm(`Voulez-vous vraiment expulser ${pseudo} ?`)) return;

    if (action === 'kill' && !confirm(`Voulez-vous vraiment tuer ${pseudo} ?`)) return;

    if (action === 'clear' && !confirm(`Voulez-vous vraiment vider l'inventaire de ${pseudo} ?`)) return;

    

    try {

        const response = await apiFetch(`/api/server/${currentServer}/player/action`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ pseudo, act: action })

        });

        const result = await response.json();

        if (result.status === 'success') {

            const actionNames = {

                'op': 'OP accorde e ',

                'deop': 'OP retire de',

                'kick': 'Expulse:',

                'ban': 'Banni:',

                'kill': 'Tue:',

                'clear': 'Inventaire vide:',

                'gm_s': 'Mode survie pour',

                'gm_c': 'Mode creatif pour'

            };

            showToast('success', `${actionNames[action] || action} ${pseudo}`);

            loadPlayers();

            

            // Recharger les details si le modal est ouvert

            if (currentPlayerUUID) {

                await loadPlayerDetails(currentPlayerUUID);

            }

        } else {

            showToast('error', result.message || 'Action echoue');

        }

    } catch (error) { 

        console.error('Erreur action joueur:', error);

        showToast('error', 'Erreur lors de l\'action');

    }

}



// ================================

// PLUGINS - Amélioré

// ================================

async function loadInstalledPlugins() {
    if (!currentServer) return;
    
    // Amélioration 36: Stats de session
    sessionStats.apiCalls++;
    
    const container = document.getElementById('installed-plugins');
    if (!container) {
        console.warn('Conteneur installed-plugins non trouvé');
        return;
    }
    
    // Afficher le loading
    container.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Chargement des plugins...</p>
        </div>
    `;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/plugins/installed`);
        
        // Vérifier le Content-Type avant de parser
        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) {
            console.error('Réponse non-JSON:', contentType);
            container.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erreur de chargement</p>
                    <small>Le serveur n'a pas retourné des données valides</small>
                </div>
            `;
            return;
        }
        
        const plugins = await response.json();
        
        // Amélioration 37: Mettre à jour le compteur dans l'onglet
        const pluginCount = Array.isArray(plugins) ? plugins.length : 0;
        updatePluginTabCount(pluginCount);
        
        if (!plugins || !Array.isArray(plugins) || plugins.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-puzzle-piece"></i>
                    <p>Aucun plugin installé</p>
                    <small>Recherchez des plugins ci-dessous</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = plugins.map(plugin => `
            <div class="plugin-card installed">
                <div class="plugin-info">
                    <div class="plugin-icon"><i class="fas fa-puzzle-piece"></i></div>
                    <div class="plugin-details">
                        <h4>${escapeHtml(plugin.name || 'Inconnu')}</h4>
                        <span class="plugin-meta">
                            <span class="plugin-size">${plugin.size_mb || 0} MB</span>
                            ${plugin.version ? `<span class="plugin-version">v${escapeHtml(plugin.version)}</span>` : ''}
                        </span>
                    </div>
                </div>
                <div class="plugin-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); reloadPlugin('${escapeHtml(plugin.name)}')" title="Recharger">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="btn-danger-sm" onclick="uninstallPlugin('${escapeHtml(plugin.name)}')" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) { 
        console.error('Erreur plugins:', error);
        sessionStats.errors++;
        container.innerHTML = `
            <div class="empty-state error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur de chargement</p>
                <small>${escapeHtml(error.message || 'Erreur inconnue')}</small>
            </div>
        `;
    }
}

// Amélioration 38: Mettre à jour le compteur de plugins
function updatePluginTabCount(count) {
    const tab = document.querySelector('.tab[data-view="plugins"]');
    if (tab) {
        const icon = tab.querySelector('i');
        const iconHtml = icon ? icon.outerHTML : '<i class="fas fa-puzzle-piece"></i>';
        tab.innerHTML = `${iconHtml} Plugins ${count > 0 ? `<span class="badge-counter">${count}</span>` : ''}`;
    }
}

// Amélioration 39: Recharger un plugin
async function reloadPlugin(pluginName) {
    if (!currentServer) return;
    
    try {
        // Envoyer la commande de reload
        await executeCommand(`plugman reload ${pluginName}`);
        showToast('success', `Plugin ${pluginName} rechargé`);
    } catch (error) {
        showToast('error', 'Erreur rechargement plugin');
    }
}

// Amélioration 40: Recherche de plugins avec debounce
const debouncedSearchPlugins = debounce(async () => {
    const query = document.getElementById('plugin-search')?.value.trim();
    if (query && query.length >= 3) {
        await searchPlugins();
    }
}, 500);

async function searchPlugins() {
    const query = document.getElementById('plugin-search')?.value.trim();
    if (!query) { showToast('info', 'Entrez un terme de recherche'); return; }
    
    sessionStats.apiCalls++;
    
    try {
        showToast('info', 'Recherche en cours...');
        const response = await apiFetch(`/api/plugins/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include'
        });
        const data = await response.json();
        const plugins = data.result || [];
        const container = document.getElementById('search-results');
        if (!container) return;
        
        if (plugins.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Aucun plugin trouvé pour "${escapeHtml(query)}"</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = plugins.map(plugin => `
            <div class="plugin-card search-result">
                <div class="plugin-info">
                    <div class="plugin-icon"><i class="fas fa-puzzle-piece"></i></div>
                    <div class="plugin-details">
                        <h4>${escapeHtml(plugin.name)}</h4>
                        <p class="plugin-desc">${escapeHtml(plugin.description || 'Pas de description')}</p>
                        <span class="plugin-meta">
                            <span><i class="fas fa-download"></i> ${plugin.stats?.downloads || 0}</span>
                            <span><i class="fas fa-star"></i> ${plugin.stats?.stars || 0}</span>
                        </span>
                    </div>
                </div>
                <button class="btn-primary-sm" onclick="installPlugin('${plugin.namespace?.owner || ''}/${plugin.namespace?.slug || plugin.name}', '${escapeHtml(plugin.name)}')" title="Installer">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `).join('');
        showToast('success', `${plugins.length} plugin(s) trouvé(s)`);

    } catch (error) {

        console.error('Erreur recherche:', error);

        showToast('error', 'Erreur de recherche');

    }

}



async function installPlugin(slug, name) {

    if (!currentServer) return;

    try {

        showToast('info', `Installation de ${name}...`);

        const response = await apiFetch(`/api/server/${currentServer}/plugins/install`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ slug })

        });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', `${name} installe`);

            loadInstalledPlugins();

        } else {

            showToast('error', result.message || 'Installation echoue');

        }

    } catch (error) {

        console.error('Erreur installation:', error);

        showToast('error', 'Erreur installation');

    }

}



async function uninstallPlugin(name) {

    if (!currentServer) return;

    if (!confirm(`Desinstaller ${name} ?`)) return;

    try {

        const response = await apiFetch(`/api/server/${currentServer}/plugins/uninstall`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ name })

        });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', `${name} desinstalle`);

            loadInstalledPlugins();

        } else {

            showToast('error', result.message || 'Erreur');

        }

    } catch (error) { console.error('Erreur desinstallation:', error); }

}



async function uploadPlugin(file) {

    if (!currentServer || !file) return;

    

    if (!file.name.endsWith('.jar')) {

        showToast('error', 'Le fichier doit eªtre un .jar');

        return;

    }

    

    try {

        showToast('info', `Upload de ${file.name}...`);

        

        const formData = new FormData();

        formData.append('plugin', file);

        

        const response = await apiFetch(`/api/server/${currentServer}/plugins/upload`, {

            method: 'POST',

            body: formData

        });

        

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', `${file.name} installe avec succe¨s`);

            loadInstalledPlugins();

        } else {

            showToast('error', result.message || 'Erreur upload');

        }

    } catch (error) {

        console.error('Erreur upload plugin:', error);

        showToast('error', 'Erreur lors de l\'upload');

    }

    

    // Reset input

    document.getElementById('plugin-upload').value = '';

}



// ================================

// CONFIGURATION - Améliorée
// ================================

// Amélioration 41: Traductions françaises des propriétés server.properties
const CONFIG_LABELS = {
    'motd': 'Message d\'accueil (MOTD)',
    'server-port': 'Port du serveur',
    'max-players': 'Nombre max de joueurs',
    'white-list': 'Liste blanche activée',
    'online-mode': 'Mode en ligne (anti-crack)',
    'pvp': 'Combat PvP activé',
    'difficulty': 'Difficulté du jeu',
    'gamemode': 'Mode de jeu par défaut',
    'allow-nether': 'Nether activé',
    'allow-end': 'End activé',
    'view-distance': 'Distance de vue (chunks)',
    'simulation-distance': 'Distance simulation (chunks)',
    'spawn-protection': 'Protection du spawn (blocs)',
    'level-seed': 'Seed du monde',
    'level-name': 'Nom du monde',
    'level-type': 'Type de monde',
    'allow-flight': 'Vol autorisé (anti-kick)',
    'enforce-whitelist': 'Forcer la whitelist',
    'spawn-monsters': 'Apparition des monstres',
    'spawn-animals': 'Apparition des animaux',
    'spawn-npcs': 'Apparition des PNJ',
    'hardcore': 'Mode Hardcore',
    'enable-command-block': 'Blocs de commande activés',
    'generate-structures': 'Génération des structures',
    'max-world-size': 'Taille max du monde',
    'player-idle-timeout': 'Timeout inactivité (min)',
    'op-permission-level': 'Niveau permission OP',
    'enable-rcon': 'RCON activé',
    'rcon.port': 'Port RCON',
    'rcon.password': 'Mot de passe RCON',
    'enable-query': 'Query activé',
    'query.port': 'Port Query',
    'server-ip': 'IP du serveur (vide = toutes)',
    'network-compression-threshold': 'Seuil compression réseau',
    'max-tick-time': 'Temps max par tick (ms)',
    'use-native-transport': 'Transport natif Linux',
    'prevent-proxy-connections': 'Bloquer les proxys',
    'enable-status': 'Statut serveur activé',
    'broadcast-console-to-ops': 'Console visible par OPs',
    'broadcast-rcon-to-ops': 'RCON visible par OPs',
    'function-permission-level': 'Niveau permission fonctions',
    'rate-limit': 'Limite de requêtes',
    'sync-chunk-writes': 'Écriture chunks synchrone',
    'resource-pack': 'URL du resource pack',
    'resource-pack-sha1': 'SHA1 du resource pack',
    'require-resource-pack': 'Resource pack obligatoire',
    'entity-broadcast-range-percentage': 'Portée diffusion entités (%)',
    'force-gamemode': 'Forcer le mode de jeu',
    'hide-online-players': 'Cacher joueurs en ligne'
};

async function loadConfig() {
    if (!currentServer) return;
    
    sessionStats.apiCalls++;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/config`);
        const config = await response.json();
        const grid = document.getElementById('config-grid');
        if (!grid) return;
        
        // Amélioration 42: Trier les clés alphabétiquement
        const sortedEntries = Object.entries(config).sort((a, b) => a[0].localeCompare(b[0]));
        
        grid.innerHTML = sortedEntries.map(([key, value]) => {
            const label = CONFIG_LABELS[key] || key;
            const inputId = `config-${key.replace(/\./g, '-')}`;
            const isBoolean = typeof value === 'boolean' || value === 'true' || value === 'false';
            const isNumber = !isNaN(value) && value !== '' && !isBoolean;
            
            // Amélioration 43: Types d'input adaptés
            if (isBoolean) {
                const checked = value === true || value === 'true';
                return `
                    <div class="config-item config-toggle">
                        <label class="config-label">
                            <span class="config-name">${label}</span>
                            <span class="config-key">${key}</span>
                        </label>
                        <label class="switch">
                            <input type="checkbox" id="${inputId}" data-key="${key}" ${checked ? 'checked' : ''}>
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
                // Amélioration 44: Textarea pour valeurs longues
                const isLong = key === 'motd' || String(value).length > 50;
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
        }).join('');
    } catch (error) { 
        console.error('Erreur config:', error);
        sessionStats.errors++;
    }
}

async function saveConfig() {
    if (!currentServer) return;
    
    sessionStats.apiCalls++;
    
    try {
        const config = {};
        
        // Amélioration 45: Récupérer inputs, checkboxes et textareas
        document.querySelectorAll('#config-grid input, #config-grid textarea').forEach(el => {
            const key = el.dataset.key;
            if (key) {
                if (el.type === 'checkbox') {
                    config[key] = el.checked;
                } else {
                    config[key] = el.value;
                }
            }
        });
        
        const response = await apiFetch(`/api/server/${currentServer}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            showToast('success', 'Configuration sauvegardée');
            playNotificationSound('success');
        } else {
            showToast('error', result.message || 'Erreur');
        }
    } catch (error) { 
        console.error('Erreur sauvegarde config:', error);
        sessionStats.errors++;
        showToast('error', 'Erreur sauvegarde');
    }
}

// ================================
// BACKUPS - Amélioré
// ================================

async function loadBackups() {
    if (!currentServer) return;
    
    sessionStats.apiCalls++;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/backups`);
        const backups = await response.json();

        const container = document.getElementById('backups-list');

        if (!container) return;

        

        if (!backups || backups.length === 0) {

            container.innerHTML = '<p class="empty-message">Aucune sauvegarde</p>';

            return;

        }

        

        container.innerHTML = backups.map(backup => `

            <div class="backup-item">

                <i class="fas fa-archive"></i>

                <div class="backup-info"><span class="backup-name">${backup.name}</span><span class="backup-date">${backup.date || 'N/A'}</span></div>

                <span class="backup-size">${backup.size || 'N/A'}</span>

                <div class="backup-actions">

                    <button class="btn-restore" onclick="restoreBackup('${backup.name}')" title="Restaurer">

                        <i class="fas fa-undo"></i>

                    </button>

                    <button class="btn-delete-backup" onclick="deleteBackup('${backup.name}')" title="Supprimer">

                        <i class="fas fa-trash"></i>

                    </button>

                </div>

            </div>

        `).join('');

    } catch (error) { console.error('Erreur backups:', error); }

}



async function deleteBackup(backupName) {

    if (!currentServer) return;

    if (!confirm(`Supprimer la sauvegarde "${backupName}" ?\n\nCette action est irreversible !`)) return;

    

    try {

        const response = await apiFetch(`/api/server/${currentServer}/backups/${encodeURIComponent(backupName)}`, {

            method: 'DELETE'

        });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', 'Sauvegarde supprime');

            loadBackups();

        } else {

            showToast('error', result.message || 'Erreur suppression');

        }

    } catch (error) {

        console.error('Erreur suppression backup:', error);

        showToast('error', 'Erreur lors de la suppression');

    }

}



async function restoreBackup(backupName) {

    if (!currentServer) return;

    if (!confirm(`Restaurer la sauvegarde "${backupName}" ?\n\nLe serveur sera arreªte et les fichiers actuels seront remplaces.`)) return;

    

    showToast('info', 'Restauration en cours...');

    try {

        const response = await apiFetch(`/api/server/${currentServer}/restore`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ backup: backupName })

        });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', 'Sauvegarde restaure');

        } else {

            showToast('error', result.message || 'Erreur restauration');

        }

    } catch (error) {

        console.error('Erreur restauration:', error);

        showToast('error', 'Erreur lors de la restauration');

    }

}



function openScheduleModal() { document.getElementById('schedule-modal')?.classList.add('show'); }

function closeScheduleModal() { document.getElementById('schedule-modal')?.classList.remove('show'); }



async function saveSchedule(event) {

    event.preventDefault();

    if (!currentServer) return;

    

    const config = {

        enabled: true,

        type: document.getElementById('schedule-type')?.value || 'daily',

        retention: parseInt(document.getElementById('schedule-retention')?.value || 7),

        compress: true

    };

    

    try {

        const response = await apiFetch(`/api/server/${currentServer}/schedule`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(config)

        });

        const result = await response.json();

        if (result.success) {

            showToast('success', 'Planification sauvegarde');

            closeScheduleModal();

        } else showToast('error', result.message || 'Erreur');

    } catch (error) { console.error('Erreur schedule:', error); }

}



// ================================

// NOTIFICATIONS

// ================================



async function loadNotifications() {

    try {

        const response = await apiFetch('/api/notifications');

        const data = await response.json();

        const notifications = data.notifications || [];

        const unreadCount = notifications.filter(n => !n.read).length;

        

        const badge = document.getElementById('notif-badge');

        if (badge) {

            badge.textContent = unreadCount;

            badge.style.display = unreadCount > 0 ? 'flex' : 'none';

        }

        

        const container = document.getElementById('notifications-list');

        if (container) {

            if (notifications.length === 0) {

                container.innerHTML = '<p class="empty-message">Aucune notification</p>';

            } else {

                container.innerHTML = notifications.map(n => `

                    <div class="notification-item ${n.read ? '' : 'unread'} ${n.severity || ''}">

                        <div class="notif-icon"><i class="fas fa-${getNotifIcon(n.type)}"></i></div>

                        <div class="notif-content"><strong>${n.title}</strong><p>${n.message}</p><span class="notif-time">${formatTime(n.timestamp)}</span></div>

                    </div>

                `).join('');

            }

        }

        

        const activityList = document.getElementById('activity-list');

        if (activityList) {

            const recent = notifications.slice(0, 5);

            if (recent.length === 0) {

                activityList.innerHTML = '<p class="empty-message">Aucune activite recente</p>';

            } else {

                activityList.innerHTML = recent.map(n => `

                    <div class="activity-item"><i class="fas fa-${getNotifIcon(n.type)} ${n.severity || ''}"></i><span>${n.title}</span><span class="time">${formatTime(n.timestamp)}</span></div>

                `).join('');

            }

        }

    } catch (error) { console.error('Erreur notifications:', error); }

}



function getNotifIcon(type) {

    const icons = { 'server_start': 'play-circle', 'server_stop': 'stop-circle', 'crash': 'exclamation-triangle', 'backup': 'download', 'alert': 'bell', 'info': 'info-circle' };

    return icons[type] || 'bell';

}



function formatTime(timestamp) {

    if (!timestamp) return '';

    const date = new Date(timestamp);

    const diff = (new Date() - date) / 1000;

    if (diff < 60) return 'e€ l\'instant';

    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;

    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;

    return date.toLocaleDateString();

}



async function markAllNotificationsRead() {

    try {

        await apiFetch('/api/notifications/read', { method: 'POST' });

        loadNotifications();

        showToast('success', 'Notifications marques comme lues');

    } catch (error) { console.error('Erreur:', error); }

}



async function clearNotifications() {

    if (!confirm('Supprimer toutes les notifications ?')) return;

    try {

        await apiFetch('/api/notifications/clear', { method: 'POST' });

        loadNotifications();

        showToast('success', 'Notifications supprimes');

    } catch (error) { console.error('Erreur:', error); }

}



// ================================

// SETTINGS

// ================================



async function loadSettings() {

    if (currentUser?.role === 'admin') await loadUsers();

    

    // Charger les parame¨tres sauvegardes

    const savedSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');

    

    // Appliquer les parame¨tres

    if (savedSettings.animations !== undefined) {

        document.getElementById('animations-toggle').checked = savedSettings.animations;

        toggleAnimations(savedSettings.animations);

    }

    if (savedSettings.defaultRam) {

        document.getElementById('default-ram').value = savedSettings.defaultRam;

    }

    if (savedSettings.defaultPort) {

        document.getElementById('default-port').value = savedSettings.defaultPort;

    }

    if (savedSettings.sounds !== undefined) {

        document.getElementById('sounds-toggle').checked = savedSettings.sounds;

    }

}



function toggleAnimations(enabled) {

    document.body.style.setProperty('--transition-smooth', enabled ? '0.3s cubic-bezier(0.4, 0, 0.2, 1)' : '0s');

    document.body.style.setProperty('--transition-bounce', enabled ? '0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : '0s');

    saveSettings();

}



function toggleBrowserNotifications(enabled) {

    if (enabled && 'Notification' in window) {

        Notification.requestPermission().then(permission => {

            if (permission !== 'granted') {

                document.getElementById('browser-notif-toggle').checked = false;

                showToast('error', 'Notifications non autorises');

            } else {

                showToast('success', 'Notifications actives');

            }

        });

    }

    saveSettings();

}



function saveSettings() {

    const settings = {

        animations: document.getElementById('animations-toggle')?.checked ?? true,

        defaultRam: document.getElementById('default-ram')?.value || '2048',

        defaultPort: document.getElementById('default-port')?.value || '25565',

        sounds: document.getElementById('sounds-toggle')?.checked ?? true,

        autoBackup: document.getElementById('auto-backup-toggle')?.checked ?? false,

        backupFrequency: document.getElementById('backup-frequency')?.value || 'daily',

        backupRetention: document.getElementById('backup-retention')?.value || '7'

    };

    localStorage.setItem('appSettings', JSON.stringify(settings));

}



async function loadUsers() {

    try {

        const response = await apiFetch('/api/auth/users');

        const data = await response.json();

        const container = document.getElementById('users-list');

        if (!container) return;

        

        const users = data.users || [];

        container.innerHTML = users.map(user => `

            <div class="user-item">

                <div class="user-info"><i class="fas fa-user"></i><span>${user.username}</span><span class="user-role-badge ${user.role}">${user.role}</span></div>

                ${user.username !== 'admin' ? `<button class="btn-danger-sm" onclick="deleteUser('${user.username}')"><i class="fas fa-trash"></i></button>` : ''}

            </div>

        `).join('');

    } catch (error) { console.error('Erreur users:', error); }

}



function openUserModal() { document.getElementById('user-modal')?.classList.add('show'); }

function closeUserModal() { document.getElementById('user-modal')?.classList.remove('show'); }



async function createUser(event) {

    event.preventDefault();

    const username = document.getElementById('new-username')?.value.trim();

    const password = document.getElementById('new-password')?.value;

    const role = document.getElementById('new-role')?.value || 'user';

    

    try {

        const response = await apiFetch('/api/auth/users', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ username, password, role })

        });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', 'Utilisateur cre');

            closeUserModal();

            loadUsers();

            if (document.getElementById('new-username')) document.getElementById('new-username').value = '';

            if (document.getElementById('new-password')) document.getElementById('new-password').value = '';

        } else showToast('error', result.message || 'Erreur');

    } catch (error) { console.error('Erreur creation user:', error); }

}



async function deleteUser(username) {

    if (!confirm(`Supprimer l'utilisateur ${username} ?`)) return;

    try {

        const response = await apiFetch(`/api/auth/users/${username}`, { method: 'DELETE' });

        const result = await response.json();

        if (result.status === 'success') {

            showToast('success', 'Utilisateur supprime');

            loadUsers();

        } else showToast('error', result.message || 'Erreur');

    } catch (error) { console.error('Erreur suppression user:', error); }

}



async function testDiscord() {

    const webhook = document.getElementById('discord-webhook')?.value.trim();

    if (!webhook) { showToast('error', 'Entrez une URL de webhook'); return; }

    try {

        const response = await apiFetch('/api/notifications/test/discord', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ webhook_url: webhook })

        });

        const result = await response.json();

        if (result.success) showToast('success', 'Message de test envoye');

        else showToast('error', result.message || 'Erreur');

    } catch (error) { console.error('Erreur test Discord:', error); }

}



// ================================

// MODALS

// ================================



async function loadVersions() {

    try {

        const response = await apiFetch('/api/papermc/versions');

        const versions = await response.json();

        const select = document.getElementById('server-version');

        if (select) select.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');

    } catch (error) { console.error('Erreur versions:', error); }

}



function openModal() { document.getElementById('create-modal')?.classList.add('show'); }

function closeModal() { document.getElementById('create-modal')?.classList.remove('show'); }



async function createServer(event) {

    event.preventDefault();

    const name = document.getElementById('server-name-input')?.value.trim();

    const version = document.getElementById('server-version')?.value;

    const ramMin = document.getElementById('ram-min')?.value || '1024';

    const ramMax = document.getElementById('ram-max')?.value || '2048';

    

    if (!name || !version) { showToast('error', 'Remplissez tous les champs'); return; }

    

    try {

        closeModal();

        showToast('info', 'Creation du serveur...');

        

        const response = await apiFetch('/api/create', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ name, version, ram_min: ramMin + 'M', ram_max: ramMax + 'M' })

        });

        const result = await response.json();

        

        if (result.status === 'success') {

            showToast('success', `Serveur ${name} cre !`);

            loadServerList();

            if (document.getElementById('server-name-input')) document.getElementById('server-name-input').value = '';

        } else {

            showToast('error', result.message || 'Erreur creation');

        }

    } catch (error) {

        console.error('Erreur creation:', error);

        showToast('error', 'Erreur lors de la creation');

    }

}



// ================================

// TOAST NOTIFICATIONS

// ================================



function showToast(type, message) {

    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');

    toast.className = `toast ${type}`;

    

    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle', warning: 'exclamation-triangle' };

    toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${message}</span>`;

    container.appendChild(toast);

    

    setTimeout(() => {

        toast.classList.add('fade-out');

        setTimeout(() => toast.remove(), 300);

    }, 4000);

}



function createToastContainer() {

    let container = document.getElementById('toast-container');

    if (!container) {

        container = document.createElement('div');

        container.id = 'toast-container';

        document.body.appendChild(container);

    }

    return container;

}



// Ancien alias pour compatibilite

function showNotification(type, title, message) {

    showToast(type, message || title);

}



// ================================

// UTILITIES

// ================================



function escapeHtml(text) {

    const div = document.createElement('div');

    div.textContent = text;

    return div.innerHTML;

}



function refreshAll() {

    loadServerList();

    loadSystemMetrics();

    loadNotifications();

    showToast('success', 'Donnes actualises');

}



// ================================

// INTERNATIONALIZATION (i18n) - Enhanced System

// ================================

// Langues supportées
const SUPPORTED_LANGUAGES = {
    'fr': { name: 'Français', flag: '🇫🇷' },
    'en': { name: 'English', flag: '🇬🇧' },
    'es': { name: 'Español', flag: '🇪🇸' }
};

/**
 * Fonction globale de traduction - utilisable partout
 * @param {string} key - Clé de traduction (ex: 'nav.dashboard')
 * @param {object} params - Paramètres pour interpolation (ex: {n: 5})
 * @returns {string} - Texte traduit ou clé si non trouvé
 */
function t(key, params = {}) {
    let text = getTranslation(key);
    if (!text) return key; // Retourne la clé si traduction non trouvée
    
    // Interpolation des paramètres {n}, {name}, etc.
    for (const [param, value] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
    }
    return text;
}

// Alias pour compatibilité
window.t = t;
window.__ = t;

async function changeLanguage(lang) {
    try {
        if (!SUPPORTED_LANGUAGES[lang]) {
            console.warn(`Language ${lang} not supported, falling back to 'fr'`);
            lang = 'fr';
        }
        
        const response = await apiFetch(`/api/i18n/translations?lang=${lang}`);
        if (!response.ok) throw new Error('Language not found');
        
        const data = await response.json();
        translations = data.translations || data;
        currentLang = lang;
        localStorage.setItem('language', lang);
        
        // Mettre à jour l'attribut lang du HTML
        document.documentElement.lang = lang;
        
        applyTranslations();
        updateLanguageSelector();
        
        showToast('success', `${SUPPORTED_LANGUAGES[lang].flag} ${SUPPORTED_LANGUAGES[lang].name}`);
    } catch (error) {
        console.error('Language change error:', error);
        showToast('error', 'Language change failed');
    }
}

function applyTranslations() {
    // Traduire les éléments avec data-i18n (textContent)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (text && text !== key) {
            el.textContent = text;
        }
    });
    
    // Traduire les placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = t(key);
        if (text && text !== key) {
            el.placeholder = text;
        }
    });
    
    // Traduire les titres (tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const text = t(key);
        if (text && text !== key) {
            el.title = text;
        }
    });
    
    // Traduire les valeurs d'attributs aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        const text = t(key);
        if (text && text !== key) {
            el.setAttribute('aria-label', text);
        }
    });
    
    // Traduire le titre de la page
    const pageTitle = t('app.title');
    if (pageTitle && pageTitle !== 'app.title') {
        document.title = pageTitle;
    }
}

function getTranslation(key) {
    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            return null;
        }
    }
    return typeof value === 'string' ? value : null;
}

function updateLanguageSelector() {
    // Mettre à jour tous les sélecteurs de langue
    document.querySelectorAll('.lang-select, #lang-select').forEach(select => {
        select.value = currentLang;
    });
    
    // Mettre à jour le bouton de langue si présent
    const langBtn = document.getElementById('current-lang');
    if (langBtn && SUPPORTED_LANGUAGES[currentLang]) {
        langBtn.innerHTML = `${SUPPORTED_LANGUAGES[currentLang].flag} ${currentLang.toUpperCase()}`;
    }
}

function createLanguageDropdown() {
    let html = '<div class="language-dropdown">';
    for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
        const active = code === currentLang ? 'active' : '';
        html += `<button class="lang-option ${active}" onclick="changeLanguage('${code}')">
            ${info.flag} ${info.name}
        </button>`;
    }
    html += '</div>';
    return html;
}

function toggleLanguageDropdown() {
    const dropdown = document.getElementById('lang-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

async function loadLanguage() {
    const savedLang = localStorage.getItem('language') || navigator.language.split('-')[0] || 'fr';
    const langToUse = SUPPORTED_LANGUAGES[savedLang] ? savedLang : 'fr';
    
    // Mettre à jour les sélecteurs
    document.querySelectorAll('.lang-select, #lang-select').forEach(select => {
        select.value = langToUse;
    });
    
    await changeLanguage(langToUse);

}



// ================================

// SERVER ADDRESS / SUBDOMAIN SYSTEM

// ================================



function getServerAddress(serverName) {

    const config = JSON.parse(localStorage.getItem('serverAddressConfig') || '{}');

    

    if (config.useSubdomain && config.domain) {

        return `${serverName}.${config.domain}`;

    } else if (config.customIP) {

        return config.customIP;

    }

    

    // Par defaut, utiliser localhost

    return 'localhost';

}



function getServerPort(serverName) {

    // TODO: Recuperer le port depuis server.properties

    return '25565';

}



function getFullServerAddress(serverName) {

    const address = getServerAddress(serverName);

    const port = getServerPort(serverName);

    return port === '25565' ? address : `${address}:${port}`;

}



function copyServerAddress(serverName) {

    const address = getFullServerAddress(serverName);

    navigator.clipboard.writeText(address).then(() => {

        showToast('success', `Adresse copie: ${address}`);

    }).catch(() => {

        showToast('error', 'Impossible de copier');

    });

}



function copyCurrentServerAddress() {

    if (currentServer) {

        copyServerAddress(currentServer);

    }

}



function updateServerAddressDisplay(serverName, port) {

    const addressDisplay = document.getElementById('server-address-display');

    const addressText = document.getElementById('server-address-text');

    

    if (addressDisplay && addressText) {

        const address = getServerAddress(serverName);

        const fullAddress = port && port !== '25565' ? `${address}:${port}` : address;

        addressText.textContent = fullAddress;

        addressDisplay.style.display = 'flex';

    }

}



function saveAddressConfig() {

    const config = {

        useSubdomain: document.getElementById('use-subdomain')?.checked || false,

        domain: document.getElementById('custom-domain')?.value || '',

        customIP: document.getElementById('custom-ip')?.value || ''

    };

    localStorage.setItem('serverAddressConfig', JSON.stringify(config));

    showToast('success', 'Configuration d\'adresse sauvegarde');

}



function loadAddressConfig() {

    const config = JSON.parse(localStorage.getItem('serverAddressConfig') || '{}');

    

    const useSubdomain = document.getElementById('use-subdomain');

    const customDomain = document.getElementById('custom-domain');

    const customIP = document.getElementById('custom-ip');

    

    if (useSubdomain) useSubdomain.checked = config.useSubdomain || false;

    if (customDomain) customDomain.value = config.domain || '';

    if (customIP) customIP.value = config.customIP || '';

    

    toggleAddressMode();

}



function toggleAddressMode() {

    const useSubdomain = document.getElementById('use-subdomain')?.checked;

    const subdomainConfig = document.getElementById('subdomain-config');

    const ipConfig = document.getElementById('ip-config');

    

    if (subdomainConfig) subdomainConfig.style.display = useSubdomain ? 'block' : 'none';

    if (ipConfig) ipConfig.style.display = useSubdomain ? 'none' : 'block';

    

    updateAddressPreview();

}



function updateAddressPreview() {

    const domain = document.getElementById('custom-domain')?.value || 'monserveur.fr';

    const preview = document.querySelector('.address-preview strong');

    if (preview) {

        preview.textContent = `[nom-serveur].${domain}`;

    }

}



async function detectPublicIP() {

    try {

        showToast('info', 'Detection de l\'IP publique...');

        const response = await fetch('https://api.ipify.org?format=json');

        const data = await response.json();

        

        const ipInput = document.getElementById('custom-ip');

        if (ipInput && data.ip) {

            ipInput.value = data.ip;

            showToast('success', `IP detecte: ${data.ip}`);

        }

    } catch (error) {

        console.error('Erreur detection IP:', error);

        showToast('error', 'Impossible de detecter l\'IP publique');

    }

}



// Fermer modals en cliquant dehors

document.addEventListener('click', (e) => {

    if (e.target.classList.contains('modal')) {

        e.target.classList.remove('show');

    }

});

// ================================
// KEYBOARD SHORTCUTS
// ================================

document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'cmd-input') {
            e.preventDefault();
            sendCommand();
        }
        return;
    }
    
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
        return;
    }
    
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (currentServer) toggleServer();
    }
    
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        const modal = document.getElementById('modal-create');
        if (modal) modal.classList.add('show');
    }
    
    if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.altKey) {
        const tabs = ['console', 'players', 'plugins', 'config', 'backups'];
        const idx = parseInt(e.key) - 1;
        if (tabs[idx]) showTab(tabs[idx]);
    }
});

// ================================
// DRAG & DROP UPLOAD
// ================================

function initDragDrop() {
    document.querySelectorAll('.content').forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (!currentServer) { showToast('error', 'Select a server'); return; }
            for (const file of e.dataTransfer.files) await handleFileDrop(file);
        });
    });
}

async function handleFileDrop(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const formData = new FormData();
    
    if (ext === 'jar') {
        formData.append('plugin', file);
        showToast('info', 'Uploading ' + file.name);
        const resp = await apiFetch('/api/server/' + currentServer + '/plugins/upload', { method: 'POST', body: formData });
        if (resp.ok) { showToast('success', 'Plugin installed'); loadInstalledPlugins(); }
    } else if (ext === 'zip') {
        formData.append('world', file);
        const resp = await apiFetch('/api/server/' + currentServer + '/worlds/import', { method: 'POST', body: formData });
        if (resp.ok) showToast('success', 'World imported');
    }
}

// Drag styling
const ds = document.createElement('style');
ds.textContent = '.drag-over { border: 2px dashed var(--primary) !important; background: rgba(99,102,241,0.1) !important; }';
document.head.appendChild(ds);

// ================================
// DISK USAGE
// ================================

async function loadDiskUsage() {
    if (!currentServer) return;
    const resp = await apiFetch('/api/server/' + currentServer + '/disk');
    const data = await resp.json();
    if (data.status === 'success') {
        const el = document.getElementById('disk-usage');
        if (el) el.textContent = data.usage.total_mb + ' MB';
    }
}

// ================================
// WORLDS
// ================================

async function loadWorlds() {
    if (!currentServer) return;
    const resp = await apiFetch('/api/server/' + currentServer + '/worlds');
    const data = await resp.json();
    const container = document.getElementById('worlds-list');
    if (!container) return;
    if (data.worlds && data.worlds.length > 0) {
        container.innerHTML = data.worlds.map(w => 
            '<div class="backup-item"><i class="fas fa-globe"></i>' +
            '<div class="backup-info"><span class="backup-name">' + w.name + '</span>' +
            '<span class="backup-date">' + w.size_mb + ' MB</span></div></div>'
        ).join('');
    } else {
        container.innerHTML = '<div class="empty-message">No worlds</div>';
    }
}

// ================================
// FILE BROWSER
// ================================

let currentFilePath = '';

async function loadFiles(path) {
    path = path || '';
    if (!currentServer) return;
    currentFilePath = path;
    const resp = await apiFetch('/api/server/' + currentServer + '/files?path=' + encodeURIComponent(path));
    const data = await resp.json();
    const container = document.getElementById('file-browser');
    if (!container) return;
    
    let html = '';
    if (path) {
        const parent = path.split('/').slice(0, -1).join('/');
        html += '<div class="file-item" style="cursor:pointer;padding:8px" onclick="loadFiles(\''+parent+'\')"><i class="fas fa-arrow-left"></i> ..</div>';
    }
    if (data.files) {
        data.files.forEach(f => {
            const icon = f.is_dir ? 'fa-folder' : 'fa-file';
            const newPath = (path ? path + '/' : '') + f.name;
            if (f.is_dir) {
                html += '<div class="file-item" style="cursor:pointer;padding:8px" onclick="loadFiles(\''+newPath+'\')"><i class="fas '+icon+'"></i> '+f.name+'</div>';
            } else {
                html += '<div class="file-item" style="cursor:pointer;padding:8px" onclick="openFile(\''+newPath+'\')"><i class="fas '+icon+'"></i> '+f.name+'</div>';
            }
        });
    }
    container.innerHTML = html || '<div class="empty-message">Empty</div>';
}

async function openFile(path) {
    const resp = await apiFetch('/api/server/' + currentServer + '/files/read?path=' + encodeURIComponent(path));
    const data = await resp.json();
    if (data.status === 'success') {
        const pathEl = document.getElementById('file-editor-path');
        const contentEl = document.getElementById('file-editor-content');
        const modal = document.getElementById('modal-file-editor');
        if (pathEl) pathEl.textContent = path;
        if (contentEl) contentEl.value = data.content;
        if (modal) modal.classList.add('show');
    }
}

async function saveFile() {
    const path = document.getElementById('file-editor-path').textContent;
    const content = document.getElementById('file-editor-content').value;
    const resp = await apiFetch('/api/server/' + currentServer + '/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, content: content })
    });
    if (resp.ok) {
        showToast('success', 'File saved');
        const modal = document.getElementById('modal-file-editor');
        if (modal) modal.classList.remove('show');
    }
}

// ================================
// TUNNEL MANAGER - MULTI-PROVIDER (Gratuit, sans compte)
// Supporte: localhost.run, Serveo, Bore, Cloudflare, Manuel
// ================================

let tunnelPolling = null;
let tunnelRetryCount = 0;
const TUNNEL_MAX_RETRIES = 15;
const TUNNEL_POLL_INTERVAL = 3000;
let selectedProvider = 'localhost.run';
let availableProviders = [];

// Charger les providers disponibles
async function loadTunnelProviders() {
    try {
        const resp = await apiFetch('/api/tunnel/providers');
        if (resp.ok) {
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await resp.json();
                availableProviders = data.providers || [];
            }
        }
    } catch (e) {
        console.warn('Erreur chargement providers:', e);
        // Providers par défaut
        availableProviders = [
            { id: 'localhost.run', name: 'localhost.run', description: 'SSH, gratuit', status: 'recommended' },
            { id: 'serveo', name: 'Serveo', description: 'SSH, gratuit', status: 'available' },
            { id: 'bore', name: 'Bore', description: 'TCP léger', status: 'available' },
            { id: 'manual', name: 'Port Manuel', description: 'Redirection manuelle', status: 'available' }
        ];
    }
}

async function startTunnel(provider = null) {
    const btn = document.getElementById('btn-tunnel') || document.getElementById('btn-playit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Démarrage...';
    }
    
    tunnelRetryCount = 0;
    const useProvider = provider || selectedProvider;
    
    try {
        const resp = await apiFetch('/api/tunnel/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: 25565, provider: useProvider })
        });
        
        if (resp.status === 401) {
            showToast('error', 'Session expirée, reconnectez-vous');
            window.location.href = '/login';
            return;
        }
        
        // Vérifier le Content-Type avant de parser en JSON
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            // Le serveur a renvoyé du HTML (probablement une erreur ou redirection)
            const text = await resp.text();
            console.error('Réponse non-JSON:', text.substring(0, 200));
            throw new Error('Le serveur a renvoyé une réponse invalide. Vérifiez que vous êtes connecté.');
        }
        
        const data = await resp.json();
        
        // Afficher le modal
        showTunnelModal();
        
        if (data.status === 'success' && data.address) {
            showTunnelAddress(data.address, data.provider);
            startTunnelPolling();
        } else if (data.status === 'starting') {
            showTunnelLoading(`Connexion à ${data.provider || useProvider}...`);
            startTunnelPolling();
        } else if (data.status === 'error') {
            showTunnelError(data.message || 'Erreur inconnue');
        } else if (data.instructions) {
            // Mode manuel avec instructions
            showTunnelManual(data);
        } else {
            showTunnelLoading('Connexion au tunnel...');
            startTunnelPolling();
        }
    } catch (e) {
        console.error('Tunnel error:', e);
        showToast('error', 'Erreur: ' + e.message);
        showTunnelError('Impossible de démarrer: ' + e.message);
    } finally {
        updateTunnelButton();
    }
}

async function stopTunnel() {
    const btn = document.querySelector('#modal-tunnel .btn-danger');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Arrêt...';
    }
    
    try {
        const resp = await apiFetch('/api/tunnel/stop', { method: 'POST' });
        if (resp.ok) {
            showToast('success', 'Tunnel arrêté');
        }
        stopTunnelPolling();
        hideTunnelModal();
    } catch (e) {
        showToast('error', 'Erreur: ' + e.message);
    } finally {
        updateTunnelButton();
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
        const resp = await apiFetch('/api/tunnel/status');
        
        if (!resp.ok) {
            tunnelRetryCount++;
            if (tunnelRetryCount >= TUNNEL_MAX_RETRIES) {
                stopTunnelPolling();
                showTunnelError('Timeout: impossible de récupérer le statut');
            }
            return;
        }
        
        // Vérifier le Content-Type
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            console.error('Réponse non-JSON pour /api/tunnel/status');
            tunnelRetryCount++;
            return;
        }
        
        const data = await resp.json();
        tunnelRetryCount = 0;
        
        if (data.status === 'running' && data.address) {
            showTunnelAddress(data.address, data.provider);
        } else if (data.status === 'connecting') {
            showTunnelLoading('Connexion en cours...');
        } else if (data.status === 'stopped' || data.status === 'inactive') {
            // Ne pas fermer le modal - l'utilisateur veut peut-être démarrer un tunnel
            stopTunnelPolling();
            // Afficher l'état "prêt à démarrer" au lieu de fermer
        } else if (data.status === 'error') {
            showTunnelError(data.error || 'Erreur du tunnel');
            stopTunnelPolling();
        }
        
        updateTunnelButton(data.running);
    } catch (e) {
        tunnelRetryCount++;
        if (tunnelRetryCount >= TUNNEL_MAX_RETRIES) {
            stopTunnelPolling();
            showTunnelError('Connexion perdue');
        }
    }
}

async function updateTunnelButton(running) {
    if (running === undefined) {
        try {
            const resp = await apiFetch('/api/tunnel/status');
            if (resp.ok) {
                const contentType = resp.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const data = await resp.json();
                    running = data.running;
                } else {
                    running = false;
                }
            }
        } catch (e) {
            running = false;
        }
    }
    
    // Support pour les deux IDs de bouton
    const btn = document.getElementById('btn-tunnel') || document.getElementById('btn-playit');
    if (!btn) return;
    
    btn.disabled = false;
    if (running) {
        btn.innerHTML = '<i class="fas fa-globe"></i> Tunnel Actif';
        btn.classList.add('active');
        btn.onclick = showTunnelModal;
    } else {
        btn.innerHTML = '<i class="fas fa-share-alt"></i> Partager Serveur';
        btn.classList.remove('active');
        btn.onclick = () => showTunnelModal(true);
    }
}

function showTunnelModal(showProviders = false) {
    const modal = document.getElementById('tunnel-modal');
    if (!modal) {
        console.error('Modal tunnel non trouvé');
        return;
    }
    
    // Reset l'état du modal
    const statusEl = document.getElementById('tunnel-status');
    const addressBox = document.getElementById('tunnel-address-box');
    const actionsEl = document.getElementById('tunnel-actions');
    const manualConfig = document.getElementById('manual-tunnel-config');
    const providersSection = modal.querySelector('.tunnel-providers');
    
    // Afficher les providers par défaut
    if (providersSection) providersSection.style.display = 'block';
    if (manualConfig) manualConfig.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
    if (addressBox) addressBox.style.display = 'none';
    
    // Mettre à jour le statut
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-globe"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Prêt à partager</span>
                <span class="tunnel-provider-name">Sélectionnez un provider</span>
            </div>
        `;
        statusEl.className = 'tunnel-status ready';
    }
    
    // Vérifier le statut actuel du tunnel
    checkTunnelStatus();
    
    modal.style.display = 'flex';
    modal.classList.add('show');
}

function closeTunnelModal() {
    const modal = document.getElementById('tunnel-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function getProviderIcon(id) {
    const icons = {
        'localhost.run': '<i class="fas fa-terminal"></i>',
        'serveo': '<i class="fas fa-server"></i>',
        'bore': '<i class="fas fa-bolt"></i>',
        'cloudflared': '<i class="fas fa-cloud"></i>',
        'manual': '<i class="fas fa-cogs"></i>'
    };
    return icons[id] || '<i class="fas fa-globe"></i>';
}

function selectProvider(id) {
    selectedProvider = id;
    document.querySelectorAll('.provider-card').forEach(el => {
        el.classList.toggle('selected', el.getAttribute('onclick')?.includes(id));
    });
}

function hideTunnelModal() {
    closeTunnelModal();
}

function showManualTunnel() {
    const manualConfig = document.getElementById('manual-tunnel-config');
    if (manualConfig) {
        manualConfig.style.display = manualConfig.style.display === 'none' ? 'block' : 'none';
    }
}

function setManualTunnel() {
    const address = document.getElementById('manual-address')?.value?.trim();
    if (!address) {
        showToast('error', 'Entrez une adresse');
        return;
    }
    
    // Afficher l'adresse manuelle
    const addressBox = document.getElementById('tunnel-address-box');
    const tunnelAddress = document.getElementById('tunnel-address');
    const actionsEl = document.getElementById('tunnel-actions');
    const statusEl = document.getElementById('tunnel-status');
    
    if (tunnelAddress) tunnelAddress.value = address;
    if (addressBox) addressBox.style.display = 'block';
    if (actionsEl) actionsEl.style.display = 'flex';
    
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
        statusEl.className = 'tunnel-status active';
    }
    
    document.getElementById('manual-tunnel-config').style.display = 'none';
    showToast('success', 'Adresse configurée !');
}

function showTunnelLoading(message = 'Connexion...') {
    const statusEl = document.getElementById('tunnel-status');
    const actionsEl = document.getElementById('tunnel-actions');
    const providersSection = document.querySelector('.tunnel-providers');
    
    if (providersSection) providersSection.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
    
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-circle-notch fa-spin"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">${message}</span>
                <span class="tunnel-provider-name">Veuillez patienter...</span>
            </div>
        `;
        statusEl.className = 'tunnel-status loading';
    }
}

function showTunnelError(message) {
    const statusEl = document.getElementById('tunnel-status');
    const actionsEl = document.getElementById('tunnel-actions');
    const providersSection = document.querySelector('.tunnel-providers');
    
    if (providersSection) providersSection.style.display = 'block';
    if (actionsEl) actionsEl.style.display = 'none';
    
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-exclamation-triangle" style="color: var(--error-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Erreur</span>
                <span class="tunnel-provider-name">${message}</span>
            </div>
        `;
        statusEl.className = 'tunnel-status error';
    }
    
    showToast('error', message);
}

function showTunnelAddress(address, provider) {
    const statusEl = document.getElementById('tunnel-status');
    const addressBox = document.getElementById('tunnel-address-box');
    const tunnelAddress = document.getElementById('tunnel-address');
    const actionsEl = document.getElementById('tunnel-actions');
    const providersSection = document.querySelector('.tunnel-providers');
    
    if (providersSection) providersSection.style.display = 'none';
    if (addressBox) addressBox.style.display = 'block';
    if (actionsEl) actionsEl.style.display = 'flex';
    if (tunnelAddress) tunnelAddress.value = address;
    
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-check-circle" style="color: var(--success-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Tunnel Actif !</span>
                <span class="tunnel-provider-name">${provider || selectedProvider || 'localhost.run'}</span>
            </div>
        `;
        statusEl.className = 'tunnel-status active';
    }
    
    showToast('success', 'Tunnel activé ! Adresse : ' + address);
}

function showTunnelManual(data) {
    const statusEl = document.getElementById('tunnel-status');
    const addressBox = document.getElementById('tunnel-address-box');
    const tunnelAddress = document.getElementById('tunnel-address');
    const actionsEl = document.getElementById('tunnel-actions');
    
    if (addressBox) addressBox.style.display = 'block';
    if (actionsEl) actionsEl.style.display = 'flex';
    if (tunnelAddress) tunnelAddress.value = data.address || '';
    
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="tunnel-status-icon">
                <i class="fas fa-cog" style="color: var(--warning-color)"></i>
            </div>
            <div class="tunnel-status-info">
                <span class="tunnel-status-text">Configuration Manuelle</span>
                <span class="tunnel-provider-name">${data.message || 'Redirection de port'}</span>
            </div>
        `;
        statusEl.className = 'tunnel-status manual';
    }
}

function copyTunnelAddress() {
    const addr = document.getElementById('tunnel-address');
    if (addr) {
        // Fonctionne avec input ou code element
        const text = addr.value || addr.textContent || '';
        navigator.clipboard.writeText(text)
            .then(() => showToast('success', 'Adresse copiée!'))
            .catch(() => showToast('error', 'Erreur de copie'));
    }
}

// Alias pour compatibilité avec l'ancien code Playit
const startPlayitTunnel = startTunnel;
const stopPlayitTunnel = stopTunnel;
const showPlayitModal = () => showTunnelModal(true);
const hidePlayitModal = hideTunnelModal;
const updatePlayitButton = updateTunnelButton;
function copyPlayitAddress() { copyTunnelAddress(); }

// Alias pour compatibilité avec le HTML
function openTunnelModal() { showTunnelModal(true); }

// Initialiser les providers au chargement
document.addEventListener('DOMContentLoaded', loadTunnelProviders);

// Init drag drop on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDragDrop);
} else {
    initDragDrop();
}

// -----------------------------
// Runtime error / rejection capture
// Adds a small in-page overlay so users without a console can report errors
// -----------------------------
function _createJsErrorOverlay() {
    if (document.getElementById('js-error-overlay')) return;
    const container = document.createElement('div');
    container.id = 'js-error-overlay';
    document.body.appendChild(container);
}

function _showJsError(title, details) {
    _createJsErrorOverlay();
    const root = document.getElementById('js-error-overlay');
    const card = document.createElement('div');
    card.className = 'js-error-card';
    card.innerHTML = `<h4>${title}</h4><pre>${details}</pre>`;

    const actions = document.createElement('div');
    actions.className = 'js-error-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'js-error-btn';
    copyBtn.textContent = 'Copier l\'erreur';
    copyBtn.onclick = () => {
        try { navigator.clipboard.writeText(title + '\n\n' + details); showToast('info', 'Erreur copiée dans le presse-papiers'); }
        catch(e){ showToast('error', 'Impossible de copier'); }
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'js-error-btn';
    closeBtn.textContent = 'Fermer';
    closeBtn.onclick = () => { card.remove(); if (!document.getElementById('js-error-overlay')?.childElementCount) { document.getElementById('js-error-overlay')?.remove(); } };

    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    card.appendChild(actions);
    root.appendChild(card);
}

window.addEventListener('error', function (ev) {
    try {
        const msg = ev.message || 'Erreur JS';
        const src = (ev.filename ? `${ev.filename}:${ev.lineno || 0}:${ev.colno || 0}` : '');
        const stack = ev.error && ev.error.stack ? ev.error.stack : `${msg}\n${src}`;
        _showJsError('Erreur JavaScript', stack);
        console.error('Captured error:', ev.error || ev);
    } catch (e) { console.error('Error while showing error overlay', e); }
});

window.addEventListener('unhandledrejection', function (ev) {
    try {
        const reason = ev.reason ? (ev.reason.stack || JSON.stringify(ev.reason)) : 'Rejected promise';
        _showJsError('Unhandled Promise Rejection', String(reason));
        console.error('Unhandled rejection:', ev.reason);
    } catch (e) { console.error('Error while showing rejection overlay', e); }
});

// =====================================================
// AMÉLIORATION 31: Export des logs de la console
// =====================================================
function exportConsoleLogs(format = 'txt') {
    const output = document.getElementById('console-output');
    if (!output) {
        showToast('error', 'Console non disponible');
        return;
    }
    
    const logs = output.innerText || output.textContent;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `minecraft-logs-${currentServer}-${timestamp}.${format}`;
    
    let content = logs;
    if (format === 'json') {
        const lines = logs.split('\n').filter(l => l.trim());
        content = JSON.stringify({ server: currentServer, timestamp: new Date().toISOString(), logs: lines }, null, 2);
    } else if (format === 'html') {
        content = `<!DOCTYPE html><html><head><title>Logs ${currentServer}</title><style>body{background:#1a1a2e;color:#0f0;font-family:monospace;padding:20px;}pre{white-space:pre-wrap;}</style></head><body><h1>Logs: ${currentServer}</h1><p>Date: ${new Date().toLocaleString()}</p><pre>${logs.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`;
    }
    
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', `Logs exportés: ${filename}`);
}

// =====================================================
// AMÉLIORATION 32: Recherche dans les logs
// =====================================================
function searchLogs(query) {
    const output = document.getElementById('console-output');
    if (!output || !query.trim()) return;
    
    const spans = output.querySelectorAll('span');
    let count = 0;
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    spans.forEach(span => {
        const original = span.dataset.original || span.textContent;
        span.dataset.original = original;
        
        if (regex.test(original)) {
            span.innerHTML = original.replace(regex, '<mark class="log-highlight">$&</mark>');
            count++;
        } else {
            span.textContent = original;
        }
    });
    
    showToast('info', `${count} occurrence(s) trouvée(s)`);
}

function clearLogSearch() {
    const output = document.getElementById('console-output');
    if (!output) return;
    
    output.querySelectorAll('span').forEach(span => {
        if (span.dataset.original) {
            span.textContent = span.dataset.original;
        }
    });
}

// =====================================================
// AMÉLIORATION 33: Statistiques du serveur améliorées
// =====================================================
const serverStats = {
    startTime: null,
    commands: 0,
    errors: 0,
    warnings: 0,
    playerJoins: 0,
    
    reset() {
        this.startTime = new Date();
        this.commands = 0;
        this.errors = 0;
        this.warnings = 0;
        this.playerJoins = 0;
    },
    
    trackLog(line) {
        if (/error|exception|failed/i.test(line)) this.errors++;
        if (/warn/i.test(line)) this.warnings++;
        if (/joined the game/i.test(line)) this.playerJoins++;
    },
    
    getUptime() {
        if (!this.startTime) return '0s';
        const diff = Math.floor((Date.now() - this.startTime) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${h}h ${m}m ${s}s`;
    },
    
    getSummary() {
        return {
            uptime: this.getUptime(),
            commands: this.commands,
            errors: this.errors,
            warnings: this.warnings,
            playerJoins: this.playerJoins
        };
    }
};

// =====================================================
// AMÉLIORATION 34: Templates de serveur prédéfinis
// =====================================================
const SERVER_TEMPLATES = {
    survival: {
        name: 'Survie Classique',
        config: {
            'gamemode': 'survival',
            'difficulty': 'normal',
            'pvp': 'true',
            'spawn-monsters': 'true',
            'spawn-animals': 'true',
            'max-players': '20'
        }
    },
    creative: {
        name: 'Créatif',
        config: {
            'gamemode': 'creative',
            'difficulty': 'peaceful',
            'pvp': 'false',
            'spawn-monsters': 'false',
            'max-players': '10'
        }
    },
    hardcore: {
        name: 'Hardcore',
        config: {
            'gamemode': 'survival',
            'difficulty': 'hard',
            'hardcore': 'true',
            'pvp': 'true',
            'spawn-monsters': 'true',
            'max-players': '10'
        }
    },
    minigames: {
        name: 'Mini-jeux',
        config: {
            'gamemode': 'adventure',
            'difficulty': 'normal',
            'pvp': 'true',
            'spawn-monsters': 'false',
            'max-players': '50',
            'allow-flight': 'true'
        }
    },
    roleplay: {
        name: 'Roleplay',
        config: {
            'gamemode': 'survival',
            'difficulty': 'normal',
            'pvp': 'false',
            'spawn-monsters': 'true',
            'max-players': '30',
            'white-list': 'true'
        }
    }
};

function applyServerTemplate(templateId) {
    const template = SERVER_TEMPLATES[templateId];
    if (!template) {
        showToast('error', 'Template non trouvé');
        return;
    }
    
    if (!confirm(`Appliquer le template "${template.name}" ? Les valeurs actuelles seront remplacées.`)) {
        return;
    }
    
    Object.entries(template.config).forEach(([key, value]) => {
        const input = document.querySelector(`[data-config-key="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = value === 'true';
            } else {
                input.value = value;
            }
        }
    });
    
    showToast('success', `Template "${template.name}" appliqué`);
}

// =====================================================
// AMÉLIORATION 35: Gestion des favoris de plugins
// =====================================================
const pluginFavorites = {
    key: 'mcpanel_plugin_favorites',
    
    load() {
        try {
            return JSON.parse(localStorage.getItem(this.key) || '[]');
        } catch { return []; }
    },
    
    save(favorites) {
        localStorage.setItem(this.key, JSON.stringify(favorites));
    },
    
    toggle(pluginName) {
        const favs = this.load();
        const idx = favs.indexOf(pluginName);
        if (idx === -1) {
            favs.push(pluginName);
            showToast('success', `${pluginName} ajouté aux favoris`);
        } else {
            favs.splice(idx, 1);
            showToast('info', `${pluginName} retiré des favoris`);
        }
        this.save(favs);
        return idx === -1;
    },
    
    isFavorite(pluginName) {
        return this.load().includes(pluginName);
    }
};

// =====================================================
// AMÉLIORATION 36: Confirmation avant actions critiques
// =====================================================
function confirmAction(message, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal confirm-modal';
    modal.innerHTML = `
        <div class="modal-content confirm-content">
            <div class="confirm-icon">⚠️</div>
            <h3 class="confirm-title">Confirmation requise</h3>
            <p class="confirm-message">${message}</p>
            <div class="confirm-buttons">
                <button class="btn-cancel" onclick="this.closest('.modal').remove()">Annuler</button>
                <button class="btn-confirm" id="confirm-action-btn">Confirmer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    document.getElementById('confirm-action-btn').onclick = () => {
        modal.remove();
        callback();
    };
    
    setTimeout(() => modal.classList.add('show'), 10);
}

// =====================================================
// AMÉLIORATION 37: Mode maintenance du serveur
// =====================================================
function toggleMaintenanceMode(serverName) {
    const isEnabled = localStorage.getItem(`maintenance_${serverName}`) === 'true';
    
    if (!isEnabled) {
        confirmAction('Activer le mode maintenance ? Les joueurs ne pourront plus se connecter.', () => {
            localStorage.setItem(`maintenance_${serverName}`, 'true');
            sendCommand('kick @a Mode maintenance activé');
            showToast('warning', 'Mode maintenance activé');
            updateMaintenanceUI(true);
        });
    } else {
        localStorage.setItem(`maintenance_${serverName}`, 'false');
        showToast('success', 'Mode maintenance désactivé');
        updateMaintenanceUI(false);
    }
}

function updateMaintenanceUI(enabled) {
    const btn = document.getElementById('maintenance-btn');
    if (btn) {
        btn.classList.toggle('active', enabled);
        btn.innerHTML = enabled ? '🔧 Maintenance ON' : '🔧 Maintenance OFF';
    }
}

// =====================================================
// AMÉLIORATION 38: Minuterie et rappels
// =====================================================
const serverTimers = {
    timers: [],
    
    add(name, minutes, callback) {
        const id = Date.now();
        const timer = {
            id,
            name,
            endTime: Date.now() + minutes * 60000,
            callback,
            interval: setInterval(() => this.check(id), 1000)
        };
        this.timers.push(timer);
        showToast('info', `Minuterie "${name}" créée: ${minutes} min`);
        return id;
    },
    
    check(id) {
        const timer = this.timers.find(t => t.id === id);
        if (!timer) return;
        
        const remaining = timer.endTime - Date.now();
        if (remaining <= 0) {
            this.remove(id);
            timer.callback();
            showToast('warning', `⏰ Minuterie "${timer.name}" terminée!`);
        }
    },
    
    remove(id) {
        const idx = this.timers.findIndex(t => t.id === id);
        if (idx !== -1) {
            clearInterval(this.timers[idx].interval);
            this.timers.splice(idx, 1);
        }
    },
    
    getAll() {
        return this.timers.map(t => ({
            id: t.id,
            name: t.name,
            remaining: Math.max(0, Math.floor((t.endTime - Date.now()) / 1000))
        }));
    }
};

// =====================================================
// AMÉLIORATION 39: Raccourcis de commandes personnalisés
// =====================================================
const customShortcuts = {
    key: 'mcpanel_shortcuts',
    
    load() {
        try {
            return JSON.parse(localStorage.getItem(this.key) || '{}');
        } catch { return {}; }
    },
    
    save(shortcuts) {
        localStorage.setItem(this.key, JSON.stringify(shortcuts));
    },
    
    add(alias, command) {
        const shortcuts = this.load();
        shortcuts[alias] = command;
        this.save(shortcuts);
        showToast('success', `Raccourci "/${alias}" créé`);
    },
    
    remove(alias) {
        const shortcuts = this.load();
        delete shortcuts[alias];
        this.save(shortcuts);
        showToast('info', `Raccourci "/${alias}" supprimé`);
    },
    
    expand(input) {
        const shortcuts = this.load();
        for (const [alias, cmd] of Object.entries(shortcuts)) {
            if (input.startsWith(`/${alias}`)) {
                return input.replace(`/${alias}`, cmd);
            }
        }
        return input;
    }
};

// =====================================================
// AMÉLIORATION 40: Préréglages de RAM
// =====================================================
const RAM_PRESETS = {
    low: { min: 512, max: 1024, label: 'Faible (1 Go)' },
    medium: { min: 1024, max: 2048, label: 'Moyen (2 Go)' },
    high: { min: 2048, max: 4096, label: 'Élevé (4 Go)' },
    extreme: { min: 4096, max: 8192, label: 'Extrême (8 Go)' },
    dedicated: { min: 8192, max: 16384, label: 'Dédié (16 Go)' }
};

function applyRamPreset(presetId) {
    const preset = RAM_PRESETS[presetId];
    if (!preset) return;
    
    const minRam = document.getElementById('min-ram');
    const maxRam = document.getElementById('max-ram');
    
    if (minRam) minRam.value = preset.min;
    if (maxRam) maxRam.value = preset.max;
    
    showToast('success', `RAM: ${preset.label}`);
}

// =====================================================
// AMÉLIORATION 41: Copie rapide des informations serveur
// =====================================================
function copyServerInfo() {
    const info = {
        name: currentServer,
        status: document.querySelector('.server-status')?.textContent || 'Inconnu',
        version: document.querySelector('.server-version')?.textContent || 'Inconnue',
        players: document.querySelector('.player-count')?.textContent || '0',
        ip: window.location.hostname,
        port: '25565'
    };
    
    const text = `🎮 Serveur: ${info.name}
📊 Status: ${info.status}
🔢 Version: ${info.version}
👥 Joueurs: ${info.players}
🌐 IP: ${info.ip}:${info.port}`;
    
    navigator.clipboard.writeText(text)
        .then(() => showToast('success', 'Infos serveur copiées!'))
        .catch(() => showToast('error', 'Erreur de copie'));
}

// =====================================================
// AMÉLIORATION 42: Mode sombre/clair amélioré
// =====================================================
const themeManager = {
    key: 'mcpanel_theme',
    
    get() {
        return localStorage.getItem(this.key) || 'dark';
    },
    
    set(theme) {
        localStorage.setItem(this.key, theme);
        document.documentElement.dataset.theme = theme;
        document.body.classList.toggle('light-mode', theme === 'light');
        showToast('info', `Thème: ${theme === 'dark' ? 'Sombre' : 'Clair'}`);
    },
    
    toggle() {
        const current = this.get();
        this.set(current === 'dark' ? 'light' : 'dark');
    },
    
    init() {
        const saved = this.get();
        document.documentElement.dataset.theme = saved;
        document.body.classList.toggle('light-mode', saved === 'light');
    }
};

// =====================================================
// AMÉLIORATION 43: Gestion des fichiers de log
// =====================================================
async function loadLogFiles() {
    if (!currentServer) return;
    
    try {
        const response = await fetch(`/api/servers/${currentServer}/logs`);
        if (!response.ok) throw new Error('Erreur chargement logs');
        
        const logs = await response.json();
        const container = document.getElementById('log-files-list');
        if (!container) return;
        
        container.innerHTML = logs.map(log => `
            <div class="log-file-item" onclick="viewLogFile('${log.name}')">
                <span class="log-icon">📄</span>
                <span class="log-name">${log.name}</span>
                <span class="log-size">${formatSize(log.size)}</span>
                <span class="log-date">${new Date(log.modified).toLocaleDateString()}</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erreur chargement fichiers log:', err);
    }
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// =====================================================
// AMÉLIORATION 44: Annulation de la dernière commande
// =====================================================
const commandUndo = {
    lastCommand: null,
    undoMap: {
        'gamemode creative': 'gamemode survival',
        'gamemode survival': 'gamemode creative',
        'gamemode adventure': 'gamemode survival',
        'time set day': 'time set night',
        'time set night': 'time set day',
        'weather clear': 'weather rain',
        'weather rain': 'weather clear',
        'difficulty peaceful': 'difficulty normal',
        'difficulty easy': 'difficulty normal',
        'difficulty hard': 'difficulty normal',
        'gamerule doDaylightCycle false': 'gamerule doDaylightCycle true',
        'gamerule doDaylightCycle true': 'gamerule doDaylightCycle false',
        'gamerule keepInventory true': 'gamerule keepInventory false',
        'gamerule keepInventory false': 'gamerule keepInventory true'
    },
    
    track(cmd) {
        this.lastCommand = cmd;
    },
    
    undo() {
        if (!this.lastCommand) {
            showToast('info', 'Aucune commande à annuler');
            return;
        }
        
        const undoCmd = this.undoMap[this.lastCommand];
        if (undoCmd) {
            sendCommand(undoCmd);
            showToast('success', `Annulé: ${this.lastCommand}`);
            this.lastCommand = null;
        } else {
            showToast('warning', 'Cette commande ne peut pas être annulée');
        }
    }
};

// =====================================================
// AMÉLIORATION 45: Prévisualisation du monde
// =====================================================
function showWorldPreview(worldName) {
    const modal = document.createElement('div');
    modal.className = 'modal world-preview-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🗺️ Aperçu du monde: ${worldName}</h3>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="world-preview-content">
                <div class="world-info-grid">
                    <div class="world-stat">
                        <span class="stat-icon">📍</span>
                        <span class="stat-label">Spawn</span>
                        <span class="stat-value" id="world-spawn">Chargement...</span>
                    </div>
                    <div class="world-stat">
                        <span class="stat-icon">🌡️</span>
                        <span class="stat-label">Seed</span>
                        <span class="stat-value" id="world-seed">Chargement...</span>
                    </div>
                    <div class="world-stat">
                        <span class="stat-icon">📦</span>
                        <span class="stat-label">Taille</span>
                        <span class="stat-value" id="world-size">Chargement...</span>
                    </div>
                    <div class="world-stat">
                        <span class="stat-icon">⏰</span>
                        <span class="stat-label">Temps de jeu</span>
                        <span class="stat-value" id="world-time">Chargement...</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

// =====================================================
// AMÉLIORATION 46: Gestion des permissions simplifiée
// =====================================================
const COMMON_PERMISSIONS = [
    { name: 'minecraft.command.gamemode', desc: 'Changer de mode de jeu' },
    { name: 'minecraft.command.teleport', desc: 'Se téléporter' },
    { name: 'minecraft.command.give', desc: 'Donner des objets' },
    { name: 'minecraft.command.kick', desc: 'Expulser des joueurs' },
    { name: 'minecraft.command.ban', desc: 'Bannir des joueurs' },
    { name: 'minecraft.command.op', desc: 'Gérer les opérateurs' },
    { name: 'minecraft.command.time', desc: 'Modifier le temps' },
    { name: 'minecraft.command.weather', desc: 'Modifier la météo' }
];

function showPermissionHelper() {
    const perms = COMMON_PERMISSIONS.map(p => `
        <div class="perm-item" onclick="copyPermission('${p.name}')">
            <span class="perm-name">${p.name}</span>
            <span class="perm-desc">${p.desc}</span>
        </div>
    `).join('');
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>🔐 Permissions courantes</h3>
            <p class="perm-hint">Cliquez pour copier</p>
            <div class="perm-list">${perms}</div>
            <button class="btn-close" onclick="this.closest('.modal').remove()">Fermer</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function copyPermission(perm) {
    navigator.clipboard.writeText(perm);
    showToast('success', `Permission copiée: ${perm}`);
}

// =====================================================
// AMÉLIORATION 47: Surveillance automatique
// =====================================================
const autoMonitor = {
    interval: null,
    thresholds: {
        cpu: 90,
        memory: 85,
        players: 0
    },
    
    start(checkInterval = 30000) {
        this.stop();
        this.interval = setInterval(() => this.check(), checkInterval);
        showToast('info', 'Surveillance automatique activée');
    },
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    },
    
    async check() {
        try {
            const response = await fetch(`/api/servers/${currentServer}/stats`);
            if (!response.ok) return;
            
            const stats = await response.json();
            
            if (stats.cpu > this.thresholds.cpu) {
                showToast('warning', `⚠️ CPU élevé: ${stats.cpu}%`);
            }
            if (stats.memory > this.thresholds.memory) {
                showToast('warning', `⚠️ Mémoire élevée: ${stats.memory}%`);
            }
        } catch (err) {
            console.error('Erreur surveillance:', err);
        }
    },
    
    setThreshold(type, value) {
        if (this.thresholds.hasOwnProperty(type)) {
            this.thresholds[type] = value;
        }
    }
};

// =====================================================
// AMÉLIORATION 48: Quick actions bar
// =====================================================
function setupQuickActions() {
    const actions = [
        { icon: '💾', label: 'Sauvegarder', cmd: 'save-all', key: 'Ctrl+S' },
        { icon: '🌅', label: 'Jour', cmd: 'time set day', key: 'D' },
        { icon: '🌙', label: 'Nuit', cmd: 'time set night', key: 'N' },
        { icon: '☀️', label: 'Beau temps', cmd: 'weather clear', key: 'W' },
        { icon: '📢', label: 'Annonce', cmd: 'say', key: 'A' }
    ];
    
    const container = document.getElementById('quick-actions');
    if (!container) return;
    
    container.innerHTML = actions.map(a => `
        <button class="quick-action-btn" onclick="${a.cmd === 'say' ? 'promptAnnounce()' : `sendCommand('${a.cmd}')`}" title="${a.label} (${a.key})">
            <span class="qa-icon">${a.icon}</span>
            <span class="qa-label">${a.label}</span>
        </button>
    `).join('');
}

function promptAnnounce() {
    const msg = prompt('Message à annoncer:');
    if (msg && msg.trim()) {
        sendCommand(`say ${msg.trim()}`);
    }
}

// =====================================================
// AMÉLIORATION 49: État de connexion en temps réel
// =====================================================
const connectionStatus = {
    isOnline: navigator.onLine,
    
    init() {
        window.addEventListener('online', () => this.update(true));
        window.addEventListener('offline', () => this.update(false));
        this.update(navigator.onLine);
    },
    
    update(online) {
        this.isOnline = online;
        const indicator = document.getElementById('connection-indicator');
        if (indicator) {
            indicator.className = `connection-indicator ${online ? 'online' : 'offline'}`;
            indicator.title = online ? 'Connecté' : 'Hors ligne';
        }
        
        if (!online) {
            showToast('error', '🔌 Connexion perdue!');
        } else if (this.isOnline !== online) {
            showToast('success', '🌐 Connexion rétablie!');
        }
    }
};

// =====================================================
// AMÉLIORATION 50: Aide contextuelle intégrée
// =====================================================
const helpSystem = {
    tips: {
        console: [
            'Utilisez ↑/↓ pour naviguer dans l\'historique des commandes',
            'Tapez / pour voir les suggestions de commandes',
            'Ctrl+L efface l\'affichage de la console',
            'Double-cliquez sur une commande dans l\'historique pour la réutiliser'
        ],
        players: [
            'Cliquez sur un joueur pour voir ses options',
            'Utilisez la recherche pour filtrer les joueurs',
            'Le whisper envoie un message privé au joueur'
        ],
        plugins: [
            'Glissez-déposez un fichier .jar pour installer un plugin',
            'Les plugins favoris apparaissent en premier',
            '⚠️ Redémarrez le serveur après installation'
        ],
        config: [
            'Les modifications nécessitent un redémarrage',
            'Utilisez les templates pour une configuration rapide',
            'Survolez une option pour voir sa description'
        ],
        backups: [
            'Les backups automatiques protègent vos données',
            'Cliquez sur une backup pour la restaurer',
            'Gardez au moins 3 backups de sécurité'
        ]
    },
    
    show(section) {
        const tips = this.tips[section] || ['Aucune aide disponible'];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        
        const toast = document.createElement('div');
        toast.className = 'help-tip';
        toast.innerHTML = `
            <span class="help-icon">💡</span>
            <span class="help-text">${tip}</span>
            <button class="help-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 8000);
    },
    
    showAll(section) {
        const tips = this.tips[section] || [];
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>💡 Aide: ${section.charAt(0).toUpperCase() + section.slice(1)}</h3>
                <ul class="help-list">
                    ${tips.map(t => `<li>${t}</li>`).join('')}
                </ul>
                <button class="btn-close" onclick="this.closest('.modal').remove()">Fermer</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    }
};

// =====================================================
// Fonctions manquantes - Server Stats & Settings
// =====================================================

/**
 * Rafraîchit les statistiques du serveur - Section Stats
 */
async function refreshServerStats() {
    if (!currentServer) {
        showNotification('Aucun serveur sélectionné', 'warning');
        return;
    }
    
    try {
        showNotification('Actualisation des statistiques...', 'info');
        
        // Récupérer les stats du serveur
        const response = await apiFetch(`/api/server/${currentServer}/stats`);
        const stats = await response.json();
        
        // Mettre à jour les cartes de statistiques (IDs du HTML)
        const statUptime = document.getElementById('stat-uptime');
        if (statUptime) statUptime.textContent = stats.uptime || '--';
        
        const statTotalPlayers = document.getElementById('stat-total-players');
        if (statTotalPlayers) statTotalPlayers.textContent = `${stats.players_online || 0}/${stats.max_players || 20}`;
        
        const statWorldSize = document.getElementById('stat-world-size');
        if (statWorldSize) statWorldSize.textContent = stats.disk_usage || '--';
        
        const statPluginsCount = document.getElementById('stat-plugins-count');
        if (statPluginsCount) statPluginsCount.textContent = stats.plugin_count || 0;
        
        // Mettre aussi à jour les stats de la console si visibles
        const consoleCpu = document.getElementById('stat-cpu');
        if (consoleCpu) consoleCpu.textContent = stats.cpu ? `${stats.cpu.toFixed(1)}%` : '0%';
        
        const consoleRam = document.getElementById('stat-ram');
        if (consoleRam) consoleRam.textContent = stats.ram_mb ? `${stats.ram_mb} MB` : '0 MB';
        
        const consolePlayers = document.getElementById('stat-players');
        if (consolePlayers) consolePlayers.textContent = `${stats.players_online || 0}`;
        
        const consoleTps = document.getElementById('stat-tps');
        if (consoleTps) consoleTps.textContent = stats.tps || '20.0';
        
        // Charger les top joueurs
        await loadTopPlayers();
        
        // Initialiser les graphiques si pas encore fait
        initStatsCharts();
        
        showNotification('Statistiques actualisées', 'success');
        
    } catch (error) {
        console.error('Erreur lors du rafraîchissement des stats:', error);
        showNotification('Erreur lors du chargement des statistiques', 'error');
    }
}

/**
 * Charge les top joueurs du serveur
 */
async function loadTopPlayers() {
    if (!currentServer) return;
    
    const container = document.getElementById('top-players-grid');
    if (!container) return;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/players`);
        const players = await response.json();
        
        if (!players || players.length === 0) {
            container.innerHTML = '<p class="no-data">Aucun joueur enregistré</p>';
            return;
        }
        
        // Trier par temps de jeu (si disponible) ou par dernière connexion
        const sortedPlayers = players
            .sort((a, b) => (b.play_time || 0) - (a.play_time || 0))
            .slice(0, 10); // Top 10
        
        let html = '';
        sortedPlayers.forEach((player, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            const playtime = formatPlaytime(player.play_time || 0);
            const avatar = `https://mc-heads.net/avatar/${player.name}/32`;
            
            html += `
                <div class="top-player-card">
                    <div class="top-player-rank ${rankClass}">${index + 1}</div>
                    <img class="top-player-avatar" src="${avatar}" alt="${player.name}" onerror="this.src='/static/default-avatar.png'">
                    <div class="top-player-info">
                        <div class="top-player-name">${player.name}</div>
                        <div class="top-player-playtime">${playtime}</div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Erreur chargement top joueurs:', error);
        container.innerHTML = '<p class="no-data">Erreur de chargement</p>';
    }
}

/**
 * Formate le temps de jeu en heures/minutes
 */
function formatPlaytime(seconds) {
    if (!seconds || seconds === 0) return 'Jamais connecté';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
}

/**
 * Initialise les graphiques de statistiques
 */
let performanceChart = null;
let playersChart = null;

function initStatsCharts() {
    // Graphique de performance - Affiche un message "pas de données" car historique non disponible
    const perfCtx = document.getElementById('performance-chart');
    if (perfCtx && !performanceChart) {
        const ctx = perfCtx.getContext('2d');
        
        // Afficher un message au lieu de fausses données
        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: generateTimeLabels(24),
                datasets: [
                    {
                        label: 'CPU %',
                        data: new Array(24).fill(null), // Pas de données
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        tension: 0.4,
                        fill: true,
                        spanGaps: false
                    },
                    {
                        label: 'RAM %',
                        data: new Array(24).fill(null), // Pas de données
                        borderColor: '#3fb950',
                        backgroundColor: 'rgba(63, 185, 80, 0.1)',
                        tension: 0.4,
                        fill: true,
                        spanGaps: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#8b949e' }
                    },
                    // Message "pas de données"
                    title: {
                        display: true,
                        text: '📊 Historique non disponible - Démarrez le serveur pour collecter les données',
                        color: '#8b949e',
                        font: { size: 12, style: 'italic' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e' },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }
    
    // Graphique des joueurs - Même chose, pas de fausses données
    const playersCtx = document.getElementById('players-chart');
    if (playersCtx && !playersChart) {
        playersChart = new Chart(playersCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: generateTimeLabels(24),
                datasets: [{
                    label: 'Joueurs',
                    data: new Array(24).fill(0), // Pas de joueurs enregistrés
                    backgroundColor: 'rgba(88, 166, 255, 0.6)',
                    borderColor: '#58a6ff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: '👥 Historique des connexions - Les données seront collectées automatiquement',
                        color: '#8b949e',
                        font: { size: 12, style: 'italic' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e', stepSize: 1 },
                        min: 0
                    }
                }
            }
        });
    }
}

function generateTimeLabels(hours) {
    const labels = [];
    const now = new Date();
    for (let i = hours - 1; i >= 0; i--) {
        const time = new Date(now - i * 3600000);
        labels.push(time.getHours() + 'h');
    }
    return labels;
}

function generateRandomData(count, min, max) {
    return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Ouvre les paramètres du serveur sélectionné
 */
function openServerSettings() {
    if (!currentServer) {
        showNotification('Aucun serveur sélectionné', 'warning');
        return;
    }
    
    // Afficher la section des paramètres
    showSection('settings');
    
    // Charger les paramètres du serveur
    loadServerProperties();
}

/**
 * Charge les propriétés du serveur actuel
 */
async function loadServerProperties() {
    if (!currentServer) return;
    
    try {
        const response = await apiFetch(`/api/server/${currentServer}/properties`);
        const props = await response.json();
        
        // Remplir le formulaire de propriétés
        const propsContainer = document.getElementById('server-properties') || 
                               document.getElementById('properties-editor');
        
        if (propsContainer) {
            let html = '<div class="properties-grid">';
            
            for (const [key, value] of Object.entries(props)) {
                const inputType = typeof value === 'boolean' ? 'checkbox' : 
                                  typeof value === 'number' ? 'number' : 'text';
                
                html += `
                    <div class="property-item">
                        <label for="prop-${key}">${key.replace(/-/g, ' ').replace(/_/g, ' ')}</label>
                        ${inputType === 'checkbox' ? 
                            `<input type="checkbox" id="prop-${key}" name="${key}" ${value ? 'checked' : ''}>` :
                            `<input type="${inputType}" id="prop-${key}" name="${key}" value="${value}">`
                        }
                    </div>
                `;
            }
            
            html += '</div>';
            html += `<button class="btn btn-primary" onclick="saveServerProperties()">
                        <i class="fas fa-save"></i> Sauvegarder
                     </button>`;
            
            propsContainer.innerHTML = html;
        }
        
    } catch (error) {
        console.error('Erreur lors du chargement des propriétés:', error);
        showNotification('Erreur lors du chargement des propriétés', 'error');
    }
}

/**
 * Sauvegarde les propriétés du serveur
 */
async function saveServerProperties() {
    if (!currentServer) return;
    
    try {
        const form = document.querySelector('.properties-grid');
        if (!form) return;
        
        const inputs = form.querySelectorAll('input');
        const properties = {};
        
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                properties[input.name] = input.checked;
            } else if (input.type === 'number') {
                properties[input.name] = parseInt(input.value) || 0;
            } else {
                properties[input.name] = input.value;
            }
        });
        
        const response = await apiFetch(`/api/server/${currentServer}/properties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(properties)
        });
        
        if (response.ok) {
            showNotification('Propriétés sauvegardées avec succès', 'success');
        } else {
            throw new Error('Erreur lors de la sauvegarde');
        }
        
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        showNotification('Erreur lors de la sauvegarde des propriétés', 'error');
    }
}


// =====================================================
// Initialisation des nouvelles fonctionnalités
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    // Init thème
    themeManager.init();
    
    // Init status connexion
    connectionStatus.init();
    
    // Setup quick actions si disponible
    setupQuickActions();
    
    // Charger la langue sauvegardée
    loadLanguage();
    
    // Fermer le dropdown de langue quand on clique ailleurs
    document.addEventListener('click', (e) => {
        const langSelector = document.querySelector('.language-selector');
        const dropdown = document.getElementById('lang-dropdown');
        if (langSelector && dropdown && !langSelector.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    
    // Afficher aide au premier lancement
    if (!localStorage.getItem('mcpanel_help_shown')) {
        setTimeout(() => helpSystem.show('console'), 3000);
        localStorage.setItem('mcpanel_help_shown', 'true');
    }
});




