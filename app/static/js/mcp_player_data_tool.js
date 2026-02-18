async function openPlayerModal(name, uuid) {
  currentPlayerName = name;
  currentPlayerUUID = uuid;

  // Mettre a jour le header du modal
  const avatar = document.getElementById("player-modal-avatar");
  const nameEl = document.getElementById("player-modal-name");
  const uuidEl = document.getElementById("player-modal-uuid");

  if (avatar) avatar.src = `https://mc-heads.net/body/${name}/100`;
  if (nameEl) nameEl.textContent = name;
  if (uuidEl) uuidEl.textContent = uuid || "UUID inconnu";

  // Afficher le modal
  const modal = document.getElementById("player-modal");
  if (modal) modal.classList.add("show");

  // Charger les details du joueur
  await loadPlayerDetails(uuid);
}

function closePlayerModal() {
  const modal = document.getElementById("player-modal");
  if (modal) modal.classList.remove("show");

  currentPlayerName = null;

  currentPlayerUUID = null;
}

async function loadPlayerDetails(uuid) {
  if (!currentServer || !uuid) return;

  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/player/${uuid}`,
    );

    const data = await response.json();

    // Mettre à jour les stats avec interface interactive
    const healthValue = data.health || 20;
    const foodValue = data.food || 20;
    const xpLevel = data.xp_level || 0;

    // Barre de vie interactive
    const healthContainer = document.getElementById("player-health-container");
    if (healthContainer) {
      healthContainer.innerHTML = renderHealthBar(
        healthValue,
        currentPlayerName,
      );
    } else {
      document.getElementById("player-health").textContent = healthValue;
    }

    // Barre de faim interactive
    const foodContainer = document.getElementById("player-food-container");
    if (foodContainer) {
      foodContainer.innerHTML = renderFoodBar(foodValue, currentPlayerName);
    } else {
      document.getElementById("player-food").textContent = foodValue;
    }

    document.getElementById("player-xp").textContent = xpLevel;

    document.getElementById("player-deaths").textContent =
      data.stats?.deaths || 0;

    document.getElementById("player-playtime").textContent =
      data.stats?.play_time || "0h 0m";

    if (data.position) {
      document.getElementById("player-pos").textContent =
        `${data.position.x}, ${data.position.y}, ${data.position.z}`;
    } else {
      document.getElementById("player-pos").textContent = "N/A";
    }

    // Afficher l'inventaire avec textures améliorées

    renderInventory("player-inventory", data.inventory || [], 36);

    renderInventory("player-enderchest", data.enderchest || [], 27);

    renderArmor(data.armor || [], data.offhand);
  } catch (error) {
    console.error("Erreur chargement details joueur:", error);

    showToast("error", "Impossible de charger les details du joueur");
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

  let hearts = "";

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
  const disabledAttr = isOnline ? "" : "disabled";
  const disabledClass = isOnline ? "" : "disabled";

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
            ${!isOnline ? '<span class="stat-offline-notice">Joueur hors ligne</span>' : ""}
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

  let foodIcons = "";

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
  const disabledAttr = isOnline ? "" : "disabled";
  const disabledClass = isOnline ? "" : "disabled";

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
            ${!isOnline ? '<span class="stat-offline-notice">Joueur hors ligne</span>' : ""}
        </div>
    `;
}

/**
 * Modifie les stats d'un joueur (vie ou faim) via commande
 */
async function modifyPlayerStat(playerName, stat, amount) {
  if (!currentServer || !playerName) return;

  try {
    let command = "";

    if (stat === "health") {
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
    } else if (stat === "food") {
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
        method: "POST",

        body: JSON.stringify({ command }),
      });

      if (response.ok) {
        showNotification(
          `${stat === "health" ? "Vie" : "Faim"} modifiée pour ${playerName}`,
          "success",
        );
        // Recharger les détails du joueur après un délai
        setTimeout(() => loadPlayerDetails(currentPlayerUUID), 1000);
      } else {
        throw new Error("Commande échouée");
      }
    }
  } catch (error) {
    console.error("Erreur modification stat:", error);
    showNotification("Impossible de modifier les stats du joueur", "error");
  }
}

