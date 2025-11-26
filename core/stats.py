import json
import os

import nbtlib


class PlayerStatsManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir

    def get_all_players(self, srv_name):
        cache = os.path.join(self.base_dir, srv_name, "usercache.json")
        players = []
        if os.path.exists(cache):
            try:
                with open(cache, "r") as f:
                    for p in json.load(f):
                        players.append({"name": p["name"], "uuid": p["uuid"]})
            except:
                pass
        return players

    def get_player_details(self, srv_name, uuid):
        data = {
            "inventory": [],
            "stats": {"play_time": "0h 0m", "kills": 0, "deaths": 0, "blocks": 0},
        }

        nbt_path = os.path.join(
            self.base_dir, srv_name, "world", "playerdata", f"{uuid}.dat"
        )
        if os.path.exists(nbt_path):
            try:
                nbt_file = nbtlib.load(nbt_path)

                if "Inventory" in nbt_file:
                    for item in nbt_file["Inventory"]:
                        try:
                            raw_id = str(item.get("id", "minecraft:air")).replace(
                                "minecraft:", ""
                            )
                            slot = int(item.get("Slot", 0))
                            count = int(item.get("Count", 1))

                            data["inventory"].append(
                                {"id": raw_id, "slot": slot, "count": count}
                            )
                        except Exception as e:
                            print(f"⚠️ Item ignoré (malformé): {e}")
                            continue

            except Exception as e:
                print(f"⚠️ Erreur lecture fichier NBT {uuid}: {e}")

        # 2. LECTURE JSON STATS
        stat_path = os.path.join(
            self.base_dir, srv_name, "world", "stats", f"{uuid}.json"
        )
        if os.path.exists(stat_path):
            try:
                with open(stat_path, "r") as f:
                    s = json.load(f).get("stats", {})

                    ticks = s.get("minecraft:custom", {}).get("minecraft:play_time", 0)
                    mins = int(ticks / 20 / 60)
                    data["stats"]["play_time"] = f"{mins // 60}h {mins % 60}m"

                    data["stats"]["deaths"] = s.get("minecraft:custom", {}).get(
                        "minecraft:deaths", 0
                    )
                    data["stats"]["kills"] = sum(s.get("minecraft:killed", {}).values())
                    data["stats"]["blocks"] = sum(s.get("minecraft:mined", {}).values())
            except:
                pass

        return data
