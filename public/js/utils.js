/**
 * Utility Functions
 * Helper functions for the chat app
 */

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Format timestamp to relative time (e.g., "2 minutes ago") */
function formatTime(ts) {
    const now = Date.now();
    const diff = now - ts;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

/** Check if device is mobile */
function isMobile() {
    return window.innerWidth < 768;
}

/** API call helper */
async function api(url, opts = {}) {
    const res = await fetch(url, { 
        credentials: 'include',
        ...opts, 
        headers: { 'Content-Type': 'application/json', ...opts.headers } 
    });
    if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json().catch(() => ({}));
}

/** Show/hide loading screen */
function showLoadingScreen(show = true) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = show ? 'flex' : 'none';
    }
}

/** Show auth message */
function showAuthMsg(msg) {
    const authMsg = document.getElementById('authMsg');
    if (authMsg) authMsg.textContent = msg;
}

/** Reset inactivity timeout */
function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        alert('Session expired due to inactivity');
        logout();
    }, 10 * 60 * 1000);
}

/** Logout user */
function logout() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    currentChatUser = null;
    localStorage.removeItem('chatWith');
    messageContainer.innerHTML = '';
    document.querySelector('.app').style.display = 'none';
    document.getElementById('loading-screen').style.display = 'none';
    loginContainer.style.display = '';
    nameInput.value = '';
    nameInput.disabled = false;
    if (typingIndicator) typingIndicator.textContent = '';
    clearTimeout(inactivityTimer);
    // Reset mobile panel state
    if (sidebar) {
        sidebar.classList.remove('hidden-mobile');
        chatArea.classList.remove('visible-mobile');
    }
}
