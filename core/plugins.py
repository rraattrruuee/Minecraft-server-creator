import os

import requests


class PluginManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def search(self, query):
        params = {"limit": 20, "platform": "PAPER"}
        if query and len(query.strip()) > 0:
            params["q"] = query
            params["sort"] = "-relevance"
        else:
            params["sort"] = "-stars"

        try:
            r = requests.get(
                "https://hangar.papermc.io/api/v1/projects",
                params=params,
                headers=self.headers,
            )
            if r.status_code == 200:
                return {"result": r.json().get("result", [])}
            return {"result": []}
        except:
            return {"result": []}

    def install(self, srv_name, author, slug):
        try:
            url = f"https://hangar.papermc.io/api/v1/projects/{author}/{slug}/versions"
            r = requests.get(url, params={"limit": 5}, headers=self.headers)
            data = r.json()

            if not data.get("result"):
                return {"success": False, "message": "Aucune version trouvée."}

            dl_url = None
            version_name = ""

            for v in data["result"]:
                downloads = v.get("downloads", {})
                if "PAPER" in downloads:
                    dl_url = downloads["PAPER"]["downloadUrl"]
                    version_name = v["name"]
                    break

            if not dl_url:
                first_v = data["result"][0]
                first_platform = list(first_v["downloads"].keys())[0]
                dl_url = first_v["downloads"][first_platform]["downloadUrl"]

            if not dl_url:
                return {
                    "success": False,
                    "message": "Lien de téléchargement introuvable.",
                }

            fname = f"{slug}-{version_name}.jar"
            print(f"📥 Téléchargement : {fname} -> {dl_url}")

            dest = os.path.join(self.base_dir, srv_name, "plugins", fname)

            with requests.get(dl_url, stream=True, headers=self.headers) as r:
                r.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)

            return {"success": True}
        except Exception as e:
            print(f"❌ Erreur Install: {e}")
            return {"success": False, "message": str(e)}
