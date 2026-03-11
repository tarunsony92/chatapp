/**
 * audio-call.js — NexChat Audio Call Module
 * WebRTC P2P audio calls via Socket.IO signaling
 */

console.log('[AUDIO-CALL] Module loading...');

/* ─── state ─────────────────────────────────────────── */
var audioPeerConnection  = null;
var audioLocalStream     = null;
var audioCallInProgress  = false;
var audioCallPartner     = null;
var audioIncomingFrom    = null;
var audioCallStartTime   = null;
var audioDurationInterval = null;
var audioPendingOffer    = null;
var audioIsMuted         = false;
var audioIsScreenSharing = false;
var audioScreenStream    = null;
var ringtoneInterval     = null;

/* ─── DOM ────────────────────────────────────────────── */
var callModal         = document.getElementById('call-modal');
var incomingCallModal = document.getElementById('incoming-call-modal');
var callStatusEl      = document.getElementById('call-status');
var callPeerNameEl    = document.getElementById('call-peer-name');
var incomingCallerEl  = document.getElementById('incoming-caller-name');
var callDurationEl    = document.getElementById('call-duration');
var localAudioEl      = document.getElementById('local-audio');
var remoteAudioEl     = document.getElementById('remote-audio-call');

/* ─── ICE servers ───────────────────────────────────── */
var AUDIO_ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

/* ════════════════════════════════════════════════════════
   INITIATE CALL
════════════════════════════════════════════════════════ */
async function initiateAudioCall(username) {
    if (audioCallInProgress) { alert('Already in a call.'); return; }
    if (!socket || !socket.connected) { alert('Not connected to server.'); return; }

    audioCallPartner   = username;
    audioCallInProgress = true;

    try {
        audioLocalStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (localAudioEl) localAudioEl.srcObject = audioLocalStream;

        createAudioPeerConnection();
        audioLocalStream.getTracks().forEach(function(t) {
            audioPeerConnection.addTrack(t, audioLocalStream);
        });

        showAudioCallUI(username);
        if (callStatusEl) callStatusEl.textContent = 'Calling ' + username + '…';

        var offer = await audioPeerConnection.createOffer({ offerToReceiveAudio: true });
        await audioPeerConnection.setLocalDescription(offer);
        socket.emit('call-initiate', { to: username, offer: offer });

    } catch (err) {
        console.error('[AUDIO-CALL] initiateAudioCall error:', err);
        alert('Microphone error: ' + err.message);
        cleanupAudioCall();
    }
}

/* ════════════════════════════════════════════════════════
   INCOMING CALL
════════════════════════════════════════════════════════ */
function handleIncomingCall(from, offer) {
    console.log('[AUDIO-CALL] Incoming call from:', from);
    if (audioCallInProgress) {
        socket.emit('call-reject', { to: from });
        return;
    }
    audioIncomingFrom = from;
    audioPendingOffer = offer;
    if (incomingCallerEl) incomingCallerEl.textContent = from;
    if (incomingCallModal) incomingCallModal.style.display = 'flex';
    playRingtone();
}

/* ════════════════════════════════════════════════════════
   ACCEPT CALL
════════════════════════════════════════════════════════ */
async function acceptCall() {
    if (!audioIncomingFrom || !audioPendingOffer) return;
    stopRingtone();
    if (incomingCallModal) incomingCallModal.style.display = 'none';

    try {
        audioLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (localAudioEl) localAudioEl.srcObject = audioLocalStream;

        createAudioPeerConnection();
        audioLocalStream.getTracks().forEach(function(t) {
            audioPeerConnection.addTrack(t, audioLocalStream);
        });

        await audioPeerConnection.setRemoteDescription(new RTCSessionDescription(audioPendingOffer));
        var answer = await audioPeerConnection.createAnswer({ offerToReceiveAudio: true });
        await audioPeerConnection.setLocalDescription(answer);
        socket.emit('call-answer', { to: audioIncomingFrom, answer: answer });

        audioCallPartner    = audioIncomingFrom;
        audioCallInProgress = true;
        audioPendingOffer   = null;
        audioIncomingFrom   = null;

        showAudioCallUI(audioCallPartner);
        if (callStatusEl) callStatusEl.textContent = 'Connected';
        startAudioCallTimer();

    } catch (err) {
        console.error('[AUDIO-CALL] acceptCall error:', err);
        rejectCall();
    }
}

