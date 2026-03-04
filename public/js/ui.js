/**
 * UI Module
 * Handles UI interactions, modal, and user selection
 */

const sidebar = document.querySelector('.sidebar');
const chatArea = document.querySelector('.chat-area');
const backBtn = document.getElementById('back-btn');
const chatWithElement = document.getElementById('chatWith');
const userListElement = document.getElementById('userList');
const msgDetailsModal = document.getElementById('msg-details-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const detailReplyBtn = document.getElementById('detail-reply-btn');
const detailCloseBtn = document.getElementById('detail-close-btn');

/** Show chat panel (mobile) */
function showChatPanel() {
    if (!isMobile()) return;
    sidebar.classList.add('hidden-mobile');
    chatArea.classList.add('visible-mobile');
}

/** Show sidebar panel (mobile) */
function showSidebarPanel() {
    if (!isMobile()) return;
    chatArea.classList.remove('visible-mobile');
    sidebar.classList.remove('hidden-mobile');
}

/** Back button → go back to user list on mobile */
if (backBtn) {
    backBtn.addEventListener('click', () => {
        currentChatUser = null;
        localStorage.removeItem('chatWith');
        showSidebarPanel();
        if (typingIndicator) typingIndicator.textContent = '';
    });
}

/** Show message details modal */
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

/** Modal event listeners */
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        msgDetailsModal.style.display = 'none';
    });
}

if (detailCloseBtn) {
    detailCloseBtn.addEventListener('click', () => {
        msgDetailsModal.style.display = 'none';
    });
}

if (detailReplyBtn) {
    detailReplyBtn.addEventListener('click', () => {
        setupReplyUI(replyToMsg);
        msgDetailsModal.style.display = 'none';
    });
}

if (replyCloseBtn) {
    replyCloseBtn.addEventListener('click', () => {
        setupReplyUI(null);
    });
}

/** Close modal when clicking outside */
if (msgDetailsModal) {
    msgDetailsModal.addEventListener('click', (e) => {
        if (e.target === msgDetailsModal) {
            msgDetailsModal.style.display = 'none';
        }
    });
}

/** Select user to chat with */
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

/** Show placeholder message */
function showPlaceholder() {
    if (messageContainer.children.length === 0) {
        messageContainer.innerHTML = '<li class="message-feedback"><p class="feedback">Select someone to start chatting 👋</p></li>';
    }
}
