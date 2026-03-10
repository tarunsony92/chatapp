/**
 * audio-call.js — NexChat Audio Call Module
 * WebRTC P2P audio calls via Socket.IO signaling
 */

console.log('[AUDIO-CALL] Module loading...');

/* ─── socket helper ─────────────────────────────────── */
function getSocket() { return window.socket; }
function getMe()     { return window.currentUsername || ''; }

/* ─── state ─────────────────────────────────────────── */
let peerConnection      = null;
let localStream         = null;
let callInProgress      = false;
let callPartner         = null;
let incomingCallFrom    = null;
let callStartTime       = null;
let callDurationInterval = null;
let pendingOffer        = null;
let ringtoneInterval    = null;

/* ─── DOM ────────────────────────────────────────────── */
const callModal         = document.getElementById('call-modal');
const incomingCallModal = document.getElementById('incoming-call-modal');
const callStatusEl      = document.getElementById('call-status');
const callPeerNameEl    = document.getElementById('call-peer-name');
const incomingCallerEl  = document.getElementById('incoming-caller-name');
const callDurationEl    = document.getElementById('call-duration');
// Use separate IDs from video call module to avoid conflicts
const localAudioEl      = document.getElementById('local-audio');
const remoteAudioEl     = document.getElementById('remote-audio-call');

/* ─── ICE servers ───────────────────────────────────── */
const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

/* ════════════════════════════════════════════════════════
   INITIATE CALL
════════════════════════════════════════════════════════ */
async function initiateAudioCall(username) {
    if (callInProgress) { alert('Already in a call'); return; }
    const socket = getSocket();
    if (!socket || !socket.connected) { alert('Socket not connected'); return; }

    callPartner   = username;
    callInProgress = true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (localAudioEl) { localAudioEl.srcObject = localStream; }

        createPeerConnection();
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

        showCallUI(username);
        if (callStatusEl) callStatusEl.textContent = 'Calling ' + username + '…';

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('call-initiate', { to: username, offer });

    } catch (err) {
        console.error('[AUDIO-CALL] initiateAudioCall error:', err);
        alert('Microphone error: ' + err.message);
        endCall();
    }
}

/* ════════════════════════════════════════════════════════
   INCOMING CALL
════════════════════════════════════════════════════════ */
function handleIncomingCall(from, offer) {
    console.log('[AUDIO-CALL] Incoming from:', from);
    if (callInProgress) {
        getSocket().emit('call-reject', { to: from });
        return;
    }
    incomingCallFrom = from;
    pendingOffer     = offer;
    if (incomingCallerEl) incomingCallerEl.textContent = from;
    showIncomingCallUI();
}

/* ════════════════════════════════════════════════════════
   ACCEPT CALL
════════════════════════════════════════════════════════ */
async function acceptCall() {
    if (!incomingCallFrom || !pendingOffer) return;
    hideIncomingCallUI();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        createPeerConnection();
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        getSocket().emit('call-answer', { to: incomingCallFrom, answer });

        callPartner    = incomingCallFrom;
        callInProgress = true;
        pendingOffer   = null;
        incomingCallFrom = null;

        showCallUI(callPartner);
        if (callStatusEl) callStatusEl.textContent = 'Connected';
        startCallTimer();

    } catch (err) {
        console.error('[AUDIO-CALL] acceptCall error:', err);
        rejectCall();
    }
}

/* ════════════════════════════════════════════════════════
   REJECT CALL
════════════════════════════════════════════════════════ */
function rejectCall() {
    if (incomingCallFrom) {
        getSocket().emit('call-reject', { to: incomingCallFrom });
    }
    incomingCallFrom = null;
    pendingOffer     = null;
    hideIncomingCallUI();
}

