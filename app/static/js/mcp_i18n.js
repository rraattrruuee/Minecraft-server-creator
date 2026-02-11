async function changeLanguage(lang) {
  // Delegate to global changeLanguage if available (app_pro.js)
  if (typeof globalThis.changeLanguage === "function")
    return globalThis.changeLanguage(lang);

  try {
    const res = await apiFetch("/api/i18n/language", {
      method: "POST",
      body: JSON.stringify({ lang: lang }),
    });
    const result = await res.json();
    if (result.status === "success") {
      localStorage.setItem("mcp_lang", lang);
      location.reload();
    } else {
      console.warn("changeLanguage: server returned error", result);
    }
  } catch (err) {
    console.warn("changeLanguage failed", err);
  }
}
// mcp_i18n.js
// Gestion de l'internationalisation et application des traductions

function applyTranslations() {
  // Traduire les éléments avec data-i18n (textContent)
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = t(key);
    if (text && text !== key) el.textContent = text;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const text = t(key);
    if (text && text !== key) el.placeholder = text;
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const text = t(key);
    if (text && text !== key) el.title = text;
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    const text = t(key);
    if (text && text !== key) el.setAttribute("aria-label", text);
  });

  const pageTitle = t("app.title");
  if (pageTitle && pageTitle !== "app.title") document.title = pageTitle;
}

function toggleLanguageDropdown() {
  const dropdown = document.getElementById("lang-dropdown");
  if (dropdown) dropdown.classList.toggle("show");
}

function initI18n() {
  globalThis.changeLanguage = changeLanguage;
  globalThis.applyTranslations = applyTranslations;
  globalThis.toggleLanguageDropdown = toggleLanguageDropdown;
  globalThis._mcp_changeLanguage = changeLanguage;
  globalThis._mcp_applyTranslations = applyTranslations;
}
