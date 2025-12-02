// Konfigurasi
const API_BASE_URL = window.location.hostname.includes('vercel.app') 
    ? 'https://' + window.location.hostname 
    : '/api';

let currentWebhook = '';
let isChecking = false;
let refreshInterval = null;

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const cookiesInput = document.getElementById('cookiesInput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const testBtn = document.getElementById('testBtn');
const clearBtn = document.getElementById('clearBtn');
const refreshResults = document.getElementById('refreshResults');
const resultsBody = document.getElementById('resultsBody');
const noResults = document.getElementById('noResults');
const progressSection = document.querySelector('.progress-section');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressText = document.getElementById('progressText');
const statusBadge = document.getElementById('statusBadge');
const cookieCount = document.getElementById('cookieCount');

// Stats elements
const validCount = document.getElementById('validCount');
const invalidCount = document.getElementById('invalidCount');
const totalRobux = document.getElementById('totalRobux');
const premiumCount = document.getElementById('premiumCount');

// Password (bisa diganti)
const DASHBOARD_PASSWORD = "admin123"; // Ganti dengan password Anda

// Event Listeners
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
cookiesInput.addEventListener('input', updateCookieCount);
startBtn.addEventListener('click', startChecking);
stopBtn.addEventListener('click', stopChecking);
testBtn.addEventListener('click', testSingleCookie);
clearBtn.addEventListener('click', clearResults);
refreshResults.addEventListener('click', fetchResults);

// Login Handler
function handleLogin() {
    const password = document.getElementById('password').value;
    const webhook = document.getElementById('webhook').value;
    
    if (password !== DASHBOARD_PASSWORD) {
        showToast('Password salah!', 'error');
        return;
    }
    
    currentWebhook = webhook;
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    showToast('Login berhasil!', 'success');
    
    // Mulai auto-refresh status
    startStatusUpdates();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
}

// Logout Handler
function handleLogout() {
    if (isChecking) {
        if (!confirm('Checking masih berjalan. Yakin ingin logout?')) {
            return;
        }
        stopChecking();
    }
    
    loginSection.style.display = 'flex';
    dashboardSection.style.display = 'none';
    document.getElementById('password').value = '';
    showToast('Logout berhasil!', 'success');
    
    // Stop auto-refresh
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// Update cookie count
function updateCookieCount() {
    const cookies = parseCookies(cookiesInput.value);
    const count = cookies.length;
    cookieCount.textContent = `${count} cookies ditemukan`;
    cookieCount.style.color = count > 0 ? '#2ecc71' : '#e74c3c';
}

// Parse cookies dari textarea
function parseCookies(text) {
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes('_|WARNING'));
}

// Start checking
async function startChecking() {
    const cookies = parseCookies(cookiesInput.value);
    
    if (cookies.length === 0) {
        showToast('Masukkan cookies terlebih dahulu!', 'error');
        return;
    }
    
    if (cookies.length > 100) {
        if (!confirm(`Anda akan check ${cookies.length} cookies. Lanjutkan?`)) {
            return;
        }
    }
    
    try {
        showToast('Memulai checking...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/check.py`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'start',
                cookies: cookies,
                webhook_url: currentWebhook
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isChecking = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            progressSection.style.display = 'block';
            updateStatus('Running');
            showToast(`Checking dimulai! ${data.total_cookies} cookies`, 'success');
        } else {
            showToast(data.message || 'Gagal memulai checking', 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// Stop checking
async function stopChecking() {
    try {
        const response = await fetch(`${API_BASE_URL}/check.py`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'stop'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isChecking = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            updateStatus('Stopped');
            showToast('Checking dihentikan!', 'warning');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// Test single cookie
async function testSingleCookie() {
    const cookies = parseCookies(cookiesInput.value);
    
    if (cookies.length === 0) {
        showToast('Masukkan cookie terlebih dahulu!', 'error');
        return;
    }
    
    const cookie = cookies[0];
    
    try {
        showToast('Testing cookie...', 'info');
        
        const response = await fetch(`${API_BASE_URL}/check.py`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'test',
                cookie: cookie,
                webhook_url: currentWebhook
            })
        });
        
        const result = await response.json();
        
        // Tampilkan hasil di table
        addResultToTable(result);
        noResults.style.display = 'none';
        
        // Update stats
        updateStatsFromResult(result);
        
        showToast(`Test selesai: ${result.status}`, 
            result.status === 'valid' ? 'success' : 'error');
            
    } catch (error) {
        showToast('Error testing: ' + error.message, 'error');
    }
}

// Clear results
function clearResults() {
    if (!confirm('Yakin ingin menghapus semua hasil?')) {
        return;
    }
    
    resultsBody.innerHTML = '';
    noResults.style.display = 'flex';
    showToast('Hasil dibersihkan!', 'info');
    
    // Reset stats
    validCount.textContent = '0';
    invalidCount.textContent = '0';
    totalRobux.textContent = '0';
    premiumCount.textContent = '0';
}

// Fetch results dari API
async function fetchResults() {
    try {
        const response = await fetch(`${API_BASE_URL}/check.py?action=results`);
        const results = await response.json();
        
        if (results && results.length > 0) {
            resultsBody.innerHTML = '';
            results.forEach(result => addResultToTable(result));
            noResults.style.display = 'none';
            
            // Update stats
            updateStatsFromResults(results);
        }
    } catch (error) {
        console.error('Error fetching results:', error);
    }
}

// Add result ke table
function addResultToTable(result) {
    const row = document.createElement('tr');
    
    // Format waktu
    const time = new Date(result.timestamp || new Date());
    const timeStr = time.toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Status badge
    let statusBadge = '';
    let statusClass = '';
    
    if (result.status === 'valid') {
        statusBadge = '<span class="badge badge-success">VALID</span>';
        statusClass = 'status-valid';
    } else if (result.status === 'invalid') {
        statusBadge = '<span class="badge badge-danger">INVALID</span>';
        statusClass = 'status-invalid';
    } else {
        statusBadge = '<span class="badge badge-warning">ERROR</span>';
        statusClass = 'status-error';
    }
    
    row.innerHTML = `
        <td>${result.cookie_id + 1}</td>
        <td>${statusBadge}</td>
        <td><strong>${result.username}</strong></td>
        <td>${result.display_name}</td>
        <td class="robux-cell">${result.robux.toLocaleString()}</td>
        <td>${result.premium ? '<i class="fas fa-crown premium-icon"></i>' : '-'}</td>
        <td class="error-cell">${result.error || '-'}</td>
        <td>${timeStr}</td>
    `;
    
    row.className = statusClass;
    resultsBody.prepend(row); // Tambah di atas
    
    // Batasi jumlah rows
    const rows = resultsBody.querySelectorAll('tr');
    if (rows.length > 50) {
        rows[rows.length - 1].remove();
    }
}

// Update stats dari hasil
function updateStatsFromResult(result) {
    if (result.status === 'valid') {
        const current = parseInt(validCount.textContent) || 0;
        validCount.textContent = current + 1;
        
        const robux = parseInt(totalRobux.textContent.replace(/,/g, '')) || 0;
        totalRobux.textContent = (robux + (result.robux || 0)).toLocaleString();
        
        if (result.premium) {
            const premium = parseInt(premiumCount.textContent) || 0;
            premiumCount.textContent = premium + 1;
        }
    } else {
        const current = parseInt(invalidCount.textContent) || 0;
        invalidCount.textContent = current + 1;
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

// Update status dan progress
async function updateStatus(forceStatus = null) {
    try {
        const response = await fetch(`${API_BASE_URL}/check.py?action=status`);
        const status = await response.json();
        
        if (forceStatus) {
            status.current_status = forceStatus;
        }
        
        // Update status badge
        let badgeClass = 'status-idle';
        let badgeIcon = 'fa-pause-circle';
        
        if (status.current_status === 'Running') {
            badgeClass = 'status-running';
            badgeIcon = 'fa-play-circle';
            isChecking = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else if (status.current_status === 'Completed') {
            badgeClass = 'status-completed';
            badgeIcon = 'fa-check-circle';
            isChecking = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        } else if (status.current_status === 'Stopped') {
            badgeClass = 'status-stopped';
            badgeIcon = 'fa-stop-circle';
            isChecking = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
        
        statusBadge.className = `status-badge ${badgeClass}`;
        statusBadge.innerHTML = `<i class="fas ${badgeIcon}"></i><span>${status.current_status}</span>`;
        
        // Update progress
        if (status.current_status === 'Running' && status.progress > 0) {
            progressSection.style.display = 'block';
            progressFill.style.width = `${status.progress}%`;
            progressPercent.textContent = `${status.progress}%`;
            progressText.textContent = `Checking cookie ${status.current_cookie} dari ${status.total_cookies}`;
        }
        
        // Update stats
        validCount.textContent = status.valid || 0;
        invalidCount.textContent = status.invalid || 0;
        totalRobux.textContent = (status.robux || 0).toLocaleString();
        premiumCount.textContent = status.premium || 0;
        
        // Auto-fetch results jika sedang running
        if (status.current_status === 'Running') {
            fetchResults();
        }
        
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

// Start auto status updates
function startStatusUpdates() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(updateStatus, 2000); // Update setiap 2 detik
    updateStatus(); // Update segera
}

// Update current time
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
    
    document.getElementById('currentTime').textContent = 
        `${dateStr} • ${timeStr}`;
}

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('i');
    
    toastMessage.textContent = message;
    
    // Set icon dan warna berdasarkan type
    switch(type) {
        case 'success':
            toastIcon.className = 'fas fa-check-circle';
            toast.style.backgroundColor = '#2ecc71';
            break;
        case 'error':
            toastIcon.className = 'fas fa-exclamation-circle';
            toast.style.backgroundColor = '#e74c3c';
            break;
        case 'warning':
            toastIcon.className = 'fas fa-exclamation-triangle';
            toast.style.backgroundColor = '#f39c12';
            break;
        default:
            toastIcon.className = 'fas fa-info-circle';
            toast.style.backgroundColor = '#3498db';
    }
    
    // Show toast
    toast.classList.add('show');
    
    // Auto hide setelah 3 detik
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Update cookie count
    updateCookieCount();
    
    // Enter untuk login
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
    
    // Check jika sudah login (dari localStorage)
    const savedLogin = localStorage.getItem('cookieCheckerLoggedIn');
    if (savedLogin === 'true') {
        // Auto login (bisa dihapus jika mau lebih aman)
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        startStatusUpdates();
        updateCurrentTime();
        setInterval(updateCurrentTime, 1000);
    }
});