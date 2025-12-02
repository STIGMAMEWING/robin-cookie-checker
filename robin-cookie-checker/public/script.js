// ============================================
// KONFIGURASI
// ============================================
const API_BASE_URL = window.location.origin; // Otomatis pakai domain saat ini
const DASHBOARD_PASSWORD = "admin123"; // Ganti dengan password Anda
const SAMPLE_COOKIE = "_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_testcookie123";

// ============================================
// STATE & VARIABLES
// ============================================
let currentWebhook = '';
let isChecking = false;
let refreshInterval = null;
let apiConnected = false;

// ============================================
// DOM ELEMENTS
// ============================================
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const passwordInput = document.getElementById('password');
const webhookInput = document.getElementById('webhook');
const cookiesInput = document.getElementById('cookiesInput');
const sampleBtn = document.getElementById('sampleBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const testBtn = document.getElementById('testBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const refreshResults = document.getElementById('refreshResults');
const resultsBody = document.getElementById('resultsBody');
const noResults = document.getElementById('noResults');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressText = document.getElementById('progressText');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const apiStatusIcon = document.getElementById('apiStatusIcon');
const apiStatusText = document.getElementById('apiStatusText');
const cookieCount = document.getElementById('cookieCount');
const currentTime = document.getElementById('currentTime');

// Stats elements
const validCount = document.getElementById('validCount');
const invalidCount = document.getElementById('invalidCount');
const totalRobux = document.getElementById('totalRobux');
const premiumCount = document.getElementById('premiumCount');

// Toast elements
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const toastIcon = document.getElementById('toastIcon');
const toastClose = document.getElementById('toastClose');

// ============================================
// EVENT LISTENERS
// ============================================
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
passwordInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleLogin());
cookiesInput.addEventListener('input', updateCookieCount);
sampleBtn.addEventListener('click', addSampleCookie);
startBtn.addEventListener('click', startChecking);
stopBtn.addEventListener('click', stopChecking);
testBtn.addEventListener('click', testSingleCookie);
clearBtn.addEventListener('click', clearResults);
exportBtn.addEventListener('click', exportValidCookies);
refreshResults.addEventListener('click', fetchResults);
toastClose.addEventListener('click', hideToast);

// ============================================
// LOGIN & AUTH FUNCTIONS
// ============================================
function handleLogin() {
    const password = passwordInput.value.trim();
    const webhook = webhookInput.value.trim();
    
    if (password !== DASHBOARD_PASSWORD) {
        showToast('Password salah!', 'error');
        passwordInput.focus();
        return;
    }
    
    // Simpan webhook
    currentWebhook = webhook;
    
    // Simpan login state
    localStorage.setItem('cookieCheckerLoggedIn', 'true');
    if (webhook) {
        localStorage.setItem('cookieCheckerWebhook', webhook);
    }
    
    // Switch to dashboard
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    
    showToast('Login berhasil! Selamat datang di dashboard.', 'success');
    
    // Init dashboard
    initDashboard();
}

function handleLogout() {
    if (isChecking) {
        if (!confirm('Checking masih berjalan. Yakin ingin logout?')) {
            return;
        }
        stopChecking();
    }
    
    // Clear state
    localStorage.removeItem('cookieCheckerLoggedIn');
    currentWebhook = '';
    
    // Switch to login
    dashboardSection.style.display = 'none';
    loginSection.style.display = 'flex';
    passwordInput.value = '';
    webhookInput.value = '';
    
    showToast('Logout berhasil!', 'info');
    
    // Stop auto-refresh
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// ============================================
// INIT DASHBOARD
// ============================================
function initDashboard() {
    // Load saved webhook
    const savedWebhook = localStorage.getItem('cookieCheckerWebhook');
    if (savedWebhook) {
        webhookInput.value = savedWebhook;
        currentWebhook = savedWebhook;
    }
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Start time updater
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Check API connection
    checkApiConnection();
    
    // Load existing results
    fetchResults();
}

function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(() => {
        updateStatus();
        if (isChecking) {
            fetchResults();
        }
    }, 2000); // Update setiap 2 detik
}