/**
 * URLs des textures Minecraft avec fallbacks multiples (sources fiables 2024)
 */
const TEXTURE_SOURCES = [
  // Source 0: Local Assets (Priorité maximale)
  (id) => `/static/textures/items/${id.replace("minecraft:", "")}.png`,
  // Source 1: MinecraftItems API - Direct CDN
  (id) =>
    `https://minecraftitemids.com/item/32/${id.replace("minecraft:", "")}.png`,
  // Source 2: GitHub Raw - PrismarineJS assets
  (id) =>
    `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20/items/${id.replace("minecraft:", "")}.png`,
  // Source 3: Alternative GitHub
  (id) =>
    `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20/assets/minecraft/textures/item/${id.replace("minecraft:", "")}.png`,
  // Source 4: Fallback vers image par défaut
  (id) =>
    `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' fill='%23666'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='12'>?</text></svg>`,
];

// Cache pour éviter les requêtes répétées
const textureCache = new Map();
const failedTextures = new Set();

function getItemImageUrl(itemId) {
  // Clean up item ID
  const id = itemId.replace("minecraft:", "").toLowerCase();

  // Vérifier le cache
  if (textureCache.has(id)) {
    return textureCache.get(id);
  }

  // Retourner la première source (les fallbacks sont gérés par handleItemImageError)
  return TEXTURE_SOURCES[0](id);
}

