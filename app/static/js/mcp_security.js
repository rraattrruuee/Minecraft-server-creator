// mcp_security.js
// Gestion 2FA et opérations sensibles côté sécurité

async function start2FA() {
  try {
    const res = await apiFetch("/api/auth/2fa/start", { method: "POST" });
    const data = await res.json();
    if (data?.secret && data?.uri) {
      // show QR or URI in UI if present
      const el = document.getElementById("2fa-qr");
      if (el) el.src = data.uri;
      showToast("info", "2FA ready to confirm");
    }
  } catch (e) {
    console.error("start2FA failed", e);
    showToast("error", "Erreur 2FA");
  }
}

async function confirm2FA(code) {
  try {
    const res = await apiFetch("/api/auth/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.ok) showToast("success", "2FA activée");
    else showToast("error", data || "Erreur activation 2FA");
  } catch (e) {
    console.error("confirm2FA failed", e);
    showToast("error", "Erreur 2FA");
  }
}

async function disable2FA(password, code) {
  try {
    const res = await apiFetch("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    });
    const data = await res.json();
    if (data.ok) showToast("success", "2FA désactivée");
    else showToast("error", data || "Erreur désactivation 2FA");
  } catch (e) {
    console.error("disable2FA failed", e);
    showToast("error", "Erreur 2FA");
  }
}

function initSecurity() {
  globalThis.start2FA = start2FA;
  globalThis.confirm2FA = confirm2FA;
  globalThis.disable2FA = disable2FA;
  globalThis._mcp_start2FA = start2FA;
  globalThis._mcp_disable2FA = disable2FA;
}
