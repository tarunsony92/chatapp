/**
 * Messages Module
 * Handles message creation, sending, and UI updates
 */

const messageContainer = document.getElementById('message-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const replyQuote = document.getElementById('reply-quote');
const replyQuoteContent = document.querySelector('.reply-quote-content');
const replyCloseBtn = document.getElementById('reply-close-btn');
const typingIndicator = document.getElementById('typing-indicator');

/** Sign up for form submission */
if (messageForm) {
    messageForm.addEventListener('submit', e => {
        e.preventDefault();
        sendMessage();
        resetInactivity();
    });

    // Typing indicator
    messageInput && messageInput.addEventListener('input', () => {
        socket && emitTyping(true);
    });
    messageInput && messageInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && messageInput.value.trim()) return;
        if (!messageInput.value.trim()) {
            socket && emitTyping(false);
        }
    });
}

/** Send a message */
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

/** Add text message to UI */
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

/** Add image message to UI */
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

/** Add voice message to UI */
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
    audio.controlsList = 'nodownload';
    audio.preload = 'metadata';
    audio.src = data.content;
    audio.style.width = '100%';
    audio.style.minHeight = '42px';

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

/** Scroll to and highlight original message when clicking reply context */
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

/** Setup reply UI */
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

/** Setup swipe handler for messages */
function setupMessageSwipe(element, messageData) {
    let startX = 0;
    const threshold = 50;

    element.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    }, false);

    element.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;

        if (Math.abs(diff) > threshold) {
            showMessageDetails(messageData);
        }
    }, false);

    // Desktop click support
    element.addEventListener('click', () => {
        showMessageDetails(messageData);
    });
}

/** Mark messages as read */
function markMessagesRead(fromUser) {
    socket.emit('mark-read', { from: fromUser });
}

/** Update unseen badge for user */
function updateUnseenBadge(username) {
    const li = document.querySelector(`[data-username="${username}"]`);
    if (!li) return;
    
    const count = window.unseenCounts[username] || 0;
    const badge = li.querySelector('.unseen-badge');
    
    if (count > 0) {
        if (badge) {
            badge.textContent = count;
        } else {
            const newBadge = document.createElement('span');
            newBadge.className = 'unseen-badge';
            newBadge.textContent = count;
            li.appendChild(newBadge);
        }
    } else {
        if (badge) badge.remove();
    }
}
