/*
  Client-side script for Realtime Chat App
  - Session persists across page reloads
  - Remembers last chat partner
  - Offline users can still be selected for history
  - XSS-safe message rendering
  - Inactivity auto-logout after 10 minutes
*/

let socket;

// DOM Elements
const clientCountElement = document.getElementById('client-total');
const messageContainer   = document.getElementById('message-container');
const nameInput          = document.getElementById('name-input');
const messageForm        = document.getElementById('message-form');
const messageInput       = document.getElementById('message-input');
const userListElement    = document.getElementById('userList');
const chatWithElement    = document.getElementById('chatWith');
const imageBtn           = document.getElementById('image-btn');
const imageInput         = document.getElementById('image-input');
const voiceBtn           = document.getElementById('voice-btn');
const loginContainer     = document.getElementById('login-container');
const usernameInput      = document.getElementById('username');
const passwordInput      = document.getElementById('password');
const loginBtn           = document.getElementById('login-btn');
const registerBtn        = document.getElementById('register-btn');
const logoutBtn          = document.getElementById('logout-btn');
const typingIndicator    = document.getElementById('typing-indicator');
const backBtn            = document.getElementById('back-btn');
const sidebar            = document.querySelector('.sidebar');
const chatArea           = document.querySelector('.chat-area');

const isMobile = () => window.innerWidth <= 600;

// Mobile: show chat panel, hide sidebar
function showChatPanel() {
    if (!isMobile()) return;
    sidebar.classList.add('hidden-mobile');
    chatArea.classList.add('visible-mobile');
}

// Mobile: show sidebar, hide chat panel
function showSidebarPanel() {
    if (!isMobile()) return;
    chatArea.classList.remove('visible-mobile');
    sidebar.classList.remove('hidden-mobile');
}

// Back button → go back to user list on mobile
if (backBtn) {
    backBtn.addEventListener('click', () => {
        currentChatUser = null;
        localStorage.removeItem('chatWith');
        showSidebarPanel();
        if (typingIndicator) typingIndicator.textContent = '';
    });
}

let currentChatUser = null;
let inactivityTimer = null;
let mediaRecorder   = null;
let recordedChunks  = [];
let isRecording     = false;

// ── Utilities ────────────────────────────────────────────────────────────────

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Wrapper for API calls; handles 401 automatically */
async function api(endpoint, opts = {}) {
    const res = await fetch(`/api${endpoint}`, { credentials: 'include', ...opts });
    if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function showPlaceholder() {
    messageContainer.innerHTML =
        '<li class="message-feedback"><p class="feedback">Select a user to start chatting</p></li>';
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function logout() {
    if (socket) { socket.disconnect(); socket = null; }
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
    sidebar.classList.remove('hidden-mobile');
    chatArea.classList.remove('visible-mobile');
}

loginBtn.addEventListener('click', async () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value;
    if (!user || !pass) return showAuthMsg('Please enter username and password');
    try {
        const data = await api('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        onLoginSuccess(data.username);
    } catch (e) {
        showAuthMsg(e.message || 'Login failed');
    }
});

registerBtn.addEventListener('click', async () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value;
    if (!user || !pass) return showAuthMsg('Please enter username and password');
    try {
        await api('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        showAuthMsg('Registered! Please login now.', 'success');
    } catch (e) {
        showAuthMsg(e.message || 'Registration failed');
    }
});

function showAuthMsg(msg, type = 'error') {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === 'success' ? '#16a34a' : '#dc2626';
}

function onLoginSuccess(username) {
    nameInput.value = username;
    nameInput.disabled = true;
    loginContainer.style.display = 'none';
    document.querySelector('.app').style.display = 'flex';
    usernameInput.value = '';
    passwordInput.value = '';
    showAuthMsg('');
    initSocket();
    showPlaceholder();
}

// Check existing session on page load
(async function checkSession() {
    const loadingScreen = document.getElementById('loading-screen');
    try {
        const data = await api('/me');
        // Session valid — go straight to app, never show login
        if (loadingScreen) loadingScreen.style.display = 'none';
        onLoginSuccess(data.username);
    } catch {
        // No valid session — show login form
        if (loadingScreen) loadingScreen.style.display = 'none';
        loginContainer.style.display = '';
    }
})();

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try { await api('/logout', { method: 'POST' }); } catch {}
        logout();
    });
}