// ============================================
// API CONNECTION
// ============================================
async function checkApiConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/check`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            apiConnected = true;
            apiStatusIcon.className = 'fas fa-wifi';
            apiStatusText.textContent = 'API Connected';
            apiStatusIcon.style.color = '#2ecc71';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        apiConnected = false;
        apiStatusIcon.className = 'fas fa-wifi-slash';
        apiStatusText.textContent = 'API Disconnected';
        apiStatusIcon.style.color = '#e74c3c';
        showToast('API tidak terhubung. Periksa koneksi.', 'error');
    }
}

// ============================================
// COOKIE UTILITIES
// ============================================
function parseCookies(text) {
    if (!text) return [];
    
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => {
            // Filter hanya line yang mengandung cookie format
            return line.length > 0 && 
                   (line.includes('_|WARNING:-DO-NOT-SHARE-THIS.') || 
                    line.length > 50); // Atau panjang minimum
        });
}

function updateCookieCount() {
    const cookies = parseCookies(cookiesInput.value);
    const count = cookies.length;
    cookieCount.textContent = `${count} cookies ditemukan`;
    cookieCount.style.color = count > 0 ? '#2ecc71' : '#e74c3c';
    
    // Update button states
    startBtn.disabled = count === 0;
    testBtn.disabled = count === 0;
}

function addSampleCookie() {
    if (!cookiesInput.value.includes(SAMPLE_COOKIE)) {
        if (cookiesInput.value.trim()) {
            cookiesInput.value += '\n' + SAMPLE_COOKIE;
        } else {
            cookiesInput.value = SAMPLE_COOKIE;
        }
        updateCookieCount();
        showToast('Sample cookie ditambahkan', 'info');
    } else {
        showToast('Sample cookie sudah ada', 'warning');
    }
}

// ============================================
// CONTROL FUNCTIONS
// ============================================
async function startChecking() {
    const cookies = parseCookies(cookiesInput.value);
    
    if (cookies.length === 0) {
        showToast('Masukkan cookies terlebih dahulu!', 'error');
        return;
    }
    
    if (cookies.length > 100) {
        if (!confirm(`Anda akan check ${cookies.length} cookies. Ini mungkin butuh waktu lama. Lanjutkan?`)) {
            return;
        }
    }
    
    if (!apiConnected) {
        showToast('API tidak terhubung. Tidak dapat memulai checking.', 'error');
        return;
    }
    
    try {
        showToast(`Memulai checking ${cookies.length} cookies...`, 'info');
        
        const response = await fetch(`${API_BASE_URL}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'start',
                cookies: cookies,
                webhook_url: currentWebhook
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            isChecking = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            progressSection.style.display = 'block';
            updateStatus('running');
            showToast(`Checking dimulai! ${data.total} cookies`, 'success');
        } else {
            showToast(data.error || 'Gagal memulai checking', 'error');
        }
    } catch (error) {
        console.error('Start checking error:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

async function stopChecking() {
    if (!isChecking) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isChecking = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            updateStatus('stopped');
            showToast('Checking dihentikan!', 'warning');
        }
    } catch (error) {
        showToast('Error menghentikan checking: ' + error.message, 'error');
    }
}

