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
const replyQuote         = document.getElementById('reply-quote');
const replyQuoteContent  = document.querySelector('.reply-quote-content');
const replyCloseBtn      = document.getElementById('reply-close-btn');
const msgDetailsModal     = document.getElementById('msg-details-modal');
const modalCloseBtn      = document.getElementById('modal-close-btn');
const detailReplyBtn     = document.getElementById('detail-reply-btn');
const detailCloseBtn     = document.getElementById('detail-close-btn');
const searchInput        = document.getElementById('search-input');
const searchResults      = document.getElementById('search-results');

// State for reply
let replyToMsg = null;
let allAvailableUsers = []; // All users from server
let messageMap = {}; // Map to store messages by time for quick lookup and scrolling

// Detect mobile device
function isMobile() {
    return window.innerWidth < 768;
}

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

function updateUnseenBadge(username) {
    const count = window.unseenCounts[username] || 0;
    const userLi = Array.from(userListElement.children).find(li => li.dataset.username === username);
    if (!userLi) return;
    
    let badge = userLi.querySelector('.unseen-badge');
    if (count > 0) {
        if (badge) {
            badge.textContent = count;
        } else {
            badge = document.createElement('span');
            badge.className = 'unseen-badge';
            badge.textContent = count;
            userLi.appendChild(badge);
        }
    } else {
        if (badge) badge.remove();
    }
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
        window.currentUserList = list;
        window.unseenCounts = window.unseenCounts || {};
        allAvailableUsers = list.filter(u => u.username !== me);
        
        // Render only users with whom we have exchanged messages
        updateChatUserList();

        // Fetch unseen counts for all users
        allAvailableUsers.forEach(obj => {
            socket.emit('get-unseen', obj.username);
        });

        // Auto-reselect last chat partner
        const stored = localStorage.getItem('chatWith');
        if (stored && stored !== me && list.some(u => u.username === stored)) {
            if (currentChatUser !== stored) selectUser(stored);
            else showChatPanel();
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
        // Save incoming message to localStorage for chat list tracking
        const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        chatHistory.push(data);
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        updateChatUserList();
        
        if (data.from === currentChatUser || data.to === currentChatUser) {
            if (data.from === nameInput.value) return;
            addMessageToUI(false, data);
        } else {
            window.unseenCounts = window.unseenCounts || {};
            window.unseenCounts[data.from] = (window.unseenCounts[data.from] || 0) + 1;
            updateUnseenBadge(data.from);
        }
    });

    socket.on('image', data => {
        // Save incoming image to localStorage for chat list tracking
        const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        chatHistory.push(data);
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        updateChatUserList();
        
        if (data.from === currentChatUser || data.to === currentChatUser) {
            if (data.from === nameInput.value) return;
            addImageToUI(false, data);
        } else {
            window.unseenCounts = window.unseenCounts || {};
            window.unseenCounts[data.from] = (window.unseenCounts[data.from] || 0) + 1;
            updateUnseenBadge(data.from);
        }
    });

    socket.on('voice', data => {
        // Save incoming voice to localStorage for chat list tracking
        const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        chatHistory.push(data);
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        updateChatUserList();
        
        if (data.from === currentChatUser || data.to === currentChatUser) {
            if (data.from === nameInput.value) return;
            addVoiceToUI(false, data);
        } else {
            window.unseenCounts = window.unseenCounts || {};
            window.unseenCounts[data.from] = (window.unseenCounts[data.from] || 0) + 1;
            updateUnseenBadge(data.from);
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

    // Receive notification that messages were read by recipient
    socket.on('msgs-read', data => {
        if (data && data.from === currentChatUser) {
            // Mark all messages to this user as read
            document.querySelectorAll('.message-right').forEach(li => {
                const span = li.querySelector('span');
                if (span && span.textContent.includes('sent')) {
                    span.textContent = span.textContent.replace('✓ sent', `✓✓ ${formatTime(data.readAt)}`);
                }
            });
        }
    });

    // Receive unseen count for a user
    socket.on('unseen-count', data => {
        if (data && typeof data.user === 'string') {
            window.unseenCounts = window.unseenCounts || {};
            window.unseenCounts[data.user] = data.count || 0;
            updateUnseenBadge(data.user);
        }
    });

    // Modal and Reply handlers
    modalCloseBtn.addEventListener('click', () => {
        msgDetailsModal.style.display = 'none';
        replyToMsg = null;
    });
    
    detailCloseBtn.addEventListener('click', () => {
        msgDetailsModal.style.display = 'none';
        replyToMsg = null;
    });
    
    detailReplyBtn.addEventListener('click', () => {
        msgDetailsModal.style.display = 'none';
        setupReplyUI(replyToMsg);
    });
    
    replyCloseBtn.addEventListener('click', () => {
        setupReplyUI(null);
    });
    
    // Close modal when clicking outside
    msgDetailsModal.addEventListener('click', (e) => {
        if (e.target === msgDetailsModal) {
            msgDetailsModal.style.display = 'none';
            replyToMsg = null;
        }
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
            
            // Save to localStorage for chat list tracking
            const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
            chatHistory.push(msg);
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            updateChatUserList();
            
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
                        
                        // Save to localStorage for chat list tracking
                        const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
                        chatHistory.push(msg);
                        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                        updateChatUserList();
                        
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
    const emitData = { to: currentChatUser, text };
    
    // Include reply context if replying to a message
    if (replyToMsg) {
        msg.replyTo = { from: replyToMsg.from, type: replyToMsg.type, time: replyToMsg.time, preview: replyToMsg.type === 'text' ? replyToMsg.content.substring(0, 30) : `[${replyToMsg.type.toUpperCase()}]` };
        emitData.replyTo = msg.replyTo;
    }
    
    // Save to localStorage for chat list tracking
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    chatHistory.push(msg);
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    updateChatUserList();
    
    socket.emit('message', emitData);
    addMessageToUI(true, msg);
    messageInput.value = '';
    if (typingIndicator) typingIndicator.textContent = '';
    socket.emit('typing', { to: currentChatUser, active: false });
    setupReplyUI(null);
    resetInactivity();
}

function formatTime(ts) {
    return moment(Number(ts)).fromNow();
}

function setupMessageSwipe(element, messageData) {
    if (!element) return;
    
    let startX = 0;
    const threshold = 50;
    
    element.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
    }, { passive: true });
    
    element.addEventListener('touchend', e => {
        const endX = e.changedTouches[0].clientX;
        const diff = endX - startX;
        
        // Swipe right on left-side messages (received) -> reply
        if (diff > threshold && !element.classList.contains('message-right')) {
            showMessageDetails(messageData);
        }
        // Swipe left on right-side messages (sent) -> reply
        else if (diff < -threshold && element.classList.contains('message-right')) {
            showMessageDetails(messageData);
        }
    }, { passive: true });
    
    // Also add click handler for desktop
    element.addEventListener('click', () => {
        showMessageDetails(messageData);
    });
}

function showMessageDetails(msgData) {
    if (!msgData) return;
    
    replyToMsg = msgData;
    
    // Populate modal with minimal details: sent time, status, read time
    document.getElementById('detail-time').textContent = formatTime(msgData.time) + ` (${new Date(msgData.time).toLocaleString()})`;
    
    if (msgData.read) {
        document.getElementById('detail-read-row').style.display = 'flex';
        document.getElementById('detail-read-time').textContent = formatTime(msgData.readAt) + ` (${new Date(msgData.readAt).toLocaleString()})`;
        document.getElementById('detail-status').textContent = '✓✓ Seen';
    } else {
        document.getElementById('detail-read-row').style.display = 'none';
        document.getElementById('detail-status').textContent = '✓ Sent';
    }
    
    msgDetailsModal.style.display = 'flex';
}

// Scroll to and highlight original message when clicking reply context
function scrollToMessage(fromUser, messageTime) {
    // Find message element by iterating through messageMap
    let targetElement = null;
    for (let key in messageMap) {
        const msg = messageMap[key];
        if (msg && msg.from === fromUser && msg.time === messageTime) {
            targetElement = msg.element;
            break;
        }
    }
    
    if (!targetElement) {
        console.log('Message not found in current chat');
        return;
    }
    
    // Scroll to message
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight message
    targetElement.classList.add('highlighted');
    setTimeout(() => {
        targetElement.classList.remove('highlighted');
    }, 2000);
}

function setupReplyUI(msg) {
    if (!msg) {
        replyToMsg = null;
        replyQuote.style.display = 'none';
        return;
    }
    
    replyToMsg = msg;
    const preview = msg.type === 'text' ? msg.content : `[${msg.type.toUpperCase()}]`;
    replyQuoteContent.textContent = `Reply to ${escapeHtml(msg.from)}: ${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}`;
    replyQuote.style.display = 'flex';
}

function addMessageToUI(isOwn, data) {
    // Remove placeholder
    document.querySelectorAll('.message-feedback').forEach(el => el.closest('li')?.remove());

    const li = document.createElement('li');
    li.className = isOwn ? 'message-right' : 'message-left';

    // Add reply context if message contains replyTo
    if (data.replyTo) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply-context';
        replyDiv.style.cursor = 'pointer';
        replyDiv.innerHTML = `<small><strong>${escapeHtml(data.replyTo.from)}:</strong> ${escapeHtml(data.replyTo.preview)}</small>`;
        replyDiv.addEventListener('click', () => {
            scrollToMessage(data.replyTo.from, data.replyTo.time || 0);
        });
        li.appendChild(replyDiv);
    }

    const p = document.createElement('p');
    p.className = 'message has-actions';
    p.textContent = data.content;

    const span = document.createElement('span');
    let status = isOwn ? (data.read ? '✓✓' : '✓ sent') : '';
    span.textContent = `${isOwn ? 'You' : escapeHtml(data.from)} • ${formatTime(data.time)} ${status}`.trim();
    span.classList.add('msg-time');
    p.appendChild(span);
    li.appendChild(p);

    messageContainer.appendChild(li);
    messageContainer.scrollTop = messageContainer.scrollHeight;
    
    // Store message in map for quick lookup
    const msgKey = `${data.from}-${data.time}`;
    messageMap[msgKey] = { ...data, element: li };
    
    setupMessageSwipe(p, data);
}

function addImageToUI(isOwn, data) {
    document.querySelectorAll('.message-feedback').forEach(el => el.closest('li')?.remove());

    const li = document.createElement('li');
    li.className = isOwn ? 'message-right' : 'message-left';

    // Add reply context if message contains replyTo
    if (data.replyTo) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply-context';
        replyDiv.style.cursor = 'pointer';
        replyDiv.innerHTML = `<small><strong>${escapeHtml(data.replyTo.from)}:</strong> ${escapeHtml(data.replyTo.preview)}</small>`;
        replyDiv.addEventListener('click', () => {
            scrollToMessage(data.replyTo.from, data.replyTo.time || 0);
        });
        li.appendChild(replyDiv);
    }

    const p = document.createElement('p');
    p.className = 'message has-actions';

    const img = document.createElement('img');
    img.src = data.content;
    img.alt = 'image';
    img.loading = 'lazy';

    const span = document.createElement('span');
    let status = isOwn ? (data.read ? '✓✓' : '✓ sent') : '';
    span.textContent = `${isOwn ? 'You' : escapeHtml(data.from)} • ${formatTime(data.time)} ${status}`.trim();
    span.classList.add('msg-time');

    p.appendChild(img);
    p.appendChild(span);
    li.appendChild(p);

    messageContainer.appendChild(li);
    messageContainer.scrollTop = messageContainer.scrollHeight;
    
    // Store message in map for quick lookup
    const msgKey = `${data.from}-${data.time}`;
    messageMap[msgKey] = { ...data, element: li };
    
    setupMessageSwipe(p, data);
}

