// mcp_auth.js
// Description: gestion utilisateurs, login/logout et sécurité liée aux comptes.
// Fonctions déplacées depuis `app_pro.js` : logout, changePassword, createUser, loadUsers

async function checkAuth() {
  try {
    const response = await apiFetch("/api/auth/user");
    if (response.status === 401) {
      globalThis.location.href = "/login";
      return;
    }
    const data = await response.json();
    if (data.status === "success") {
      currentUser = data.user;
      updateUserUI();
    }
  } catch (error) {
    console.error("Erreur auth:", error);
  }
}

function updateUserUI() {
  if (!currentUser) return;
  const userName = document.getElementById("user-name");
  const userRole = document.getElementById("user-role");
  if (userName) userName.textContent = currentUser.username;
  if (userRole)
    userRole.textContent =
      currentUser.role === "admin" ? "Administrateur" : "Utilisateur";
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = currentUser.role === "admin" ? "" : "none";
  });
}

async function _logout() {
  // Simple redirect to server logout endpoint (keeps behaviour identical)
  globalThis.location.href = "/logout";
}

async function _changePassword() {
  const oldPassword =
    (document.getElementById("old-password") || {}).value || "";
  const newPassword =
    (document.getElementById("new-password") || {}).value || "";
  const confirm =
    (document.getElementById("confirm-password") || {}).value || "";

  if (!oldPassword || !newPassword || !confirm) {
    showToast("error", "Veuillez remplir tous les champs");
    return;
  }

  if (newPassword !== confirm) {
    showToast("error", "Les mots de passe ne correspondent pas");
    return;
  }

  if (
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    showToast("error", "Mot de passe trop faible");
    return;
  }

  try {
    await ensureCsrfToken();
    const res = await apiFetch("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });
    const data = await res.json();
    if (data.status === "success") {
      showToast("success", data.message || "Mot de passe modifié");
      (document.getElementById("old-password") || {}).value = "";
      (document.getElementById("new-password") || {}).value = "";
      (document.getElementById("confirm-password") || {}).value = "";
    } else {
      showToast(
        "error",
        data.message || "Erreur lors du changement de mot de passe",
      );
    }
  } catch (e) {
    console.error("Erreur changePassword:", e);
    showToast("error", "Erreur API");
  }
}

async function loadUsers() {
  try {
    const response = await apiFetch("/api/auth/users");
    const data = await response.json();
    const container = document.getElementById("users-list");
    if (!container) return;
    const users = data.users || [];
    container.innerHTML = users
      .map(
        (user) => `
            <div class="user-item">
                <div class="user-info"><i class="fas fa-user"></i><span>${user.username}</span><span class="user-role-badge ${user.role}">${user.role}</span></div>
                ${user.username !== "admin" ? `<button class="btn-danger-sm" onclick="deleteUser('${user.username}')"><i class="fas fa-trash"></i></button>` : ""}
            </div>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Erreur users:", error);
  }
}

function openUserModal() {
  document.getElementById("user-modal")?.classList.add("show");
}

function closeUserModal() {
  document.getElementById("user-modal")?.classList.remove("show");
}

async function _createUser(event) {
  if (event && event.preventDefault) event.preventDefault();
  const username = document.getElementById("new-username")?.value.trim();
  const password = document.getElementById("new-user-password")?.value;
  const role = document.getElementById("new-role")?.value || "user";
  try {
    const response = await apiFetch("/api/auth/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    const result = await response.json();
    if (result.status === "success") {
      showToast("success", "Utilisateur créé");
      closeUserModal();
      loadUsers();
      (document.getElementById("new-username") || {}).value = "";
      (document.getElementById("new-user-password") || {}).value = "";
    } else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur creation user:", error);
  }
}

async function deleteUser(username) {
  if (!confirm(`Supprimer l'utilisateur ${username} ?`)) return;
  try {
    const response = await apiFetch(`/api/auth/users/${username}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (result.status === "success") {
      showToast("success", "Utilisateur supprimé");
      loadUsers();
    } else showToast("error", result.message || "Erreur");
  } catch (error) {
    console.error("Erreur suppression user:", error);
  }
}

function initAuth() {
  globalThis.checkAuth = checkAuth;
  globalThis.updateUserUI = updateUserUI;
  globalThis.logout = _logout;
  globalThis.changePassword = _changePassword;
  globalThis.loadUsers = loadUsers;
  globalThis.createUser = _createUser;
  globalThis.deleteUser = deleteUser;
  // underscored aliases for compatibility
  globalThis._mcp_changePassword = _changePassword;
  globalThis._mcp_createUser = _createUser;
  globalThis._mcp_logout = _logout;
}