/* ════════════════════════════════════════════════════════
   REJECT CALL
════════════════════════════════════════════════════════ */
function rejectCall() {
    stopRingtone();
    if (audioIncomingFrom) {
        socket.emit('call-reject', { to: audioIncomingFrom });
    }
    audioIncomingFrom = null;
    audioPendingOffer = null;
    if (incomingCallModal) incomingCallModal.style.display = 'none';
}

/* ════════════════════════════════════════════════════════
   HANDLE ANSWER (caller receives this)
════════════════════════════════════════════════════════ */
async function handleCallAnswer(from, answer) {
    if (!audioPeerConnection) return;
    try {
        await audioPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        if (callStatusEl) callStatusEl.textContent = 'Connected';
        startAudioCallTimer();
    } catch (err) {
        console.error('[AUDIO-CALL] handleCallAnswer error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   ICE CANDIDATE
════════════════════════════════════════════════════════ */
async function handleIceCandidate(from, candidate) {
    if (!audioPeerConnection) return;
    try {
        if (audioPeerConnection.remoteDescription) {
            await audioPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.warn('[AUDIO-CALL] ICE error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   END CALL
════════════════════════════════════════════════════════ */
function endCall() {
    var partner = audioCallPartner;

    if (partner && socket) {
        socket.emit('call-end', { to: partner });
    }

    // Log call duration
    if (partner && audioCallStartTime && typeof logCall === 'function') {
        var duration = Math.floor((Date.now() - audioCallStartTime) / 1000);
        logCall({ type: 'audio', partner: partner, duration: duration, timestamp: audioCallStartTime });
    }

    cleanupAudioCall();
}

function handleCallRejection(from) {
    if (callStatusEl) callStatusEl.textContent = 'Call declined';
    setTimeout(cleanupAudioCall, 1500);
}

function handleCallEnd() {
    if (callStatusEl) callStatusEl.textContent = 'Call ended';
    setTimeout(cleanupAudioCall, 500);
}

/* ════════════════════════════════════════════════════════
   PEER CONNECTION
════════════════════════════════════════════════════════ */
function createAudioPeerConnection() {
    audioPeerConnection = new RTCPeerConnection(AUDIO_ICE_CONFIG);

    audioPeerConnection.onicecandidate = function(e) {
        if (e.candidate && audioCallPartner) {
            socket.emit('ice-candidate', { to: audioCallPartner, candidate: e.candidate });
        }
    };

    audioPeerConnection.ontrack = function(e) {
        if (remoteAudioEl) {
            remoteAudioEl.srcObject = e.streams[0];
            remoteAudioEl.play().catch(function() {});
        }
    };

    audioPeerConnection.onconnectionstatechange = function() {
        var state = audioPeerConnection.connectionState;
        console.log('[AUDIO-CALL] Connection state:', state);
        if (state === 'disconnected' || state === 'failed') endCall();
    };
}

/* ════════════════════════════════════════════════════════
   MUTE TOGGLE
════════════════════════════════════════════════════════ */
function toggleLocalAudio() {
    if (!audioLocalStream) return;
    var track = audioLocalStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    audioIsMuted = !track.enabled;
    var btn = document.getElementById('mute-audio-btn');
    if (btn) {
        btn.textContent = audioIsMuted ? '🔇' : '🎤';
        btn.style.opacity = audioIsMuted ? '0.5' : '1';
    }
}

/* ════════════════════════════════════════════════════════
   SCREEN SHARE (during audio call)
════════════════════════════════════════════════════════ */
async function toggleAudioScreenShare() {
    if (!audioPeerConnection) return;
    var btn = document.getElementById('audio-share-screen-btn');

    if (!audioIsScreenSharing) {
        try {
            audioScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            var screenTrack = audioScreenStream.getVideoTracks()[0];

            // Add video track to existing peer connection
            audioPeerConnection.addTrack(screenTrack, audioScreenStream);

            audioIsScreenSharing = true;
            if (btn) { btn.style.background = '#22c55e'; btn.textContent = '📺 Stop'; }

            screenTrack.onended = function() {
                if (audioIsScreenSharing) toggleAudioScreenShare();
            };
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                console.error('[AUDIO-CALL] screen share error:', err);
                alert('Screen share error: ' + err.message);
            }
        }
    } else {
        if (audioScreenStream) {
            audioScreenStream.getTracks().forEach(function(t) { t.stop(); });
            audioScreenStream = null;
        }
        audioIsScreenSharing = false;
        if (btn) { btn.style.background = ''; btn.textContent = '📺'; }
    }
}

/* ════════════════════════════════════════════════════════
   TIMER
════════════════════════════════════════════════════════ */
function startAudioCallTimer() {
    stopAudioCallTimer();
    audioCallStartTime = Date.now();
    if (callDurationEl) callDurationEl.textContent = '00:00';
    audioDurationInterval = setInterval(function() {
        if (!audioCallStartTime || !callDurationEl) return;
        var s = Math.floor((Date.now() - audioCallStartTime) / 1000);
        callDurationEl.textContent =
            String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
}

function stopAudioCallTimer() {
    clearInterval(audioDurationInterval);
    audioDurationInterval = null;
}

/* ════════════════════════════════════════════════════════
   CLEANUP
════════════════════════════════════════════════════════ */
function cleanupAudioCall() {
    if (audioLocalStream)  audioLocalStream.getTracks().forEach(function(t) { t.stop(); });
    if (audioScreenStream) audioScreenStream.getTracks().forEach(function(t) { t.stop(); });
    audioLocalStream = null;
    audioScreenStream = null;

    if (audioPeerConnection) { audioPeerConnection.close(); audioPeerConnection = null; }
    if (localAudioEl)  localAudioEl.srcObject  = null;
    if (remoteAudioEl) remoteAudioEl.srcObject = null;
    if (callModal)         callModal.style.display         = 'none';
    if (incomingCallModal) incomingCallModal.style.display = 'none';

    stopAudioCallTimer();
    stopRingtone();

    audioCallPartner    = null;
    audioCallStartTime  = null;
    audioPendingOffer   = null;
    audioIncomingFrom   = null;
    audioIsMuted        = false;
    audioIsScreenSharing = false;
    audioCallInProgress = false;

    var muteBtn = document.getElementById('mute-audio-btn');
    if (muteBtn) { muteBtn.textContent = '🎤'; muteBtn.style.opacity = '1'; }
    var screenBtn = document.getElementById('audio-share-screen-btn');
    if (screenBtn) { screenBtn.style.background = ''; screenBtn.textContent = '📺'; }
}

/* ════════════════════════════════════════════════════════
   UI
════════════════════════════════════════════════════════ */
function showAudioCallUI(username) {
    if (callPeerNameEl) callPeerNameEl.textContent = username;
    if (callDurationEl) callDurationEl.textContent = '00:00';
    if (incomingCallModal) incomingCallModal.style.display = 'none';
    if (callModal) callModal.style.display = 'flex';
}

/* ════════════════════════════════════════════════════════
   RINGTONE
════════════════════════════════════════════════════════ */
function playRingtone() {
    stopRingtone();
    function tryPlay() {
        try {
            var audio = new Audio('/sounds/ringtone.mp3');
            audio.volume = 0.5;
            audio.play().catch(function() {});
        } catch (e) {}
    }
    tryPlay();
    ringtoneInterval = setInterval(tryPlay, 3000);
}

function stopRingtone() {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
}

/* ════════════════════════════════════════════════════════
   BUTTON WIRING
════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
    function wire(id, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }
    wire('accept-call-btn',           function() { acceptCall(); });
    wire('reject-call-btn',           function() { rejectCall(); });
    wire('call-end-btn',              function() { endCall(); });
    wire('mute-audio-btn',            function() { toggleLocalAudio(); });
    wire('audio-share-screen-btn',    function() { toggleAudioScreenShare(); });
});

/* ════════════════════════════════════════════════════════
   EXPORTS
════════════════════════════════════════════════════════ */
window.initiateAudioCall   = initiateAudioCall;
window.handleIncomingCall  = handleIncomingCall;
window.handleCallAnswer    = handleCallAnswer;
window.handleIceCandidate  = handleIceCandidate;
window.handleCallRejection = handleCallRejection;
window.handleCallEnd       = handleCallEnd;
window.cleanupAudioCall    = cleanupAudioCall;
window.toggleLocalAudio    = toggleLocalAudio;
window.acceptCall          = acceptCall;
window.rejectCall          = rejectCall;
window.endCall             = endCall;

console.log('[AUDIO-CALL] ✓ Module loaded');