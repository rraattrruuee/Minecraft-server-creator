// mcp_utils.js
// Description: helpers réutilisables et utils DOM.
// Contient des versions canoniques de debounce, throttle, escapeHtml, etc.

// Debounce
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

// Throttle
function throttle(func, limit) {
  let inThrottle;
  let lastResult;
  return function (...args) {
    const context = this;
    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
    return lastResult;
  };
}

// Sleep
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Escape helpers
function escapeHtml(unsafe) {
  if (typeof unsafe !== "string") return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlAttr(unsafe) {
  return escapeHtml(unsafe);
}

// Clipboard
async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fallback to legacy
    }
  }
  // Legacy fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch (e) {
    document.body.removeChild(ta);
    throw e;
  }
}

// Toasts (simple queue)
const _toastQueue = [];
let _toastShowing = false;

function createToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function showToast(type, message) {
  const container = createToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = {
    success: "check-circle",
    error: "exclamation-circle",
    info: "info-circle",
    warning: "exclamation-triangle",
  };
  toast.innerHTML = `<i class="fas fa-${icons[type] || "info-circle"}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showToastQueued(message, type = "info", duration = 3000) {
  _toastQueue.push({ message, type, duration });
  processToastQueue();
}

function processToastQueue() {
  if (_toastShowing || _toastQueue.length === 0) return;
  _toastShowing = true;
  const { message, type, duration } = _toastQueue.shift();
  showToast(type, message);
  setTimeout(
    () => {
      _toastShowing = false;
      processToastQueue();
    },
    Math.min(duration, 1500),
  );
}

// Interval helpers
const __mcp_intervals = {};
function startInterval(name, fn, delay) {
  stopInterval(name);
  __mcp_intervals[name] = setInterval(fn, delay);
}
function stopInterval(name) {
  if (__mcp_intervals[name]) {
    clearInterval(__mcp_intervals[name]);
    delete __mcp_intervals[name];
  }
}

// Animation helper (requestAnimationFrame)
const __mcp_animations = {};
function startAnimation(name, fn) {
  stopAnimation(name);
  let id;
  function loop(ts) {
    fn(ts);
    id = requestAnimationFrame(loop);
    __mcp_animations[name] = id;
  }
  id = requestAnimationFrame(loop);
  __mcp_animations[name] = id;
}
function stopAnimation(name) {
  if (__mcp_animations[name]) {
    cancelAnimationFrame(__mcp_animations[name]);
    delete __mcp_animations[name];
  }
}

// Basic sanitizers
function sanitizeInput(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}
function validateInput(str, type = "text") {
  if (typeof str !== "string") return false;
  if (type === "text") return str.length < 200 && !/\0/.test(str);
  if (type === "cmd") return /^\/?[a-z0-9_\- ]+$/i.test(str);
  return true;
}

// Initialization helper
function initUtils() {
  // expose canonical implementations for compatibility
  globalThis._debounce = debounce;
  globalThis._throttle = throttle;
  globalThis._sleep = sleep;
  globalThis._escapeHtml = escapeHtml;
  globalThis._escapeHtmlAttr = escapeHtmlAttr;
  globalThis._copyToClipboard = copyToClipboard;
  globalThis._showToast = showToast;
  globalThis._showToastQueued = showToastQueued;
  globalThis._startInterval = startInterval;
  globalThis._stopInterval = stopInterval;
  globalThis._startAnimation = startAnimation;
  globalThis._stopAnimation = stopAnimation;
  globalThis._sanitizeInput = sanitizeInput;
  globalThis._validateInput = validateInput;

  // also provide non-underscore aliases for backward compatibility
  globalThis.debounce = globalThis._debounce;
  globalThis.throttle = globalThis._throttle;
  globalThis.sleep = globalThis._sleep;
  globalThis.escapeHtml = globalThis._escapeHtml;
  globalThis.escapeHtmlAttr = globalThis._escapeHtmlAttr;
  globalThis.copyToClipboard = globalThis._copyToClipboard;
  globalThis.showToast = globalThis._showToast;
  globalThis.showToastQueued = globalThis._showToastQueued;
}

// Run init immediately to restore compatibility if loader runs this file directly
try {
  initUtils();
} catch (e) {
  console.warn("initUtils failed", e);
}

async function detectPublicIP() {
  try {
    showToast("info", "Detection de l'IP publique...");

    const response = await fetch("https://api.ipify.org?format=json");

    const data = await response.json();

    const ipInput = document.getElementById("custom-ip");

    if (ipInput && data.ip) {
      ipInput.value = data.ip;

      showToast("success", `IP detecte: ${data.ip}`);
    }
  } catch (error) {
    console.error("Erreur detection IP:", error);

    showToast("error", "Impossible de detecter l'IP publique");
  }
}

function saveAddressConfig() {
  const config = {
    useSubdomain: document.getElementById("use-subdomain")?.checked || false,

    domain: document.getElementById("custom-domain")?.value || "",

    customIP: document.getElementById("custom-ip")?.value || "",
  };

  localStorage.setItem("serverAddressConfig", JSON.stringify(config));

  showToast("success", "Configuration d'adresse sauvegarde");
}