// ── Socket ───────────────────────────────────────────────────────────────────

function initSocket() {
    socket = io({ withCredentials: true });
    setupInactivityLogout();

    socket.on('connect_error', err => {
        console.error('Socket error:', err.message);
        if (err.message === 'authentication error') {
            alert('Session expired. Please log in again.');
            logout();
        }
    });

    socket.on('client-count', count => {
        if (clientCountElement) clientCountElement.innerText = `Online: ${count}`;
    });

    socket.on('user-list', list => {
        const me = nameInput.value;
        userListElement.innerHTML = '';

        list.filter(u => u.username !== me).forEach(obj => {
            const li = document.createElement('li');
            const dot = obj.online ? '🟢' : '⚫';
            li.textContent = `${dot} ${obj.username}`;
            li.dataset.username = obj.username;
            if (currentChatUser === obj.username) li.classList.add('active');
            li.style.cursor = 'pointer';
            if (!obj.online) li.style.opacity = '0.6';
            li.addEventListener('click', () => selectUser(obj.username));
            userListElement.appendChild(li);
        });

        // Auto-reselect last chat partner
        const stored = localStorage.getItem('chatWith');
        if (stored && stored !== me && list.some(u => u.username === stored)) {
            if (currentChatUser !== stored) selectUser(stored);
            else showChatPanel(); // already selected, just ensure panel is correct on mobile
        }
    });

    socket.on('history', msgs => {
        messageContainer.innerHTML = '';
        if (msgs.length === 0) {
            messageContainer.innerHTML = '<li class="message-feedback"><p class="feedback">No messages yet. Say hi! 👋</p></li>';
            return;
        }
        msgs.forEach(msg => {
            const isOwn = msg.from === nameInput.value;
            if (msg.type === 'image') addImageToUI(isOwn, msg);
            else if (msg.type === 'voice') addVoiceToUI(isOwn, msg);
            else addMessageToUI(isOwn, msg);
        });
    });

    socket.on('message', data => {
        if (data.from === currentChatUser || data.to === currentChatUser) {
            // avoid duplicate if sender (already added optimistically)
            if (data.from === nameInput.value) return;
            addMessageToUI(false, data);
        }
    });

    socket.on('image', data => {
        if (data.from === currentChatUser || data.to === currentChatUser) {
            if (data.from === nameInput.value) return;
            addImageToUI(false, data);
        }
    });

    socket.on('voice', data => {
        if (data.from === currentChatUser || data.to === currentChatUser) {
            if (data.from === nameInput.value) return;
            addVoiceToUI(false, data);
        }
    });

    socket.on('typing', info => {
        if (!typingIndicator) return;
        if (info.from === currentChatUser) {
            typingIndicator.textContent = info.active ? `${escapeHtml(info.from)} is typing...` : '';
        }
    });

    socket.on('error', data => {
        if (data && data.message) alert('Error: ' + data.message);
    });

    // Message form
    messageForm.addEventListener('submit', e => {
        e.preventDefault();
        sendMessage();
    });

    messageInput.addEventListener('input', () => {
        if (socket && currentChatUser) {
            socket.emit('typing', { to: currentChatUser, active: messageInput.value.length > 0 });
        }
    });

    // Image upload
    if (imageBtn) imageBtn.addEventListener('click', () => imageInput && imageInput.click());

    imageInput && imageInput.addEventListener('change', e => {
        if (!e.target.files.length) return;
        if (!currentChatUser) return alert('Select a user first');
        const file = e.target.files[0];
        if (file.size > 5 * 1024 * 1024) return alert('Image must be under 5MB');
        const reader = new FileReader();
        reader.onload = evt => {
            const base64 = evt.target.result;
            const msg = { from: nameInput.value, to: currentChatUser, type: 'image', content: base64, time: Date.now() };
            socket.emit('image', { to: currentChatUser, base64 });
            addImageToUI(true, msg);
            imageInput.value = '';
            resetInactivity();
        };
        reader.readAsDataURL(file);
    });

    // Voice recording
    voiceBtn && voiceBtn.addEventListener('click', async e => {
        e.preventDefault();
        if (!isRecording) {
            if (!currentChatUser) return alert('Select a user first');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                recordedChunks = [];
                mediaRecorder.ondataavailable = evt => { if (evt.data.size > 0) recordedChunks.push(evt.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = evt => {
                        const base64 = evt.target.result;
                        const msg = { from: nameInput.value, to: currentChatUser, type: 'voice', content: base64, time: Date.now() };
                        socket.emit('voice', { to: currentChatUser, base64 });
                        addVoiceToUI(true, msg);
                        resetInactivity();
                    };
                    reader.readAsDataURL(blob);
                    stream.getTracks().forEach(t => t.stop());
                };
                mediaRecorder.start();
                isRecording = true;
                voiceBtn.textContent = '⏹ Stop';
                voiceBtn.classList.add('recording');
            } catch (err) {
                alert('Microphone access denied: ' + err.message);
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.innerHTML = '🎤';
            voiceBtn.classList.remove('recording');
        }
    });
}

// ── Chat helpers ──────────────────────────────────────────────────────────────

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatUser) return;
    const msg = { from: nameInput.value, to: currentChatUser, type: 'text', content: text, time: Date.now() };
    socket.emit('message', { to: currentChatUser, text });
    addMessageToUI(true, msg);
    messageInput.value = '';
    if (typingIndicator) typingIndicator.textContent = '';
    socket.emit('typing', { to: currentChatUser, active: false });
    resetInactivity();
}