function handleItemImageError(img, itemId) {
  const id = itemId.replace("minecraft:", "").toLowerCase();

  if (!img.dataset.fallbackIndex) {
    img.dataset.fallbackIndex = 1;
  }

  const idx = Number.parseInt(img.dataset.fallbackIndex);
  if (idx < TEXTURE_SOURCES.length) {
    img.dataset.fallbackIndex = idx + 1;
    img.src = TEXTURE_SOURCES[idx](id);
  } else {
    // Afficher une icône par défaut avec le nom
    img.style.display = "none";
    const parent = img.parentElement;
    if (parent && !parent.querySelector(".item-fallback")) {
      const fallback = document.createElement("div");
      fallback.className = "item-fallback";
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

  items.forEach((item) => {
    itemMap.set(item.slot, item);
    totalItems += item.count || 1;
  });

  const invType = containerId.includes("enderchest")
    ? "enderchest"
    : "inventory";
  const usedSlots = items.length;

  // Construction du HTML
  let slotsHtml = "";
  for (let i = 0; i < slots; i++) {
    const item = itemMap.get(i);
    if (item) {
      const itemName = formatItemName(item.id);
      slotsHtml += `
                <div class="inv-slot has-item" title="${itemName} x${item.count}">
                    <img src="${getItemImageUrl(item.id)}" 
                         onerror="handleItemImageError(this, '${item.id}')"
                         alt="${itemName}">
                    ${item.count > 1 ? `<span class="item-count">${item.count}</span>` : ""}
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
  let modal = document.getElementById("add-item-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "add-item-modal";
    modal.className = "modal";
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
  modal.dataset.slot = slot !== null ? slot : "";

  // Afficher le modal
  modal.classList.add("show");

  // Charger les items populaires par défaut
  loadPopularItems();

  // Focus sur la recherche
  setTimeout(() => {
    document.getElementById("item-search-input").focus();
  }, 100);
}

/**
 * Ferme le modal d'ajout d'item
 */
function closeAddItemModal() {
  const modal = document.getElementById("add-item-modal");
  if (modal) {
    modal.classList.remove("show");
    // Reset
    document.getElementById("item-search-input").value = "";
    document.getElementById("selected-item-preview").style.display = "none";
    document.getElementById("btn-give-item").disabled = true;
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
    "diamond_sword",
    "netherite_sword",
    "iron_sword",
    "golden_sword",
    "stone_sword",
    "wooden_sword",
    "bow",
    "crossbow",
    "trident",
    "mace",
  ],
  tools: [
    "diamond_pickaxe",
    "netherite_pickaxe",
    "iron_pickaxe",
    "golden_pickaxe",
    "stone_pickaxe",
    "diamond_axe",
    "netherite_axe",
    "iron_axe",
    "diamond_shovel",
    "netherite_shovel",
    "diamond_hoe",
    "netherite_hoe",
    "shears",
    "flint_and_steel",
    "fishing_rod",
  ],
  armor: [
    "diamond_helmet",
    "diamond_chestplate",
    "diamond_leggings",
    "diamond_boots",
    "netherite_helmet",
    "netherite_chestplate",
    "netherite_leggings",
    "netherite_boots",
    "iron_helmet",
    "iron_chestplate",
    "iron_leggings",
    "iron_boots",
    "golden_helmet",
    "golden_chestplate",
    "golden_leggings",
    "golden_boots",
    "elytra",
    "shield",
    "turtle_helmet",
  ],
  blocks: [
    "diamond_block",
    "netherite_block",
    "iron_block",
    "gold_block",
    "emerald_block",
    "obsidian",
    "crying_obsidian",
    "glowstone",
    "sea_lantern",
    "beacon",
    "tnt",
    "end_crystal",
    "respawn_anchor",
    "enchanting_table",
    "anvil",
  ],
  food: [
    "golden_apple",
    "enchanted_golden_apple",
    "cooked_beef",
    "cooked_porkchop",
    "golden_carrot",
    "bread",
    "cake",
    "cookie",
    "pumpkin_pie",
    "suspicious_stew",
  ],
  misc: [
    "ender_pearl",
    "eye_of_ender",
    "blaze_rod",
    "nether_star",
    "dragon_egg",
    "totem_of_undying",
    "elytra",
    "firework_rocket",
    "experience_bottle",
    "name_tag",
    "diamond",
    "netherite_ingot",
    "emerald",
    "lapis_lazuli",
    "redstone",
  ],
};

/**
 * Charge les items populaires
 */
function loadPopularItems() {
  const container = document.getElementById("items-search-results");
  if (!container) return;

  // Afficher tous les items populaires
  const allItems = [
    ...MINECRAFT_ITEMS.weapons.slice(0, 4),
    ...MINECRAFT_ITEMS.tools.slice(0, 4),
    ...MINECRAFT_ITEMS.armor.slice(0, 4),
    ...MINECRAFT_ITEMS.food.slice(0, 4),
    ...MINECRAFT_ITEMS.misc.slice(0, 4),
  ];

  displayItemsGrid(allItems);
}

/**
 * Filtre les items par catégorie
 */
function filterItemCategory(category, btn) {
  // Update active button
  document
    .querySelectorAll(".category-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  let items;
  if (category === "all") {
    items = [
      ...MINECRAFT_ITEMS.weapons,
      ...MINECRAFT_ITEMS.tools,
      ...MINECRAFT_ITEMS.armor,
      ...MINECRAFT_ITEMS.food,
      ...MINECRAFT_ITEMS.misc,
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

  const searchTerm = query.toLowerCase().replace(/\s+/g, "_");
  const allItems = [
    ...MINECRAFT_ITEMS.weapons,
    ...MINECRAFT_ITEMS.tools,
    ...MINECRAFT_ITEMS.armor,
    ...MINECRAFT_ITEMS.blocks,
    ...MINECRAFT_ITEMS.food,
    ...MINECRAFT_ITEMS.misc,
  ];

  const filtered = allItems.filter((item) => item.includes(searchTerm));

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
  const container = document.getElementById("items-search-results");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<div class="no-items">Aucun item trouvé</div>';
    return;
  }

  let html = "";
  items.forEach((item) => {
    const itemName = formatItemName(item);
    html += `
            <div class="item-option ${isCustom ? "custom-item" : ""}" 
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
  const preview = document.getElementById("selected-item-preview");
  preview.style.display = "flex";

  document.getElementById("preview-item-img").src = getItemImageUrl(itemId);
  document.getElementById("preview-item-name").textContent =
    formatItemName(itemId);
  document.getElementById("preview-item-id").textContent =
    `minecraft:${itemId}`;
  document.getElementById("item-quantity").value = 1;

  // Activer le bouton
  document.getElementById("btn-give-item").disabled = false;

  // Highlight l'item sélectionné
  document
    .querySelectorAll(".item-option")
    .forEach((el) => el.classList.remove("selected"));
  event.currentTarget.classList.add("selected");
}

/**
 * Ajuste la quantité d'item
 */
function adjustItemQuantity(delta) {
  const input = document.getElementById("item-quantity");
  let value = Number.parseInt(input.value) + delta;
  value = Math.max(1, Math.min(64, value));
  input.value = value;
}

/**
 * Définit la quantité d'item
 */
function setItemQuantity(value) {
  document.getElementById("item-quantity").value = value;
}

/**
 * Donne l'item au joueur via commande
 */
async function giveItemToPlayer() {
  if (!selectedItemToGive || !currentPlayerName || !currentServer) {
    showToast("error", "Erreur: informations manquantes");
    return;
  }

  const quantity =
    Number.parseInt(document.getElementById("item-quantity").value) || 1;
  const command = `give ${currentPlayerName} minecraft:${selectedItemToGive} ${quantity}`;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/command`, {
      method: "POST",

      body: JSON.stringify({ command }),
    });

    if (response.ok) {
      showToast(
        "success",
        `${formatItemName(selectedItemToGive)} x${quantity} donné à ${currentPlayerName}`,
      );
      closeAddItemModal();

      // Rafraîchir l'inventaire après un délai
      setTimeout(() => {
        if (currentPlayerUUID) {
          loadPlayerDetails(currentPlayerUUID);
        }
      }, 1000);
    } else {
      throw new Error("Erreur commande");
    }
  } catch (error) {
    console.error("Erreur give item:", error);
    showToast("error", "Impossible de donner l'item");
  }
}

/**
 * Ouvre le menu contextuel pour un item
 */
function openItemContextMenu(event, invType, slot, itemId, count) {
  event.stopPropagation();

  // Supprimer ancien menu
  const oldMenu = document.getElementById("item-context-menu");
  if (oldMenu) oldMenu.remove();

  const itemName = formatItemName(itemId);

  const menu = document.createElement("div");
  menu.id = "item-context-menu";
  menu.className = "context-menu";
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
  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.zIndex = "10000";

  document.body.appendChild(menu);

  // Fermer au clic ailleurs
  setTimeout(() => {
    document.addEventListener("click", function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    });
  }, 10);
}

/**
 * Supprime un item du slot (via clear)
 */
async function clearInventorySlot(slot, itemId) {
  if (!currentPlayerName || !currentServer) return;

  const itemName = itemId.replace("minecraft:", "");
  const command = `clear ${currentPlayerName} ${itemId} 64`;

  try {
    const response = await apiFetch(`/api/server/${currentServer}/command`, {
      method: "POST",

      body: JSON.stringify({ command }),
    });

    if (response.ok) {
      showToast(
        "success",
        `${formatItemName(itemName)} supprimé de l'inventaire`,
      );

      // Fermer le menu contextuel
      const menu = document.getElementById("item-context-menu");
      if (menu) menu.remove();

      // Rafraîchir l'inventaire
      setTimeout(() => {
        if (currentPlayerUUID) {
          loadPlayerDetails(currentPlayerUUID);
        }
      }, 500);
    }
  } catch (error) {
    showToast("error", "Erreur lors de la suppression");
  }
}

/**
 * Donne plus d'un item existant
 */
function giveMoreOfItem(itemId) {
  const menu = document.getElementById("item-context-menu");
  if (menu) menu.remove();

  openAddItemModal("inventory");

  // Pré-sélectionner l'item
  setTimeout(() => {
    selectItemToGive(itemId.replace("minecraft:", ""));
  }, 200);
}

/**
 * Copie la commande give pour un item
 */
function copyItemCommand(itemId) {
  const command = `/give @p ${itemId} 1`;
  navigator.clipboard.writeText(command).then(() => {
    showToast("success", "Commande copiée!");
  });

  const menu = document.getElementById("item-context-menu");
  if (menu) menu.remove();
}

function renderArmor(armor, offhand) {
  const container = document.getElementById("player-armor");

  if (!container) return;

  const armorSlots = [
    { slot: 103, name: "Casque", icon: "hard-hat" },

    { slot: 102, name: "Plastron", icon: "tshirt" },

    { slot: 101, name: "Jambieres", icon: "socks" },

    { slot: 100, name: "Bottes", icon: "shoe-prints" },
  ];

  const armorMap = {};

  armor.forEach((item) => {
    armorMap[item.slot] = item;
  });

  let html = "";

  armorSlots.forEach((slot) => {
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
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function switchInventoryTab(tab) {
  // Desactiver tous les onglets

  document
    .querySelectorAll(".inv-tab")
    .forEach((t) => t.classList.remove("active"));

  document
    .querySelectorAll(".inventory-container")
    .forEach((c) => (c.style.display = "none"));

  // Activer l'onglet selectionne (utiliser l'élément passé si disponible)
  try {
    if (typeof el !== "undefined" && el && el.classList)
      el.classList.add("active");
    else {
      const fallback = document.querySelector(`.inv-tab[onclick*="${tab}"]`);
      if (fallback) fallback.classList.add("active");
    }
  } catch (e) {
    console.warn("switchInventoryTab: failed to set active tab", e);
  }

  const view = document.getElementById(`${tab}-view`);
  if (view) view.style.display = "block";
}

async function playerAction(pseudo, action) {
  if (!currentServer) return;

  // Confirmation pour les actions dangereuses

  if (action === "ban" && !confirm(`Voulez-vous vraiment bannir ${pseudo} ?`))
    return;

  if (
    action === "kick" &&
    !confirm(`Voulez-vous vraiment expulser ${pseudo} ?`)
  )
    return;

  if (action === "kill" && !confirm(`Voulez-vous vraiment tuer ${pseudo} ?`))
    return;

  if (
    action === "clear" &&
    !confirm(`Voulez-vous vraiment vider l'inventaire de ${pseudo} ?`)
  )
    return;

  try {
    const response = await apiFetch(
      `/api/server/${currentServer}/player/action`,
      {
        method: "POST",

        body: JSON.stringify({ pseudo, act: action }),
      },
    );

    const result = await response.json();

    if (result.status === "success") {
      const actionNames = {
        op: "OP accorde e ",

        deop: "OP retire de",

        kick: "Expulse:",

        ban: "Banni:",

        kill: "Tue:",

        clear: "Inventaire vide:",

        gm_s: "Mode survie pour",

        gm_c: "Mode creatif pour",
      };

      showToast("success", `${actionNames[action] || action} ${pseudo}`);

      loadPlayers();

      // Recharger les details si le modal est ouvert

      if (currentPlayerUUID) {
        await loadPlayerDetails(currentPlayerUUID);
      }
    } else {
      showToast("error", result.message || "Action echoue");
    }
  } catch (error) {
    console.error("Erreur action joueur:", error);

    showToast("error", "Erreur lors de l'action");
  }
}

function initPlayerDataTool() {
  globalThis.openPlayerModal = openPlayerModal;
  globalThis.closePlayerModal = closePlayerModal;
  globalThis.loadPlayerDetails = loadPlayerDetails;
  globalThis.modifyPlayerStat = modifyPlayerStat;
  globalThis.openAddItemModal = openAddItemModal;
  globalThis.closeAddItemModal = closeAddItemModal;
  globalThis.filterItemCategory = filterItemCategory;
  globalThis.searchMinecraftItems = searchMinecraftItems;
  globalThis.selectItemToGive = selectItemToGive;
  globalThis.adjustItemQuantity = adjustItemQuantity;
  globalThis.setItemQuantity = setItemQuantity;
  globalThis.giveItemToPlayer = giveItemToPlayer;
  globalThis.clearInventorySlot = clearInventorySlot;
  globalThis.giveMoreOfItem = giveMoreOfItem;
  globalThis.copyItemCommand = copyItemCommand;
  globalThis.switchInventoryTab = switchInventoryTab;
  globalThis.playerAction = playerAction;
}

try {
  initPlayerDataTool();
} catch (e) {
  console.warn("initPlayerDataTool failed", e);
}
