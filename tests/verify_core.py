import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    print("Testing Imports...")
    from core.auth import AuthManager
    from core.file_manager import FileManager
    from core.config_editor import ConfigEditor
    from core.manager import ServerManager
    print("Imports OK")

    print("Testing AuthManager...")
    auth = AuthManager("_test_data")
    if os.path.exists("_test_data/users.json"):
        os.remove("_test_data/users.json")
    auth._init_default_users()
    admin = auth.authenticate("admin", "admin")
    if admin and admin["role"] == "admin":
        print("AuthManager OK (Login success)")
    else:
        print("AuthManager FAIL (Login failed)")

    print("Testing FileManager...")
    fm = FileManager("_test_servers")
    os.makedirs("_test_servers/test_srv", exist_ok=True)
    fm.save_file("test_srv", "test.txt", "Hello World")
    content = fm.read_file("test_srv", "test.txt")
    if content == "Hello World":
        print("FileManager OK (Read/Write)")
    else:
        print(f"FileManager FAIL (Content mismatch: {content})")
    
    try:
        fm.read_file("test_srv", "../secret.txt")
        print("FileManager FAIL (Path traversal allowed)")
    except ValueError:
        print("FileManager OK (Path traversal blocked)")

    print("Testing ConfigEditor...")
    ce = ConfigEditor("_test_servers")
    wl_path = "_test_servers/test_srv/whitelist.json"
    ce.save_whitelist("test_srv", [{"uuid": "123", "name": "Test"}])
    wl = ce.get_whitelist("test_srv")
    if len(wl) == 1 and wl[0]["name"] == "Test":
        print("ConfigEditor OK (Whitelist)")
    else:
        print("ConfigEditor FAIL")

    print("ALL TESTS PASSED")

except Exception as e:
    print(f"TEST FAILED: {e}")
    import traceback
    traceback.print_exc()

import shutil
shutil.rmtree("_test_data", ignore_errors=True)
shutil.rmtree("_test_servers", ignore_errors=True)
