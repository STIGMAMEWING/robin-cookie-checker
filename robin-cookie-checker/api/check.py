# api/check.py - VERSI SIMPLIFIED
from http.server import BaseHTTPRequestHandler
import json, requests, time
from datetime import datetime, timezone

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        # Untuk test API
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            'status': 'API is running',
            'endpoint': '/api/check',
            'methods': ['POST', 'GET', 'OPTIONS']
        }
        self.wfile.write(json.dumps(response).encode())
    
    def do_POST(self):
        try:
            # Ambil data dari request
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            cookie = data.get('cookie', '')
            action = data.get('action', 'test')
            
            if action == 'test' and cookie:
                # Test single cookie
                result = self.check_cookie(cookie)
            else:
                result = {'error': 'Invalid request'}
            
            # Kirim response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def check_cookie(self, cookie):
        """Check single Roblox cookie"""
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Cookie': f'.ROBLOSECURITY={cookie}'
        }
        
        try:
            # Cek auth
            auth_url = "https://users.roblox.com/v1/users/authenticated"
            response = requests.get(auth_url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                user_data = response.json()
                return {
                    'status': 'valid',
                    'username': user_data.get('name', 'Unknown'),
                    'user_id': user_data.get('id', 'Unknown'),
                    'display_name': user_data.get('displayName', 'Unknown'),
                    'premium': False,
                    'robux': 0,
                    'error': None
                }
            else:
                return {
                    'status': 'invalid',
                    'error': f'HTTP {response.status_code}',
                    'username': 'Unknown'
                }
                
        except requests.exceptions.RequestException as e:
            return {
                'status': 'error',
                'error': str(e),
                'username': 'Unknown'
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': f'Unexpected error: {str(e)}',
                'username': 'Unknown'
            }

# Untuk testing lokal
if __name__ == '__main__':
    from http.server import HTTPServer
    server = HTTPServer(('localhost', 3000), handler)
    print("Server running on http://localhost:3000")
    server.serve_forever()