/* ════════════════════════════════════════════════════════
   HANDLE ANSWER (caller receives this)
════════════════════════════════════════════════════════ */
async function handleCallAnswer(from, answer) {
    if (!peerConnection) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        if (callStatusEl) callStatusEl.textContent = 'Connected';
        startCallTimer();
    } catch (err) {
        console.error('[AUDIO-CALL] handleCallAnswer error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   ICE CANDIDATE
════════════════════════════════════════════════════════ */
async function handleIceCandidate(from, candidate) {
    if (!peerConnection) return;
    try {
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.warn('[AUDIO-CALL] ICE error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   END CALL
════════════════════════════════════════════════════════ */
function endCall() {
    const partner = callPartner;

    callInProgress   = false;
    callPartner      = null;
    incomingCallFrom = null;

    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream)    { localStream.getTracks().forEach(t => t.stop()); localStream = null; }

    if (partner && getSocket()) {
        getSocket().emit('call-end', { to: partner });
    }

    stopCallTimer();
    hideCallUI();
    hideIncomingCallUI();

    // Log the call if logger available
    if (partner && callStartTime && window.logCall) {
        const duration = Math.floor((Date.now() - callStartTime) / 1000);
        window.logCall({ type: 'audio', partner, duration, timestamp: callStartTime });
    }
    callStartTime = null;
}

/* ════════════════════════════════════════════════════════
   PEER CONNECTION
════════════════════════════════════════════════════════ */
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(ICE_CONFIG);

    peerConnection.onicecandidate = e => {
        if (e.candidate && callPartner) {
            getSocket().emit('ice-candidate', { to: callPartner, candidate: e.candidate });
        }
    };

    peerConnection.ontrack = e => {
        if (remoteAudioEl) {
            remoteAudioEl.srcObject = e.streams[0];
            remoteAudioEl.play().catch(() => {});
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('[AUDIO-CALL] Connection state:', state);
        if (state === 'disconnected' || state === 'failed') endCall();
    };
}

/* ════════════════════════════════════════════════════════
   CALL TIMER
════════════════════════════════════════════════════════ */
function startCallTimer() {
    callStartTime = Date.now();
    if (callDurationEl) callDurationEl.textContent = '00:00';
    callDurationInterval = setInterval(() => {
        if (!callStartTime || !callDurationEl) return;
        const s = Math.floor((Date.now() - callStartTime) / 1000);
        callDurationEl.textContent =
            String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
    }, 1000);
}

function stopCallTimer() {
    clearInterval(callDurationInterval);
    callDurationInterval = null;
}

/* ════════════════════════════════════════════════════════
   UI
════════════════════════════════════════════════════════ */
function showCallUI(username) {
    if (callPeerNameEl) callPeerNameEl.textContent = username || callPartner;
    if (callDurationEl) callDurationEl.textContent = '00:00';
    if (callModal) callModal.style.display = 'flex';
}
function hideCallUI() {
    if (callModal) callModal.style.display = 'none';
}
function showIncomingCallUI() {
    if (incomingCallModal) incomingCallModal.style.display = 'flex';
    playRingtone();
}
function hideIncomingCallUI() {
    if (incomingCallModal) incomingCallModal.style.display = 'none';
    stopRingtone();
}

/* ════════════════════════════════════════════════════════
   RINGTONE (simple beep fallback if file missing)
════════════════════════════════════════════════════════ */
function playRingtone() {
    stopRingtone();
    const tryPlay = () => {
        try {
            const audio = new Audio('/sounds/ringtone.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch {}
    };
    tryPlay();
    ringtoneInterval = setInterval(tryPlay, 3000);
}
function stopRingtone() {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
}

/* ════════════════════════════════════════════════════════
   TOGGLE MUTE
════════════════════════════════════════════════════════ */
function toggleLocalAudio() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('mute-audio-btn');
    if (btn) {
        btn.textContent = track.enabled ? '🎤' : '🔇';
        btn.style.opacity = track.enabled ? '1' : '0.5';
    }
}

/* ════════════════════════════════════════════════════════
   CALL EVENTS FROM PEER
════════════════════════════════════════════════════════ */
function handleCallRejection(from) {
    if (callStatusEl) callStatusEl.textContent = 'Call declined';
    setTimeout(endCall, 1500);
}
function handleCallEnd() {
    if (callStatusEl) callStatusEl.textContent = 'Call ended';
    setTimeout(endCall, 500);
}

/* ════════════════════════════════════════════════════════
   BUTTON WIRING
════════════════════════════════════════════════════════ */
(function wireButtons() {
    const wire = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };
    wire('accept-call-btn',  () => acceptCall());
    wire('reject-call-btn',  () => rejectCall());
    wire('call-end-btn',     () => endCall());
    wire('mute-audio-btn',   () => toggleLocalAudio());
})();

/* ════════════════════════════════════════════════════════
   EXPORTS
════════════════════════════════════════════════════════ */
window.initiateAudioCall    = initiateAudioCall;
window.acceptCall           = acceptCall;
window.rejectCall           = rejectCall;
window.endCall              = endCall;
window.toggleLocalAudio     = toggleLocalAudio;
window.handleIncomingCall   = handleIncomingCall;
window.handleCallAnswer     = handleCallAnswer;
window.handleIceCandidate   = handleIceCandidate;
window.handleCallRejection  = handleCallRejection;
window.handleCallEnd        = handleCallEnd;

console.log('[AUDIO-CALL] ✓ Module loaded');