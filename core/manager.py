import json
import os
import platform
import shutil
import subprocess
import time

import requests


class ServerManager:
    def __init__(self, base_dir="servers"):
        self.base_dir = os.path.abspath(base_dir)
        self.procs = {}

    def list_servers(self):
        if not os.path.exists(self.base_dir):
            return []
        return [
            d
            for d in os.listdir(self.base_dir)
            if os.path.isdir(os.path.join(self.base_dir, d))
        ]

    def get_available_versions(self):
        try:
            r = requests.get("https://api.papermc.io/v2/projects/paper")
            return r.json()["versions"][::-1]
        except:
            return ["1.20.4", "1.20.2"]

    def create_server(self, name, version):
        path = os.path.join(self.base_dir, name)
        if os.path.exists(path):
            raise Exception("Ce nom existe déjà")
        os.makedirs(path)
        os.makedirs(os.path.join(path, "plugins"))

        print(f"📥 Téléchargement Paper {version}...")
        v_url = f"https://api.papermc.io/v2/projects/paper/versions/{version}"
        b_data = requests.get(v_url).json()
        build = b_data["builds"][-1]
        d_url = f"https://api.papermc.io/v2/projects/paper/versions/{version}/builds/{build}/downloads/paper-{version}-{build}.jar"

        with open(os.path.join(path, "server.jar"), "wb") as f:
            f.write(requests.get(d_url).content)

        with open(os.path.join(path, "eula.txt"), "w") as f:
            f.write("eula=true")
        with open(os.path.join(path, "server.properties"), "w") as f:
            f.write("motd=Manager Server\n")

    def action(self, name, action):
        if action == "start":
            self.start(name)
        elif action == "stop":
            self.stop(name)
        elif action == "kill":
            self.kill(name)

    def start(self, name):
        if self.is_running(name):
            return
        path = os.path.join(self.base_dir, name)
        cmd = [
            "java",
            "-Xmx2G",
            "-Xms2G",
            "-Dfile.encoding=UTF-8",
            "-jar",
            "server.jar",
            "nogui",
        ]
        flags = subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0

        self.procs[name] = subprocess.Popen(
            cmd,
            cwd=path,
            stdin=subprocess.PIPE,
            stdout=open(os.path.join(path, "latest.log"), "w"),
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=flags,
        )

    def stop(self, name):
        if self.is_running(name):
            try:
                self.procs[name].stdin.write("stop\n")
                self.procs[name].stdin.flush()
            except:
                pass
            del self.procs[name]

    def kill(self, name):
        if self.is_running(name):
            self.procs[name].kill()
            del self.procs[name]

    def delete_server(self, name):
        self.kill(name)
        time.sleep(1)
        shutil.rmtree(os.path.join(self.base_dir, name))

    def is_running(self, name):
        return name in self.procs and self.procs[name].poll() is None

    def get_status(self, name):
        return {"status": "online" if self.is_running(name) else "offline"}

    def send_command(self, name, cmd):
        if self.is_running(name):
            self.procs[name].stdin.write(cmd + "\n")
            self.procs[name].stdin.flush()

    def get_logs(self, name):
        try:
            with open(
                os.path.join(self.base_dir, name, "latest.log"),
                "r",
                encoding="utf-8",
                errors="ignore",
            ) as f:
                return f.readlines()[-80:]
        except:
            return []

    def get_properties(self, name):
        p = {}
        try:
            with open(os.path.join(self.base_dir, name, "server.properties"), "r") as f:
                for l in f:
                    if "=" in l and not l.startswith("#"):
                        k, v = l.strip().split("=", 1)
                        p[k] = v
        except:
            pass
        return p

    def save_properties(self, name, props):
        path = os.path.join(self.base_dir, name, "server.properties")
        with open(path, "w") as f:
            f.write("# Configured by Manager\n")
            for k, v in props.items():
                f.write(f"{k}={v}\n")
