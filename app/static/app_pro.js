// MCPanel JS - Ultimate Edition with Visual Effects



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



async function apiFetch(url, options = {}) {

    return fetch(url, { ...options, credentials: 'include' });

}



// Init



window.addEventListener('DOMContentLoaded', async () => {

    // Charger les paramètres de performance et visuels en premier

    loadPerformanceSettings();

    loadVisualSettings();

    

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



function handleCommandInput(event) {

    if (event.key === 'Enter') sendCommand();

}



async function sendCommand() {

    if (!currentServer) return;

    const input = document.getElementById('cmd-input');

    const command = input.value.trim();

    if (!command) return;

    

    try {

        const response = await apiFetch(`/api/server/${currentServer}/command`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({ command })

        });

        const result = await response.json();

        if (result.status === 'success') {

            input.value = '';

            showToast('success', 'Commande envoye');

            setTimeout(loadLogs, 500);

        } else {

            showToast('error', result.message || 'Erreur');

        }

    } catch (error) {

        console.error('Erreur commande:', error);

        showToast('error', 'Erreur envoi commande');

    }

}



// ================================

// PLAYERS

// ================================



let currentPlayerName = null;

let currentPlayerUUID = null;



async function loadPlayers() {

    if (!currentServer) return;

    try {

        const response = await apiFetch(`/api/server/${currentServer}/players`);

        const players = await response.json();

        const grid = document.getElementById('players-grid');

        if (!grid) return;

        

        if (!players || players.length === 0) {

            grid.innerHTML = '<p class="empty-message">Aucun joueur</p>';

            return;

        }

        

        grid.innerHTML = players.map(player => `

            <div class="player-card" onclick="openPlayerModal('${player.name}', '${player.uuid}')" style="cursor:pointer">

                <img src="https://minotar.net/avatar/${player.name}/48" alt="${player.name}" class="player-avatar">

                <div class="player-info">

                    <span class="player-name">${player.name}</span>

                    <span class="player-uuid">${player.uuid ? player.uuid.substring(0, 8) + '...' : 'N/A'}</span>

                </div>

                <div class="player-actions">

                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'op')" title="OP"><i class="fas fa-star"></i></button>

                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'kick')" title="Kick"><i class="fas fa-sign-out-alt"></i></button>

                    <button onclick="event.stopPropagation(); playerAction('${player.name}', 'ban')" title="Ban"><i class="fas fa-ban"></i></button>

                </div>

            </div>

        `).join('');

    } catch (error) { console.error('Erreur joueurs:', error); }

}



async function openPlayerModal(name, uuid) {

    currentPlayerName = name;

    currentPlayerUUID = uuid;

    

    // Mettre a jour le header du modal

    document.getElementById('player-modal-avatar').src = `https://minotar.net/armor/bust/${name}/100`;

    document.getElementById('player-modal-name').textContent = name;

    document.getElementById('player-modal-uuid').textContent = uuid;

    

    // Afficher le modal

    document.getElementById('player-modal').classList.add('show');

    

    // Charger les details du joueur

    await loadPlayerDetails(uuid);

}



function closePlayerModal() {

    document.getElementById('player-modal').classList.remove('show');

    currentPlayerName = null;

    currentPlayerUUID = null;

}



async function loadPlayerDetails(uuid) {

    if (!currentServer || !uuid) return;

    

    try {

        const response = await apiFetch(`/api/server/${currentServer}/player/${uuid}`);

        const data = await response.json();

        

        // Mettre a jour les stats

        document.getElementById('player-health').textContent = data.health || 20;

        document.getElementById('player-food').textContent = data.food || 20;

        document.getElementById('player-xp').textContent = data.xp_level || 0;

        document.getElementById('player-deaths').textContent = data.stats?.deaths || 0;

        document.getElementById('player-playtime').textContent = data.stats?.play_time || '0h 0m';

        

        if (data.position) {

            document.getElementById('player-pos').textContent = 

                `${data.position.x}, ${data.position.y}, ${data.position.z}`;

        } else {

            document.getElementById('player-pos').textContent = 'N/A';

        }

        

        // Afficher l'inventaire

        renderInventory('player-inventory', data.inventory || [], 36);

        renderInventory('player-enderchest', data.enderchest || [], 27);

        renderArmor(data.armor || [], data.offhand);

        

    } catch (error) {

        console.error('Erreur chargement details joueur:', error);

        showToast('error', 'Impossible de charger les details du joueur');

    }

}

function getItemImageUrl(itemId) {
    // Clean up item ID
    const id = itemId.replace('minecraft:', '').toLowerCase();
    return `https://mc.nerothe.com/img/1.21.1/${id}.png`;
}

function handleItemImageError(img, itemId) {
    // Fallback URLs
    const fallbacks = [
        `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/item/${itemId}.png`,
        `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/${itemId}.png`
    ];
    
    if (!img.dataset.fallbackIndex) {
        img.dataset.fallbackIndex = 0;
    }
    
    const idx = parseInt(img.dataset.fallbackIndex);
    if (idx < fallbacks.length) {
        img.dataset.fallbackIndex = idx + 1;
        img.src = fallbacks[idx];
    } else {
        // Show item name as text if no image works
        img.style.display = 'none';
        const parent = img.parentElement;
        if (parent && !parent.querySelector('.item-text')) {
            const txt = document.createElement('span');
            txt.className = 'item-text';
            txt.textContent = itemId.substring(0, 3);
            parent.appendChild(txt);
        }
    }
}

function renderInventory(containerId, items, slots) {

    const container = document.getElementById(containerId);

    if (!container) return;

    

    // Crer une map des items par slot

    const itemMap = {};

    items.forEach(item => {

        itemMap[item.slot] = item;

    });

    

    let html = '';

    for (let i = 0; i < slots; i++) {

        const item = itemMap[i];

        if (item) {

            const itemName = formatItemName(item.id);

            html += `

                <div class="inv-slot has-item" title="${itemName} x${item.count}">

                    <img src="${getItemImageUrl(item.id)}" 

                         onerror="handleItemImageError(this, '${item.id}')"

                         alt="${itemName}">

                    ${item.count > 1 ? `<span class="item-count">${item.count}</span>` : ''}

                </div>

            `;

        } else {

            html += '<div class="inv-slot"></div>';

        }

    }

    

    container.innerHTML = html;

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

// PLUGINS

// ================================



async function loadInstalledPlugins() {

    if (!currentServer) return;

    try {

        const response = await apiFetch(`/api/server/${currentServer}/plugins/installed`);

        const plugins = await response.json();

        const container = document.getElementById('installed-plugins');

        if (!container) return;

        

        if (!plugins || plugins.length === 0) {

            container.innerHTML = '<p class="empty-message">Aucun plugin installe</p>';

            return;

        }

        

        container.innerHTML = plugins.map(plugin => `

            <div class="plugin-card">

                <div class="plugin-info"><i class="fas fa-puzzle-piece"></i><div><h4>${plugin.name}</h4><span class="plugin-size">${plugin.size_mb || 0} MB</span></div></div>

                <button class="btn-danger-sm" onclick="uninstallPlugin('${plugin.name}')"><i class="fas fa-trash"></i></button>

            </div>

        `).join('');

    } catch (error) { console.error('Erreur plugins:', error); }

}



async function searchPlugins() {

    const query = document.getElementById('plugin-search')?.value.trim();

    if (!query) { showToast('info', 'Entrez un terme de recherche'); return; }

    

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

            container.innerHTML = '<p class="empty-message">Aucun plugin trouve</p>';

            return;

        }

        

        container.innerHTML = plugins.map(plugin => `

            <div class="plugin-card search-result">

                <div class="plugin-info"><i class="fas fa-puzzle-piece"></i><div><h4>${plugin.name}</h4><p class="plugin-desc">${plugin.description || 'Pas de description'}</p></div></div>

                <button class="btn-primary-sm" onclick="installPlugin('${plugin.namespace?.owner || ''}/${plugin.namespace?.slug || plugin.name}', '${plugin.name}')"><i class="fas fa-download"></i></button>

            </div>

        `).join('');

        showToast('success', `${plugins.length} plugin(s) trouve(s)`);

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

// CONFIGURATION

// ================================



async function loadConfig() {

    if (!currentServer) return;

    try {

        const response = await apiFetch(`/api/server/${currentServer}/config`);

        const config = await response.json();

        const grid = document.getElementById('config-grid');

        if (!grid) return;

        

        const labels = {

            'motd': 'Message du jour', 'server-port': 'Port', 'max-players': 'Joueurs max',

            'white-list': 'Whitelist', 'online-mode': 'Mode online', 'pvp': 'PvP',

            'difficulty': 'Difficulte', 'gamemode': 'Mode de jeu'

        };

        

        grid.innerHTML = Object.entries(config).map(([key, value]) => `

            <div class="config-item"><label>${labels[key] || key}</label><input type="text" id="config-${key}" value="${value}" data-key="${key}"></div>

        `).join('');

    } catch (error) { console.error('Erreur config:', error); }

}



async function saveConfig() {

    if (!currentServer) return;

    try {

        const inputs = document.querySelectorAll('#config-grid input');

        const config = {};

        inputs.forEach(input => { config[input.dataset.key] = input.value; });

        

        const response = await apiFetch(`/api/server/${currentServer}/config`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(config)

        });

        const result = await response.json();

        if (result.status === 'success') showToast('success', 'Configuration sauvegarde');

        else showToast('error', result.message || 'Erreur');

    } catch (error) { console.error('Erreur sauvegarde config:', error); }

}



// ================================

// BACKUPS

// ================================



async function loadBackups() {

    if (!currentServer) return;

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

// INTERNATIONALIZATION (i18n)

// ================================



async function changeLanguage(lang) {
    try {
        const response = await apiFetch(`/api/i18n/translations?lang=${lang}`);
        if (!response.ok) throw new Error('Language not found');
        
        const data = await response.json();
        translations = data.translations || data;
        currentLang = lang;
        localStorage.setItem('language', lang);
        
        applyTranslations();
        showToast('success', `Language: ${lang.toUpperCase()}`);
    } catch (error) {
        console.error('Language change error:', error);
        showToast('error', 'Language change failed');
    }
}



function applyTranslations() {

    document.querySelectorAll('[data-i18n]').forEach(el => {

        const key = el.getAttribute('data-i18n');

        const text = getTranslation(key);

        if (text) {

            el.textContent = text;

        }

    });

    

    // Mettre a jour les placeholders

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {

        const key = el.getAttribute('data-i18n-placeholder');

        const text = getTranslation(key);

        if (text) {

            el.placeholder = text;

        }

    });

}



function getTranslation(key) {

    const keys = key.split('.');

    let value = translations;

    for (const k of keys) {

        if (value && value[k]) {

            value = value[k];

        } else {

            return null;

        }

    }

    return typeof value === 'string' ? value : null;

}



async function loadLanguage() {

    const savedLang = localStorage.getItem('language') || 'fr';

    const langSelect = document.getElementById('lang-select');

    if (langSelect) {

        langSelect.value = savedLang;

    }

    await changeLanguage(savedLang);

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
// PLAYIT.GG TUNNEL
// ================================

let playitPolling = null;

async function startPlayitTunnel() {
    const btn = document.getElementById('btn-playit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
    }
    
    try {
        const resp = await apiFetch('/api/playit/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: 25565 })
        });
        
        if (resp.status === 401) {
            showToast('error', 'Session expired, please login again');
            window.location.href = '/login';
            return;
        }
        
        const data = await resp.json();
        
        if (data.status === 'claim_required') {
            showPlayitClaim(data.claim_url);
            startPlayitPolling();
        } else if (data.status === 'success') {
            showPlayitAddress(data.address);
            startPlayitPolling();
        } else if (data.status === 'starting') {
            showToast('info', 'Tunnel starting...');
            startPlayitPolling();
        } else {
            showToast('error', data.message || 'Failed to start tunnel');
        }
    } catch (e) {
        console.error('Playit error:', e);
        showToast('error', 'Connection error: ' + e.message);
    }
    
    updatePlayitButton();
}

async function stopPlayitTunnel() {
    try {
        await apiFetch('/api/playit/stop', { method: 'POST' });
        showToast('success', 'Tunnel stopped');
        stopPlayitPolling();
        hidePlayitModal();
    } catch (e) {
        showToast('error', 'Failed to stop tunnel');
    }
    updatePlayitButton();
}

function startPlayitPolling() {
    if (playitPolling) return;
    playitPolling = setInterval(checkPlayitStatus, 3000);
}

function stopPlayitPolling() {
    if (playitPolling) {
        clearInterval(playitPolling);
        playitPolling = null;
    }
}

async function checkPlayitStatus() {
    try {
        const resp = await apiFetch('/api/playit/status');
        const data = await resp.json();
        
        if (data.status === 'running' && data.address) {
            showPlayitAddress(data.address);
        } else if (data.claim_url) {
            showPlayitClaim(data.claim_url);
        } else if (data.status === 'stopped') {
            stopPlayitPolling();
            hidePlayitModal();
        }
        
        updatePlayitButton(data.running);
    } catch (e) {
        // Ignore errors
    }
}

async function updatePlayitButton(running) {
    if (running === undefined) {
        try {
            const resp = await apiFetch('/api/playit/status');
            const data = await resp.json();
            running = data.running;
        } catch (e) {
            running = false;
        }
    }
    
    const btn = document.getElementById('btn-playit');
    if (!btn) return;
    
    btn.disabled = false;
    if (running) {
        btn.innerHTML = '<i class="fas fa-globe"></i> Tunnel Active';
        btn.classList.add('active');
        btn.onclick = showPlayitModal;
    } else {
        btn.innerHTML = '<i class="fas fa-share-alt"></i> Share Server';
        btn.classList.remove('active');
        btn.onclick = startPlayitTunnel;
    }
}

function showPlayitModal() {
    let modal = document.getElementById('modal-playit');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-playit';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3><i class="fas fa-globe"></i> Playit.gg Tunnel</h3>
                    <button class="btn-icon" onclick="hidePlayitModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" id="playit-content">
                    <p>Loading...</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-danger" onclick="stopPlayitTunnel()">
                        <i class="fas fa-stop"></i> Stop Tunnel
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('show');
    checkPlayitStatus();
}

function hidePlayitModal() {
    const modal = document.getElementById('modal-playit');
    if (modal) modal.classList.remove('show');
}

function showPlayitClaim(url) {
    const content = document.getElementById('playit-content');
    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-link" style="font-size: 48px; color: var(--primary); margin-bottom: 20px;"></i>
                <h4>Link your Playit.gg Account</h4>
                <p style="margin: 15px 0; color: var(--text-muted);">
                    Click the button below to link your account and get your tunnel address.
                </p>
                <a href="${url}" target="_blank" class="btn btn-primary" style="margin: 10px 0;">
                    <i class="fas fa-external-link-alt"></i> Open Playit.gg
                </a>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 15px;">
                    After linking, the tunnel address will appear here automatically.
                </p>
            </div>
        `;
    }
    showPlayitModal();
}

function showPlayitAddress(address) {
    const content = document.getElementById('playit-content');
    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: var(--success); margin-bottom: 20px;"></i>
                <h4>Tunnel Active!</h4>
                <p style="margin: 15px 0; color: var(--text-muted);">
                    Share this address with your friends:
                </p>
                <div style="background: var(--bg-tertiary); padding: 15px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <code style="font-size: 18px; font-weight: bold;" id="playit-address">${address}</code>
                    <button class="btn btn-sm" onclick="copyPlayitAddress()" title="Copy">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 15px;">
                    Your friends can join using this address in Minecraft multiplayer.
                </p>
            </div>
        `;
    }
    showPlayitModal();
}

function copyPlayitAddress() {
    const addr = document.getElementById('playit-address');
    if (addr) {
        navigator.clipboard.writeText(addr.textContent);
        showToast('success', 'Address copied!');
    }
}

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


