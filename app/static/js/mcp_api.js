// mcp_api.js
// Description: fonctions de communication HTTP et gestion CSRF/retry.

// Refresh CSRF token
async function refreshCsrfToken() {
  try {
    const response = await fetch("/api/csrf-token", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = await response.json();
      const metaTag = document.querySelector('meta[name="csrf-token"]');
      if (metaTag && data.csrf_token) {
        metaTag.setAttribute("content", data.csrf_token);
        console.log("[CSRF] Token mis à jour avec succès");
        return true;
      }
    }
  } catch (e) {
    console.error("[CSRF] Erreur lors de la récupération du token:", e);
  }
  return false;
}

// getCsrfToken
function getCsrfToken() {
  let token = document.querySelector('meta[name="csrf-token"]')?.content;
  if (!token)
    token = document.querySelector('meta[name="csrf_token"]')?.content;
  if (!token) token = document.querySelector('input[name="csrf_token"]')?.value;
  if (!token) {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "csrf_token") {
        token = value;
        break;
      }
    }
  }
  return token || "";
}

async function ensureCsrfToken() {
  const token = getCsrfToken();
  if (!token) {
    console.warn("[CSRF] Token manquant, tentative de récupération...");
    await refreshCsrfToken();
  }
  return getCsrfToken();
}

// robustFetch (simple retry wrapper)
let apiCallCount = 0;
const MAX_API_CALLS = 5;
async function robustFetch(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      apiCallCount++;
      if (apiCallCount > MAX_API_CALLS)
        throw new Error("Trop d'appels API simultanés");
      const res = await fetch(url, options);
      apiCallCount--;
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    } catch (e) {
      apiCallCount--;
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// apiFetch: wrapper avec CSRF et gestion d'erreurs/retry
const API_TIMEOUT = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 400;
const apiStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalTime: 0,
};
async function apiFetch(url, options = {}, retries = 0) {
  apiStats.totalRequests++;
  try {
    if (!navigator.onLine) throw new Error("Pas de connexion internet");
    let csrfToken = getCsrfToken();
    const method = (options.method || "GET").toUpperCase();
    if (!csrfToken && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      await refreshCsrfToken();
      csrfToken = getCsrfToken();
    }
    const mergedHeaders = {
      Accept: "application/json",
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    };
    if (csrfToken) mergedHeaders["X-CSRF-Token"] = csrfToken;
    const controller = new AbortController();
    const timeout = options.timeout || API_TIMEOUT;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, {
      credentials: "include",
      headers: mergedHeaders,
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      if (response.status === 401) {
        try {
          if (typeof handleSessionExpired === "function")
            handleSessionExpired();
        } catch (e) {}
        throw new Error("Session expirée");
      }
      if (response.status === 403) {
        const errorData = await response
          .clone()
          .json()
          .catch(() => ({}));
        if (errorData.code === "CSRF_ERROR" && retries < 1) {
          await refreshCsrfToken();
          return apiFetch(url, options, retries + 1);
        }
      }
      if (response.status >= 500 && retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY * (retries + 1)));
        return apiFetch(url, options, retries + 1);
      }
    }
    apiStats.successfulRequests++;
    return response;
  } catch (error) {
    apiStats.failedRequests++;
    if (error.name === "AbortError") {
      if (retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        return apiFetch(url, options, retries + 1);
      }
      throw new Error("La requête a expiré");
    }
    if (
      (error.message || "").includes("Failed to fetch") &&
      retries < MAX_RETRIES
    ) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY * (retries + 1)));
      return apiFetch(url, options, retries + 1);
    }
    throw error;
  }
}

async function apiJson(url, options = {}) {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Erreur ${res.status}`);
  }
  return await res.json();
}

function apiPost(url, data) {
  return apiJson(url, { method: "POST", body: JSON.stringify(data) });
}

// Init
function initApi() {
  globalThis.getCsrfToken = getCsrfToken;
  globalThis.refreshCsrfToken = refreshCsrfToken;
  globalThis.ensureCsrfToken = ensureCsrfToken;
  globalThis.robustFetch = robustFetch;
  globalThis.apiFetch = apiFetch;
  globalThis.apiJson = apiJson;
  globalThis.apiPost = apiPost;
}

try {
  initApi();
} catch (e) {
  console.warn("initApi failed", e);
}
