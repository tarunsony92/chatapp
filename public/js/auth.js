/**
 * Authentication Module
 * Handles login, register, and session management
 */

const loginContainer = document.getElementById('login-container');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const nameInput = document.getElementById('name-input');

/** Handle successful login */
function onLoginSuccess(username) {
    nameInput.value = username;
    nameInput.disabled = true;
    loginContainer.style.display = 'none';
    document.querySelector('.app').style.display = 'flex';
    usernameInput.value = '';
    passwordInput.value = '';
    document.getElementById('authMsg').textContent = '';
    initSocket();
    showPlaceholder();
    setupInactivityLogout();
}

/** Check if user has valid session */
(async function checkSession() {
    showLoadingScreen(true);
    try {
        const data = await api('/api/me');
        // Session valid — go straight to app, never show login
        showLoadingScreen(false);
        onLoginSuccess(data.username);
    } catch {
        // No valid session — show login form
        showLoadingScreen(false);
        loginContainer.style.display = '';
    }
})();

/** Logout button handler */
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try { await api('/logout', { method: 'POST' }); } catch {}
        logout();
    });
}

/** Login button handler */
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        if (!username || !password) {
            showAuthMsg('Username and password required');
            return;
        }
        try {
            showAuthMsg('Logging in...');
            const data = await api('/api/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            onLoginSuccess(data.username);
        } catch (err) {
            showAuthMsg('Login failed: ' + err.message);
        }
    });
}

/** Register button handler */
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        if (!username || !password) {
            showAuthMsg('Username and password required');
            return;
        }
        try {
            showAuthMsg('Registering...');
            const data = await api('/api/register', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            showAuthMsg('Registered! Logging in...');
            onLoginSuccess(data.username);
        } catch (err) {
            showAuthMsg('Registration failed: ' + err.message);
        }
    });
}