function addVoiceToUI(isOwn, data) {
    document.querySelectorAll('.message-feedback').forEach(el => el.closest('li')?.remove());

    const li = document.createElement('li');
    li.className = isOwn ? 'message-right' : 'message-left';

    // Add reply context if message contains replyTo
    if (data.replyTo) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply-context';
        replyDiv.style.cursor = 'pointer';
        replyDiv.innerHTML = `<small><strong>${escapeHtml(data.replyTo.from)}:</strong> ${escapeHtml(data.replyTo.preview)}</small>`;
        replyDiv.addEventListener('click', () => {
            scrollToMessage(data.replyTo.from, data.replyTo.time || 0);
        });
        li.appendChild(replyDiv);
    }

    const p = document.createElement('p');
    p.className = 'message has-actions';

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = data.content;

    const span = document.createElement('span');
    let status = isOwn ? (data.read ? '✓✓' : '✓ sent') : '';
    span.textContent = `${isOwn ? 'You' : escapeHtml(data.from)} • ${formatTime(data.time)} ${status}`.trim();
    span.classList.add('msg-time');

    p.appendChild(audio);
    p.appendChild(span);
    li.appendChild(p);

    messageContainer.appendChild(li);
    messageContainer.scrollTop = messageContainer.scrollHeight;
    
    // Store message in map for quick lookup
    const msgKey = `${data.from}-${data.time}`;
    messageMap[msgKey] = { ...data, element: li };
    
    setupMessageSwipe(p, data);
}

