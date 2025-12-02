# api/control.py
from http.server import BaseHTTPRequestHandler
import json
import checker_state  # Import dari check.py

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/api/control/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            status = {
                'is_checking': checker_state.is_checking,
                'status': checker_state.live_data['current_status'],
                'checked': checker_state.live_data['total_checked'],
                'valid': checker_state.live_data['valid_count'],
                'invalid': checker_state.live_data['invalid_count'],
                'robux': checker_state.live_data['total_robux']
            }
            
            self.wfile.write(json.dumps(status).encode())