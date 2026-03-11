/**
 * Socket.io Module
 * Manages all real-time socket connections and events
 */

var clientCountElement = document.getElementById('client-total');

/** Initialize socket connection */
function initSocket() {
    socket = io(window.location.origin, {
    transports: ['websocket'], withCredentials: true });
    
    setupInactivityLogout();

    socket.on('connect_error', function(err) {
        console.error('Socket error:', err.message);
        if (err.message === 'authentication error') {
            alert('Session expired. Please log in again.');
            logout();
        }
    });

    socket.on('connect', function() {
        console.log('[SOCKET] Connected:', socket.id);
    });

    socket.on('disconnect', function() {
        console.log('[SOCKET] Disconnected');
    });

    /* ── User list ── */
    socket.on('users', function(users) {
        allAvailableUsers = users;
        window.currentUserList = users;

        var onlineCount = users.filter(function(u) { return u.online; }).length;
        if (clientCountElement) clientCountElement.textContent = onlineCount + ' online';

        updateChatUserList();

        if (currentChatUser) {
            var obj = users.find(function(u) { return u.username === currentChatUser; });
            if (obj) {
                var statusEl = document.getElementById('chat-peer-status');
                if (statusEl) {
                    statusEl.textContent = obj.online ? '● Online' : '○ Offline';
                    statusEl.className = 'chat-peer-status' + (obj.online ? ' is-online' : '');
                }
            }
        }

        // Auto-reselect last chat partner
        var stored = localStorage.getItem('chatWith');
        if (stored && stored !== currentUsername && users.some(function(u) { return u.username === stored; })) {
            if (currentChatUser !== stored) selectUser(stored);
        }
    });

    /* ── Incoming text message ── */
    socket.on('message', function(data) {
        if (data.from === currentUsername) return;
        trackMsg(data);
        if (data.from === currentChatUser) {
            addMessageToUI(false, data);
            socket.emit('mark-read', { from: data.from });
        } else {
            window.unseenCounts[data.from] = (window.unseenCounts[data.from] || 0) + 1;
            updateChatUserList();
        }
    });

    /* ── Incoming image ── */
    socket.on('image', function(data) {
        if (data.from === currentUsername) return;
        trackMsg(data);
        if (data.from === currentChatUser) {
            addImageToUI(false, data);
            socket.emit('mark-read', { from: data.from });
        } else {
            window.unseenCounts[data.from] = (window.unseenCounts[data.from] || 0) + 1;
            updateChatUserList();
        }
    });

    /* ── Incoming voice ── */
    socket.on('voice', function(data) {
        if (data.from === currentUsername) return;
        trackMsg(data);
        if (data.from === currentChatUser) {
            addVoiceToUI(false, data);
            socket.emit('mark-read', { from: data.from });
        } else {
            window.unseenCounts[data.from] = (window.unseenCounts[data.from] || 0) + 1;
            updateChatUserList();
        }
    });

    /* ── Chat history ── */
    socket.on('history', function(msgs) {
        messageMap = {};
        var mc = document.getElementById('message-container');
        mc.innerHTML = '';
        if (!msgs || msgs.length === 0) {
            mc.innerHTML = '<li class="chat-empty" style="flex:1"><div class="e-icon-big">💬</div><p>No messages yet. Say hello!</p></li>';
        } else {
            msgs.forEach(function(m) {
                addAnyMsgToUI(m.from === currentUsername, m);
            });
        }
        mc.scrollTop = mc.scrollHeight;
    });

    /* ── Typing indicator ── */
    socket.on('typing', function(data) {
        var ti = document.getElementById('typing-indicator');
        if (!ti) return;
        if (data.from === currentChatUser && data.active) {
            ti.innerHTML = '<span>' + escapeHtml(data.from) + ' is typing</span>'
                + '<div class="typing-dots"><span></span><span></span><span></span></div>';
        } else {
            ti.innerHTML = '';
        }
    });

    /* ── Read receipts ── */
    socket.on('message-read', function() { updateChatUserList(); });
    socket.on('msgs-read',    function() { updateChatUserList(); });

    /* ── Unseen counts ── */
    socket.on('unseen-count', function(data) {
        window.unseenCounts[data.from] = data.count;
        updateUnseenBadge(data.from);
    });

    /* ════════════════════════════════════════════════════
       AUDIO CALL EVENTS
    ════════════════════════════════════════════════════ */
    socket.on('call-initiate', function(data) {
        console.log('[SOCKET] call-initiate from:', data.from);
        if (typeof handleIncomingCall === 'function') handleIncomingCall(data.from, data.offer);
    });

    socket.on('call-answer', function(data) {
        console.log('[SOCKET] call-answer from:', data.from);
        if (typeof handleCallAnswer === 'function') handleCallAnswer(data.from, data.answer);
    });

    socket.on('ice-candidate', function(data) {
        if (typeof handleIceCandidate === 'function') handleIceCandidate(data.from, data.candidate);
    });

    socket.on('call-reject', function(data) {
        console.log('[SOCKET] call-reject from:', data.from);
        if (typeof handleCallRejection === 'function') handleCallRejection(data.from);
    });

    socket.on('call-end', function() {
        console.log('[SOCKET] call-end');
        if (typeof handleCallEnd === 'function') handleCallEnd();
    });

    /* ════════════════════════════════════════════════════
       VIDEO CALL EVENTS
    ════════════════════════════════════════════════════ */
    socket.on('video-call-initiate', function(data) {
        console.log('[SOCKET] video-call-initiate from:', data.from);
        if (typeof handleIncomingVideoCall === 'function') handleIncomingVideoCall(data);
    });

    socket.on('video-call-answer', function(data) {
        console.log('[SOCKET] video-call-answer from:', data.from);
        if (typeof handleVideoCallAnswer === 'function') handleVideoCallAnswer(data);
    });

    socket.on('video-call-ice', function(data) {
        if (typeof handleVideoCallIce === 'function') handleVideoCallIce(data);
    });

    socket.on('video-call-reject', function(data) {
        alert((data.from || 'User') + ' declined the video call.');
        if (typeof cleanupVideoCall === 'function') cleanupVideoCall();
    });

    socket.on('video-call-end', function() {
        if (typeof handleVideoCallEnd === 'function') handleVideoCallEnd();
    });
}

/** Emit typing status */
function emitTyping(active) {
    if (currentChatUser && socket) {
        socket.emit('typing', { to: currentChatUser, active: active });
    }
}