function selectUser(username) {
    currentChatUser = username;
    localStorage.setItem('chatWith', username);

    // Update chat header with username and online status
    if (chatWithElement) {
        const userObj = window.currentUserList?.find(u => u.username === username);
        const onlineStatus = userObj?.online ? 'online' : 'offline';
        chatWithElement.innerHTML = `<div>${escapeHtml(username)}</div><small style="opacity:0.7">${onlineStatus}</small>`;
    }

    // Highlight active user
    Array.from(userListElement.children).forEach(li => {
        li.classList.toggle('active', li.dataset.username === username);
    });

    messageContainer.innerHTML = '';
    if (typingIndicator) typingIndicator.textContent = '';
    
    // Clear message map for new chat
    messageMap = {};
    
    socket.emit('get-history', username);
    
    // Mark messages from this user as read
    socket.emit('mark-read', { from: username });
    
    // Get unseen count
    socket.emit('get-unseen', username);
    
    resetInactivity();
    showChatPanel();
}

// ── Search and Chat List Management ──────────────────────────────────────────

// Get list of users with whom we have exchanged messages
function getChatUsers() {
    // Load chat history from localStorage
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const usersWithChats = new Set();
    
    chatHistory.forEach(msg => {
        const me = nameInput.value;
        if (msg.from === me) usersWithChats.add(msg.to);
        if (msg.to === me) usersWithChats.add(msg.from);
    });
    
    return Array.from(usersWithChats);
}

