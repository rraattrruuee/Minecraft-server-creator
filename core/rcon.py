import socket
import struct

class RconClient:
    def __init__(self, host="localhost", port=25575, password=""):
        self.host = host
        self.port = port
        self.password = password
        self.sock = None
        self.request_id = 0
    
    def connect(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5)
            self.sock.connect((self.host, self.port))
            return self._auth()
        except Exception as e:
            self.sock = None
            return False, str(e)
    
    def _auth(self):
        resp = self._send(3, self.password)
        if resp is None:
            return False, "Auth failed"
        return True, "OK"
    
    def _send(self, ptype, payload):
        self.request_id += 1
        data = struct.pack('<ii', self.request_id, ptype) + payload.encode('utf-8') + b'\x00\x00'
        packet = struct.pack('<i', len(data)) + data
        
        try:
            self.sock.sendall(packet)
            return self._recv()
        except:
            return None
    
    def _recv(self):
        try:
            # Read length
            length_data = self.sock.recv(4)
            if len(length_data) < 4:
                return None
            length = struct.unpack('<i', length_data)[0]
            
            # Read rest
            data = b''
            while len(data) < length:
                chunk = self.sock.recv(length - len(data))
                if not chunk:
                    break
                data += chunk
            
            if len(data) < 10:
                return None
            
            req_id, resp_type = struct.unpack('<ii', data[:8])
            body = data[8:-2].decode('utf-8', errors='replace')
            
            if req_id == -1:
                return None
            
            return body
        except:
            return None
    
    def command(self, cmd):
        if not self.sock:
            success, msg = self.connect()
            if not success:
                return None, msg
        
        resp = self._send(2, cmd)
        return resp, None if resp else "Command failed"
    
    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
            self.sock = None


# Helper for quick commands
def rcon_command(host, port, password, command):
    # Deprecated helper: use `RconClient` directly (provides better control over connection)
    client = RconClient(host, port, password)
    try:
        result, error = client.command(command)
        return result, error
    finally:
        client.close()

