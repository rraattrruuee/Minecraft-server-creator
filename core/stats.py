import json
import os
import re

import nbtlib


class PlayerStatsManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir

    def _validate_server_name(self, name):
        """Valide le nom du serveur"""
        if not name or not re.match(r'^[a-zA-Z0-9_-]+$', name):
            raise Exception("Nom de serveur invalide")
        return name

    def _validate_uuid(self, uuid):
        """Valide le format UUID"""
        uuid_pattern = r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
        if not uuid or not re.match(uuid_pattern, uuid):
            raise Exception("UUID invalide")
        return uuid

    def _get_server_path(self, srv_name):
        """Retourne le chemin sécurisé du serveur"""
        srv_name = self._validate_server_name(srv_name)
        path = os.path.join(self.base_dir, srv_name)
        if not os.path.abspath(path).startswith(os.path.abspath(self.base_dir)):
            raise Exception("Chemin invalide")
        return path

    def get_all_players(self, srv_name):
        """Récupère la liste de tous les joueurs"""
        server_path = self._get_server_path(srv_name)
        cache = os.path.join(server_path, "usercache.json")
        players = []
        
        if os.path.exists(cache):
            try:
                with open(cache, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for p in data:
                        if "name" in p and "uuid" in p:
                            players.append({
                                "name": p["name"],
                                "uuid": p["uuid"]
                            })
            except json.JSONDecodeError as e:
                print(f"[WARN] Erreur parsing usercache.json: {e}")
            except Exception as e:
                print(f"[WARN] Erreur lecture usercache: {e}")
        
        return players

    def get_player_details(self, srv_name, uuid):
        """Récupère les détails d'un joueur spécifique"""
        server_path = self._get_server_path(srv_name)
        uuid = self._validate_uuid(uuid)
        
        data = {
            "inventory": [],
            "enderchest": [],
            "armor": [],
            "offhand": None,
            "stats": {
                "play_time": "0h 0m",
                "kills": 0,
                "deaths": 0,
                "blocks": 0,
                "distance_walked": 0,
                "jumps": 0
            },
            "position": None,
            "dimension": "overworld",
            "health": 20,
            "food": 20,
            "xp_level": 0,
            "gamemode": 0
        }

        # Lecture du fichier NBT (données joueur)
        nbt_path = os.path.join(server_path, "world", "playerdata", f"{uuid}.dat")
        
        if os.path.exists(nbt_path):
            try:
                nbt_file = nbtlib.load(nbt_path)

                # Position du joueur
                if "Pos" in nbt_file:
                    pos = nbt_file["Pos"]
                    data["position"] = {
                        "x": round(float(pos[0]), 1),
                        "y": round(float(pos[1]), 1),
                        "z": round(float(pos[2]), 1)
                    }

                # Dimension
                if "Dimension" in nbt_file:
                    dim = str(nbt_file["Dimension"])
                    if "nether" in dim.lower():
                        data["dimension"] = "nether"
                    elif "end" in dim.lower():
                        data["dimension"] = "the_end"
                    else:
                        data["dimension"] = "overworld"

                # Santé et nourriture
                if "Health" in nbt_file:
                    data["health"] = round(float(nbt_file["Health"]), 1)
                if "foodLevel" in nbt_file:
                    data["food"] = int(nbt_file["foodLevel"])
                if "XpLevel" in nbt_file:
                    data["xp_level"] = int(nbt_file["XpLevel"])
                if "playerGameType" in nbt_file:
                    data["gamemode"] = int(nbt_file["playerGameType"])

                # Inventaire (slots 0-35 = hotbar + inventaire)
                if "Inventory" in nbt_file:
                    for item in nbt_file["Inventory"]:
                        try:
                            raw_id = str(item.get("id", "minecraft:air"))
                            clean_id = raw_id.replace("minecraft:", "").strip('"\'')
                            slot = int(item.get("Slot", 0))
                            count = int(item.get("Count", 1))
                            
                            item_data = {
                                "id": clean_id,
                                "slot": slot,
                                "count": count
                            }

                            # Armure (slots 100-103)
                            if 100 <= slot <= 103:
                                data["armor"].append(item_data)
                            # Offhand (slot -106 ou 150)
                            elif slot == -106 or slot == 150:
                                data["offhand"] = item_data
                            # Inventaire normal
                            else:
                                data["inventory"].append(item_data)
                        except Exception as e:
                            print(f"[WARN] Item ignoré (malformé): {e}")
                            continue

                # EnderChest
                if "EnderItems" in nbt_file:
                    for item in nbt_file["EnderItems"]:
                        try:
                            raw_id = str(item.get("id", "minecraft:air"))
                            clean_id = raw_id.replace("minecraft:", "").strip('"\'')
                            slot = int(item.get("Slot", 0))
                            count = int(item.get("Count", 1))

                            data["enderchest"].append({
                                "id": clean_id,
                                "slot": slot,
                                "count": count
                            })
                        except Exception as e:
                            print(f"[WARN] EnderItem ignoré: {e}")
                            continue

            except Exception as e:
                print(f"[WARN] Erreur lecture fichier NBT {uuid}: {e}")

        # Lecture des statistiques JSON
        stat_path = os.path.join(server_path, "world", "stats", f"{uuid}.json")
        
        if os.path.exists(stat_path):
            try:
                with open(stat_path, "r", encoding="utf-8") as f:
                    stats_data = json.load(f)
                    s = stats_data.get("stats", {})
                    custom = s.get("minecraft:custom", {})

                    # Temps de jeu
                    ticks = custom.get("minecraft:play_time", 0)
                    mins = int(ticks / 20 / 60)
                    hours = mins // 60
                    remaining_mins = mins % 60
                    data["stats"]["play_time"] = f"{hours}h {remaining_mins}m"

                    # Morts
                    data["stats"]["deaths"] = custom.get("minecraft:deaths", 0)
                    
                    # Kills (somme de tous les mobs tués)
                    killed = s.get("minecraft:killed", {})
                    data["stats"]["kills"] = sum(killed.values()) if killed else 0
                    
                    # Blocs minés
                    mined = s.get("minecraft:mined", {})
                    data["stats"]["blocks"] = sum(mined.values()) if mined else 0
                    
                    # Distance marchée (en mètres)
                    walk_cm = custom.get("minecraft:walk_one_cm", 0)
                    data["stats"]["distance_walked"] = round(walk_cm / 100, 1)
                    
                    # Sauts
                    data["stats"]["jumps"] = custom.get("minecraft:jump", 0)

            except json.JSONDecodeError as e:
                print(f"[WARN] Erreur parsing stats JSON: {e}")
            except Exception as e:
                print(f"[WARN] Erreur lecture stats {uuid}: {e}")

        return data

    def get_ops(self, srv_name):
        """Récupère la liste des opérateurs"""
        server_path = self._get_server_path(srv_name)
        ops_path = os.path.join(server_path, "ops.json")
        
        if os.path.exists(ops_path):
            try:
                with open(ops_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[WARN] Erreur lecture ops.json: {e}")
        
        return []

    def get_banned(self, srv_name):
        """Récupère la liste des joueurs bannis"""
        server_path = self._get_server_path(srv_name)
        banned_path = os.path.join(server_path, "banned-players.json")
        
        if os.path.exists(banned_path):
            try:
                with open(banned_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[WARN] Erreur lecture banned-players.json: {e}")
        
        return []

    def get_whitelist(self, srv_name):
        """Récupère la whitelist"""
        server_path = self._get_server_path(srv_name)
        whitelist_path = os.path.join(server_path, "whitelist.json")
        
        if os.path.exists(whitelist_path):
            try:
                with open(whitelist_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[WARN] Erreur lecture whitelist.json: {e}")
        
        return []