// Update the main user list to show only users with chats
function updateChatUserList() {
    const me = nameInput.value;
    const chatUsers = getChatUsers();
    
    userListElement.innerHTML = '';
    const chatUserObjs = allAvailableUsers.filter(u => chatUsers.includes(u.username));
    
    if (chatUserObjs.length === 0) {
        userListElement.innerHTML = '<li style="opacity:0.6; padding: 10px 12px; font-size:12px;">No conversations yet</li>';
    }
    
    chatUserObjs.forEach(obj => {
        const li = document.createElement('li');
        li.dataset.username = obj.username;
        
        const dot = obj.online ? '🟢' : '⚫';
        const count = window.unseenCounts[obj.username] || 0;
        const badge = count > 0 ? ` <span class="unseen-badge">${count}</span>` : '';
        
        li.innerHTML = `${dot} ${escapeHtml(obj.username)}${badge}`;
        if (currentChatUser === obj.username) li.classList.add('active');
        li.style.cursor = 'pointer';
        if (!obj.online) li.style.opacity = '0.6';
        li.addEventListener('click', () => selectUser(obj.username));
        userListElement.appendChild(li);
    });
}

// Handle search input
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        if (!query) {
            searchResults.style.display = 'none';
            updateChatUserList();
            return;
        }
        
        const me = nameInput.value;
        const filtered = allAvailableUsers.filter(u => 
            u.username.toLowerCase().includes(query) && u.username !== me
        );
        
        searchResults.innerHTML = '';
        if (filtered.length === 0) {
            searchResults.innerHTML = '<li style="opacity:0.6; padding: 10px 12px; font-size:12px;">No users found</li>';
        } else {
            filtered.forEach(obj => {
                const li = document.createElement('li');
                li.dataset.username = obj.username;
                
                const dot = obj.online ? '🟢' : '⚫';
                li.innerHTML = `${dot} ${escapeHtml(obj.username)}`;
                li.addEventListener('click', () => {
                    selectUser(obj.username);
                    searchInput.value = '';
                    searchResults.style.display = 'none';
                });
                searchResults.appendChild(li);
            });
        }
        
        searchResults.style.display = 'block';
    });
    
    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
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