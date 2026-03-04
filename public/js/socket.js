/**
 * Socket.io Module
 * Manages all real-time socket connections and events
 */

const clientCountElement = document.getElementById('client-total');

/** Initialize socket connection */
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

    socket.on('connect', () => {
        console.log('Connected to server');
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

    socket.on('client-count', count => {
        clientCountElement.textContent = `Online: ${count}`;
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
        const typingIndicator = document.getElementById('typing-indicator');
        if (!typingIndicator) return;
        if (info.from === currentChatUser) {
            typingIndicator.textContent = info.active ? `${escapeHtml(info.from)} is typing...` : '';
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
            if (msg.type === 'text') addMessageToUI(isOwn, msg);
            else if (msg.type === 'image') addImageToUI(isOwn, msg);
            else if (msg.type === 'voice') addVoiceToUI(isOwn, msg);
        });
    });

    socket.on('mark-read', data => {
        // Update UI to show read status
        const lis = messageContainer.querySelectorAll('li');
        lis.forEach(li => {
            const span = li.querySelector('.msg-time');
            if (span && span.textContent.includes(data.from)) {
                // Message from this user was read
                const msgElement = li.querySelector('.message');
                if (msgElement && !msgElement.classList.contains('read-status-updated')) {
                    msgElement.classList.add('read-status-updated');
                }
            }
        });
    });

    socket.on('unseen-count', data => {
        window.unseenCounts = window.unseenCounts || {};
        window.unseenCounts[data.from] = data.count;
        updateUnseenBadge(data.from);
    });

    socket.on('msgs-read', data => {
        // Mark messages from current user as read by recipient
        const lis = messageContainer.querySelectorAll('li');
        lis.forEach(li => {
            const span = li.querySelector('.msg-time');
            if (span && span.textContent.includes('✓ sent')) {
                // Update to show as read
                const status = span.textContent.replace('✓ sent', '✓✓');
                span.textContent = status;
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

/** Emit typing status */
function emitTyping(active) {
    if (currentChatUser && socket) {
        socket.emit('typing', { to: currentChatUser, active });
    }
}
