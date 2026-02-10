// mcp_notifications.js
// Description: chargement, affichage et manipulation des notifications.
// Fonctions déplacées: loadNotifications, markAllNotificationsRead, clearNotifications, testDiscord

function getNotifIcon(type) {
  const icons = {
    server_start: "play-circle",
    server_stop: "stop-circle",
    crash: "exclamation-triangle",
    backup: "download",
    alert: "bell",
    info: "info-circle",
  };
  return icons[type] || "bell";
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const diff = (new Date() - date) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString();
}

async function loadNotifications() {
  try {
    const response = await apiFetch("/api/notifications");
    const data = await response.json();
    const notifications = data.notifications || [];
    const unreadCount = notifications.filter((n) => !n.read).length;
    const badge = document.getElementById("notif-badge");
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? "flex" : "none";
    }
    const container = document.getElementById("notifications-list");
    if (container) {
      if (notifications.length === 0) {
        container.innerHTML =
          '<p class="empty-message">Aucune notification</p>';
      } else {
        container.innerHTML = notifications
          .map(
            (n) => `
                    <div class="notification-item ${n.read ? "" : "unread"} ${n.severity || ""}">
                        <div class="notif-icon"><i class="fas fa-${getNotifIcon(n.type)}"></i></div>
                        <div class="notif-content"><strong>${n.title}</strong><p>${n.message}</p><span class="notif-time">${formatTime(n.timestamp)}</span></div>
                    </div>
                `,
          )
          .join("");
      }
    }
    const activityList = document.getElementById("activity-list");
    if (activityList) {
      const recent = notifications.slice(0, 5);
      if (recent.length === 0) {
        activityList.innerHTML =
          '<p class="empty-message">Aucune activite recente</p>';
      } else {
        activityList.innerHTML = recent
          .map(
            (n) => `
                    <div class="activity-item"><i class="fas fa-${getNotifIcon(n.type)} ${n.severity || ""}"></i><span>${n.title}</span><span class="time">${formatTime(n.timestamp)}</span></div>
                `,
          )
          .join("");
      }
    }
  } catch (error) {
    console.error("Erreur notifications:", error);
  }
}

async function markAllNotificationsRead() {
  try {
    await apiFetch("/api/notifications/read", { method: "POST" });
    loadNotifications();
    showToast("success", "Notifications marquées comme lues");
  } catch (error) {
    console.error("Erreur:", error);
  }
}

async function clearNotifications() {
  if (!confirm("Supprimer toutes les notifications ?")) return;
  try {
    await apiFetch("/api/notifications/clear", { method: "POST" });
    loadNotifications();
    showToast("success", "Notifications supprimées");
  } catch (error) {
    console.error("Erreur:", error);
  }
}

async function testDiscord() {
  const webhook = document.getElementById("discord-webhook")?.value.trim();
  if (!webhook) {
    showToast("error", "Entrez une URL de webhook");
    return;
  }
  try {
    const response = await apiFetch("/api/notifications/test/discord", {
      method: "POST",
      body: JSON.stringify({ webhook_url: webhook }),
    });
    const result = await response.json();
    if (result.success) showToast("success", "Message de test envoyé");
    else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur test Discord:", error);
  }
}

function initNotifications() {
  globalThis.loadNotifications = loadNotifications;
  globalThis.markAllNotificationsRead = markAllNotificationsRead;
  globalThis.clearNotifications = clearNotifications;
  globalThis.testDiscord = testDiscord;
  globalThis._mcp_loadNotifications = loadNotifications;
  globalThis._mcp_clearNotifications = clearNotifications;
}