async function testSingleCookie() {
    const cookies = parseCookies(cookiesInput.value);
    
    if (cookies.length === 0) {
        showToast('Masukkan cookie terlebih dahulu!', 'error');
        return;
    }
    
    const cookie = cookies[0];
    
    try {
        showToast('Testing cookie...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'test',
                cookie: cookie
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        // Add to table
        addResultToTable(result);
        noResults.style.display = 'none';
        
        // Update stats
        updateStatsFromResult(result);
        
        showToast(`Test selesai: ${result.status}`, 
            result.status === 'valid' ? 'success' : 'error');
            
    } catch (error) {
        console.error('Test error:', error);
        showToast('Error testing: ' + error.message, 'error');
    }
}

async function clearResults() {
    if (!confirm('Yakin ingin menghapus semua hasil?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Clear UI
            resultsBody.innerHTML = '';
            noResults.style.display = 'flex';
            
            // Reset stats
            validCount.textContent = '0';
            invalidCount.textContent = '0';
            totalRobux.textContent = '0';
            premiumCount.textContent = '0';
            
            showToast('Semua hasil dibersihkan!', 'info');
        }
    } catch (error) {
        showToast('Error membersihkan hasil: ' + error.message, 'error');
    }
}

async function exportValidCookies() {
    const validCookies = Array.from(resultsBody.querySelectorAll('tr'))
        .filter(row => row.querySelector('.badge-valid'))
        .map(row => {
            const cells = row.querySelectorAll('td');
            return {
                username: cells[2].textContent,
                robux: cells[4].textContent
            };
        });
    
    if (validCookies.length === 0) {
        showToast('Tidak ada cookie valid untuk diexport', 'warning');
        return;
    }
    
    // Create text content
    let textContent = `# Valid Cookies Export - ${new Date().toLocaleString()}\n`;
    textContent += `# Total: ${validCookies.length} cookies\n\n`;
    
    validCookies.forEach(cookie => {
        textContent += `${cookie.username} | ${cookie.robux} Robux\n`;
    });
    
    // Create download
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valid_cookies_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`Diexport ${validCookies.length} cookie valid`, 'success');
}

// ============================================
// STATUS & PROGRESS UPDATES
// ============================================
async function updateStatus(forceStatus = null) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/check`);
        
        if (!response.ok) {
            throw new Error('API not responding');
        }
        
        const status = await response.json();
        
        // Update status indicator
        const currentStatus = forceStatus || status.status;
        statusDot.className = 'status-dot ' + currentStatus;
        statusText.textContent = currentStatus.toUpperCase();
        
        // Update button states
        isChecking = status.is_checking;
        startBtn.disabled = isChecking;
        stopBtn.disabled = !isChecking;
        
        // Update progress if running
        if (currentStatus === 'running' && status.stats) {
            progressSection.style.display = 'block';
            progressFill.style.width = `${status.stats.progress}%`;
            progressPercent.textContent = `${status.stats.progress}%`;
            progressText.textContent = 
                `Checking ${status.stats.current} dari ${status.stats.total} cookies`;
        } else if (currentStatus === 'completed' || currentStatus === 'stopped') {
            progressSection.style.display = 'none';
        }
        
        // Update stats
        if (status.stats) {
            validCount.textContent = status.stats.valid;
            invalidCount.textContent = status.stats.invalid;
            totalRobux.textContent = status.stats.robux.toLocaleString();
            premiumCount.textContent = status.stats.premium;
        }
        
        // Auto-refetch results if checking
        if (currentStatus === 'running') {
            fetchResults();
        }
        
    } catch (error) {
        console.error('Status update error:', error);
    }
}

// ============================================
// RESULTS MANAGEMENT
// ============================================
async function fetchResults() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/check?action=results`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const results = await response.json();
        
        if (results && results.length > 0) {
            // Sort by timestamp (newest first)
            results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Update table
            updateResultsTable(results);
            noResults.style.display = 'none';
            
            // Update stats from results
            updateStatsFromResults(results);
        } else if (resultsBody.children.length === 0) {
            noResults.style.display = 'flex';
        }
    } catch (error) {
        console.error('Fetch results error:', error);
    }
}

function updateResultsTable(results) {
    // Clear existing rows
    resultsBody.innerHTML = '';
    
    // Add new rows (limit to 50)
    results.slice(0, 50).forEach(result => {
        addResultToTable(result);
    });
}

