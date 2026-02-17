import os
import sys
import subprocess
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.manager import ServerManager


def test_start_uses_docker_compose_fallback(monkeypatch, tmp_path):
    base = str(tmp_path)
    mgr = ServerManager(base_dir=base)

    name = 'fallback_srv'
    srv_path = os.path.join(base, name)
    os.makedirs(srv_path, exist_ok=True)
    # create a docker-compose.yml so manager will try Docker mode
    with open(os.path.join(srv_path, 'docker-compose.yml'), 'w') as f:
        f.write('version: "3"\nservices:\n  mc:\n    image: alpine')

    # Ensure is_running returns False so start() proceeds
    monkeypatch.setattr(ServerManager, 'is_running', lambda self, n: False)

    calls = []

    def fake_run(cmd, cwd=None, check=False, stdout=None, stderr=None, text=None):
        calls.append(cmd)
        # Simulate `docker compose up -d` failing with the specific error the user reported
        if cmd == ['docker', 'compose', 'up', '-d']:
            raise subprocess.CalledProcessError(returncode=1, cmd=cmd, stderr=b"unknown shorthand flag: 'd' in -d")
        # Simulate `docker-compose up -d` succeeding
        if cmd == ['docker-compose', 'up', '-d']:
            return subprocess.CompletedProcess(cmd, 0, stdout=b"", stderr=b"")
        # Default success
        return subprocess.CompletedProcess(cmd, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr('subprocess.run', fake_run)

    # should not raise (fallback used)
    mgr.start(name)

    # check that fallback was attempted
    assert ['docker', 'compose', 'up', '-d'] in calls
    assert ['docker-compose', 'up', '-d'] in calls