function formatTime(ts) {
    return moment(Number(ts)).fromNow();
}

function addMessageToUI(isOwn, data) {
    // Remove placeholder
    document.querySelectorAll('.message-feedback').forEach(el => el.closest('li')?.remove());

    const li = document.createElement('li');
    li.className = isOwn ? 'message-right' : 'message-left';

    const p = document.createElement('p');
    p.className = 'message';
    p.textContent = data.content;   // safe — textContent, not innerHTML

    const span = document.createElement('span');
    span.textContent = `${isOwn ? 'You' : escapeHtml(data.from)} • ${formatTime(data.time)}`;
    p.appendChild(span);
    li.appendChild(p);

    messageContainer.appendChild(li);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

function addImageToUI(isOwn, data) {
    document.querySelectorAll('.message-feedback').forEach(el => el.closest('li')?.remove());

    const li = document.createElement('li');
    li.className = isOwn ? 'message-right' : 'message-left';

    const p = document.createElement('p');
    p.className = 'message';

    const img = document.createElement('img');
    img.src = data.content;
    img.alt = 'image';
    img.loading = 'lazy';

    const span = document.createElement('span');
    span.textContent = `${isOwn ? 'You' : escapeHtml(data.from)} • ${formatTime(data.time)}`;

    p.appendChild(img);
    p.appendChild(span);
    li.appendChild(p);

    messageContainer.appendChild(li);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

function addVoiceToUI(isOwn, data) {
    document.querySelectorAll('.message-feedback').forEach(el => el.closest('li')?.remove());

    const li = document.createElement('li');
    li.className = isOwn ? 'message-right' : 'message-left';

    const p = document.createElement('p');
    p.className = 'message';

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = data.content;

    const span = document.createElement('span');
    span.textContent = `${isOwn ? 'You' : escapeHtml(data.from)} • ${formatTime(data.time)}`;

    p.appendChild(audio);
    p.appendChild(span);
    li.appendChild(p);

    messageContainer.appendChild(li);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

function selectUser(username) {
    currentChatUser = username;
    if (chatWithElement) chatWithElement.textContent = username;
    localStorage.setItem('chatWith', username);

    // Highlight active user
    Array.from(userListElement.children).forEach(li => {
        li.classList.toggle('active', li.dataset.username === username);
    });

    messageContainer.innerHTML = '';
    if (typingIndicator) typingIndicator.textContent = '';
    socket.emit('get-history', username);
    resetInactivity();

    // On mobile: slide to chat view
    showChatPanel();
}

// ── Inactivity logout ────────────────────────────────────────────────────────

function setupInactivityLogout() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
        document.addEventListener(evt, resetInactivity, { passive: true })
    );
    resetInactivity();
}

function resetInactivity() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
        try { await api('/logout', { method: 'POST' }); } catch {}
        alert('You have been logged out due to inactivity.');
        logout();
    }, 10 * 60 * 1000); // 10 minutes
}