function addResultToTable(result) {
    const row = document.createElement('tr');
    
    // Format waktu
    const time = new Date(result.timestamp || new Date());
    const timeStr = time.toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Status badge
    let statusBadge = '';
    switch(result.status) {
        case 'valid':
            statusBadge = '<span class="badge badge-valid">VALID</span>';
            row.style.borderLeft = '4px solid #2ecc71';
            break;
        case 'invalid':
            statusBadge = '<span class="badge badge-invalid">INVALID</span>';
            row.style.borderLeft = '4px solid #e74c3c';
            break;
        case 'rate_limited':
            statusBadge = '<span class="badge badge-rate_limited">RATE LIMITED</span>';
            row.style.borderLeft = '4px solid #9b59b6';
            break;
        default:
            statusBadge = '<span class="badge badge-error">ERROR</span>';
            row.style.borderLeft = '4px solid #f39c12';
    }
    
    row.innerHTML = `
        <td>${result.cookie_id + 1}</td>
        <td>${statusBadge}</td>
        <td><strong>${result.username}</strong></td>
        <td>${result.display_name || result.username}</td>
        <td class="robux-cell">${(result.robux || 0).toLocaleString()}</td>
        <td>${result.premium ? '<i class="fas fa-crown premium-icon"></i>' : '-'}</td>
        <td class="error-cell" title="${result.error || ''}">${result.error || '-'}</td>
        <td>${timeStr}</td>
    `;
    
    // Add animation for new rows
    row.style.opacity = '0';
    row.style.transform = 'translateY(-10px)';
    resultsBody.prepend(row);
    
    // Animate in
    setTimeout(() => {
        row.style.transition = 'all 0.3s ease';
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
    }, 10);
    
    // Limit rows to 50
    const rows = resultsBody.querySelectorAll('tr');
    if (rows.length > 50) {
        rows[rows.length - 1].remove();
    }
}

function updateStatsFromResult(result) {
    if (result.status === 'valid') {
        const currentValid = parseInt(validCount.textContent) || 0;
        validCount.textContent = currentValid + 1;
        
        const currentRobux = parseInt(totalRobux.textContent.replace(/,/g, '')) || 0;
        totalRobux.textContent = (currentRobux + (result.robux || 0)).toLocaleString();
        
        if (result.premium) {
            const currentPremium = parseInt(premiumCount.textContent) || 0;
            premiumCount.textContent = currentPremium + 1;
        }
    } else {
        const currentInvalid = parseInt(invalidCount.textContent) || 0;
        invalidCount.textContent = currentInvalid + 1;
    }
}

function updateStatsFromResults(results) {
    const valid = results.filter(r => r.status === 'valid').length;
    const invalid = results.filter(r => r.status !== 'valid').length;
    const robux = results.reduce((sum, r) => sum + (r.robux || 0), 0);
    const premium = results.filter(r => r.premium).length;
    
    validCount.textContent = valid;
    invalidCount.textContent = invalid;
    totalRobux.textContent = robux.toLocaleString();
    premiumCount.textContent = premium;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    currentTime.textContent = `${dateStr} • ${timeStr}`;
}

function showToast(message, type = 'info') {
    // Set content
    toastMessage.textContent = message;
    
    // Set type styling
    toast.className = 'toast ' + type;
    
    // Set icon based on type
    switch(type) {
        case 'success':
            toastIcon.className = 'fas fa-check-circle';
            break;
        case 'error':
            toastIcon.className = 'fas fa-exclamation-circle';
            break;
        case 'warning':
            toastIcon.className = 'fas fa-exclamation-triangle';
            break;
        default:
            toastIcon.className = 'fas fa-info-circle';
    }
    
    // Show toast
    toast.classList.add('show');
    
    // Auto-hide after 5 seconds
    setTimeout(hideToast, 5000);
}

function hideToast() {
    toast.classList.remove('show');
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    const isLoggedIn = localStorage.getItem('cookieCheckerLoggedIn') === 'true';
    
    if (isLoggedIn) {
        // Auto login
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        initDashboard();
    } else {
        // Show login
        loginSection.style.display = 'flex';
        dashboardSection.style.display = 'none';
        
        // Focus password field
        setTimeout(() => passwordInput.focus(), 100);
    }
    
    // Initial cookie count
    updateCookieCount();
    
    // Show welcome message
    setTimeout(() => {
        if (!isLoggedIn) {
            showToast('Selamat datang! Login dengan password "admin123"', 'info');
        }
    }, 1000);
});
