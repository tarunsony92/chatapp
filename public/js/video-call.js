/**
 * video-call.js — NexChat Video Call Module
 * WebRTC P2P video calls via Socket.IO signaling
 */

console.log('[VIDEO-CALL] Module loading...');

/* ─── socket helper ─────────────────────────────────── */
function getSocket() { return window.socket; }
function getMe()     { return window.currentUsername || ''; }

/* ─── state ─────────────────────────────────────────── */
let videoPeerConnection  = null;
let localVideoStream     = null;
let localScreenStream    = null;
let remoteVideoStream    = null;
let remoteAudioStream    = null;
let videoCallPartner     = null;
let videoCallStartTime   = null;
let videoDurationInterval = null;
let pendingVideoOffer    = null;
let isScreenSharing      = false;

/* ─── DOM ────────────────────────────────────────────── */
const videoCallModal        = document.getElementById('video-call-modal');
const incomingVideoModal    = document.getElementById('incoming-video-call-modal');
const localVideoEl          = document.getElementById('local-video');
const remoteVideoEl         = document.getElementById('remote-video');
// Use separate element to avoid conflict with audio call's remote-audio-call
const remoteAudioVideoEl    = document.getElementById('remote-audio-video');
const videoDurationEl       = document.getElementById('video-call-duration');
const videoStatusEl         = document.getElementById('video-call-status');

/* ─── ICE servers ───────────────────────────────────── */
const ICE_CONFIG = {
    iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
};

/* ════════════════════════════════════════════════════════
   INITIATE VIDEO CALL
════════════════════════════════════════════════════════ */
async function initiateVideoCall(recipientUsername) {
    if (videoPeerConnection) { alert('Already in a video call'); return; }

    const socket = getSocket();
    if (!socket || !socket.connected) { alert('Socket not connected'); return; }

    videoCallPartner = recipientUsername;

    try {
        localVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: {ideal:1280}, height: {ideal:720} },
            audio: true
        });

        if (localVideoEl) localVideoEl.srcObject = localVideoStream;

        videoPeerConnection = createVideoPeerConnection();
        localVideoStream.getTracks().forEach(t =>
            videoPeerConnection.addTrack(t, localVideoStream)
        );

        const offer = await videoPeerConnection.createOffer({
            offerToReceiveAudio: true, offerToReceiveVideo: true
        });
        await videoPeerConnection.setLocalDescription(offer);

        socket.emit('video-call-initiate', {
            from: getMe(), to: recipientUsername, offer
        });

        showVideoCallUI(recipientUsername);
        if (videoStatusEl) videoStatusEl.textContent = 'Calling…';
        startVideoDurationTimer();

    } catch (err) {
        console.error('[VIDEO-CALL] initiateVideoCall error:', err);
        alert('Camera/mic error: ' + err.message);
        cleanupVideoCall();
    }
}

/* ════════════════════════════════════════════════════════
   INCOMING VIDEO CALL
════════════════════════════════════════════════════════ */
function handleIncomingVideoCall(data) {
    console.log('[VIDEO-CALL] Incoming from:', data.from);
    videoCallPartner = data.from;
    pendingVideoOffer = data.offer;
    const el = document.getElementById('incoming-video-caller-name');
    if (el) el.textContent = data.from;
    if (incomingVideoModal) incomingVideoModal.style.display = 'flex';
}

/* ════════════════════════════════════════════════════════
   REJECT VIDEO CALL
════════════════════════════════════════════════════════ */
function rejectVideoCall() {
    if (videoCallPartner) {
        getSocket().emit('video-call-reject', { from: getMe(), to: videoCallPartner });
    }
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';
    pendingVideoOffer = null;
    videoCallPartner  = null;
}

/* ════════════════════════════════════════════════════════
   ACCEPT VIDEO CALL
════════════════════════════════════════════════════════ */
async function acceptVideoCall() {
    if (!pendingVideoOffer) return;
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';

    try {
        localVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: {ideal:1280}, height: {ideal:720} },
            audio: true
        });

        if (localVideoEl) localVideoEl.srcObject = localVideoStream;

        videoPeerConnection = createVideoPeerConnection();
        localVideoStream.getTracks().forEach(t =>
            videoPeerConnection.addTrack(t, localVideoStream)
        );

        await videoPeerConnection.setRemoteDescription(
            new RTCSessionDescription(pendingVideoOffer)
        );
        const answer = await videoPeerConnection.createAnswer({
            offerToReceiveAudio: true, offerToReceiveVideo: true
        });
        await videoPeerConnection.setLocalDescription(answer);

        getSocket().emit('video-call-answer', {
            from: getMe(), to: videoCallPartner, answer
        });

        pendingVideoOffer = null;

        showVideoCallUI(videoCallPartner);
        if (videoStatusEl) videoStatusEl.textContent = 'Connected';
        videoCallStartTime = Date.now();
        startVideoDurationTimer();

    } catch (err) {
        console.error('[VIDEO-CALL] acceptVideoCall error:', err);
        alert('Error accepting video call: ' + err.message);
        cleanupVideoCall();
    }
}

/* ════════════════════════════════════════════════════════
   HANDLE ANSWER
════════════════════════════════════════════════════════ */
async function handleVideoCallAnswer(data) {
    if (!videoPeerConnection) return;
    try {
        await videoPeerConnection.setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
        if (videoStatusEl) videoStatusEl.textContent = 'Connected';
        videoCallStartTime = Date.now();
    } catch (err) {
        console.error('[VIDEO-CALL] handleVideoCallAnswer error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   CREATE PEER CONNECTION
════════════════════════════════════════════════════════ */
function createVideoPeerConnection() {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc.onicecandidate = e => {
        if (e.candidate && videoCallPartner) {
            getSocket().emit('video-call-ice', {
                from: getMe(), to: videoCallPartner, candidate: e.candidate
            });
        }
    };

    pc.ontrack = e => {
        const kind = e.track.kind;
        console.log('[VIDEO-CALL] Remote track received:', kind);

        if (kind === 'video') {
            if (!remoteVideoStream) remoteVideoStream = new MediaStream();
            remoteVideoStream.addTrack(e.track);
            if (remoteVideoEl) remoteVideoEl.srcObject = remoteVideoStream;
        } else if (kind === 'audio') {
            if (!remoteAudioStream) remoteAudioStream = new MediaStream();
            remoteAudioStream.addTrack(e.track);
            if (remoteAudioVideoEl) {
                remoteAudioVideoEl.srcObject = remoteAudioStream;
                remoteAudioVideoEl.play().catch(() => {});
            }
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('[VIDEO-CALL] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            endVideoCall();
        }
    };

    return pc;
}

/* ════════════════════════════════════════════════════════
   HANDLE ICE
════════════════════════════════════════════════════════ */
async function handleVideoCallIce(data) {
    if (!videoPeerConnection) return;
    try {
        if (videoPeerConnection.remoteDescription) {
            await videoPeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) {
        console.warn('[VIDEO-CALL] ICE error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   END VIDEO CALL
════════════════════════════════════════════════════════ */
function endVideoCall() {
    if (videoCallPartner) {
        getSocket().emit('video-call-end', { from: getMe(), to: videoCallPartner });
    }

    // Log call
    if (videoCallPartner && videoCallStartTime && window.logCall) {
        const duration = Math.floor((Date.now() - videoCallStartTime) / 1000);
        window.logCall({ type: 'video', partner: videoCallPartner, duration, timestamp: videoCallStartTime });
    }

    cleanupVideoCall();
}

function handleVideoCallEnd() {
    console.log('[VIDEO-CALL] Call ended by peer');
    cleanupVideoCall();
}

/* ════════════════════════════════════════════════════════
   CLEANUP
════════════════════════════════════════════════════════ */
function cleanupVideoCall() {
    // Stop tracks
    [localVideoStream, localScreenStream, remoteVideoStream, remoteAudioStream].forEach(stream => {
        if (stream) stream.getTracks().forEach(t => t.stop());
    });
    localVideoStream = localScreenStream = remoteVideoStream = remoteAudioStream = null;

    // Close peer connection
    if (videoPeerConnection) { videoPeerConnection.close(); videoPeerConnection = null; }

    // Clear elements
    if (localVideoEl)       localVideoEl.srcObject   = null;
    if (remoteVideoEl)      remoteVideoEl.srcObject  = null;
    if (remoteAudioVideoEl) remoteAudioVideoEl.srcObject = null;

    // Hide modals
    if (videoCallModal)   videoCallModal.style.display   = 'none';
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';

    stopVideoDurationTimer();

    videoCallPartner   = null;
    videoCallStartTime = null;
    pendingVideoOffer  = null;
    isScreenSharing    = false;
}

/* ════════════════════════════════════════════════════════
   TOGGLE LOCAL VIDEO
════════════════════════════════════════════════════════ */
function toggleLocalVideo() {
    if (!localVideoStream) return;
    const track = localVideoStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('toggle-video-btn');
    if (btn) btn.style.opacity = track.enabled ? '1' : '0.5';
}

/* ════════════════════════════════════════════════════════
   TOGGLE LOCAL AUDIO (video call)
════════════════════════════════════════════════════════ */
function toggleVideoCallAudio() {
    if (!localVideoStream) return;
    const track = localVideoStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('toggle-audio-btn');
    if (btn) btn.style.opacity = track.enabled ? '1' : '0.5';
}

/* ════════════════════════════════════════════════════════
   SCREEN SHARE
════════════════════════════════════════════════════════ */
async function toggleScreenShare() {
    if (!videoPeerConnection) return;
    const btn = document.getElementById('share-screen-btn');

    if (!isScreenSharing) {
        try {
            localScreenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {cursor:'always'}, audio: false
            });
            const screenTrack = localScreenStream.getVideoTracks()[0];
            const sender = videoPeerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(screenTrack);

            isScreenSharing = true;
            if (btn) { btn.style.background = '#22c55e'; }

            screenTrack.onended = () => toggleScreenShare();

        } catch (err) {
            if (err.name !== 'NotAllowedError') alert('Screen share error: ' + err.message);
        }
    } else {
        if (localScreenStream) { localScreenStream.getTracks().forEach(t => t.stop()); localScreenStream = null; }

        try {
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {width:{ideal:1280},height:{ideal:720}}, audio: false
            });
            const cameraTrack = cameraStream.getVideoTracks()[0];
            const sender = videoPeerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(cameraTrack);

            // Update local stream
            if (localVideoStream) {
                const old = localVideoStream.getVideoTracks()[0];
                if (old) { localVideoStream.removeTrack(old); old.stop(); }
                localVideoStream.addTrack(cameraTrack);
                if (localVideoEl) localVideoEl.srcObject = localVideoStream;
            }
        } catch (err) {
            console.warn('[VIDEO-CALL] Could not re-acquire camera:', err);
        }

        isScreenSharing = false;
        if (btn) btn.style.background = '';
    }
}

/* ════════════════════════════════════════════════════════
   DURATION TIMER
════════════════════════════════════════════════════════ */
function startVideoDurationTimer() {
    stopVideoDurationTimer();
    if (!videoCallStartTime) videoCallStartTime = Date.now();
    videoDurationInterval = setInterval(() => {
        if (!videoCallStartTime || !videoDurationEl) return;
        const s = Math.floor((Date.now() - videoCallStartTime) / 1000);
        videoDurationEl.textContent =
            String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
    }, 1000);
}

function stopVideoDurationTimer() {
    clearInterval(videoDurationInterval);
    videoDurationInterval = null;
}

/* ════════════════════════════════════════════════════════
   UI
════════════════════════════════════════════════════════ */
function showVideoCallUI(username) {
    const peerNameEl = document.getElementById('video-call-peer-name');
    if (peerNameEl) peerNameEl.textContent = username;
    if (videoDurationEl) videoDurationEl.textContent = '00:00';
    if (videoCallModal) videoCallModal.style.display = 'flex';
}

/* ════════════════════════════════════════════════════════
   BUTTON WIRING
════════════════════════════════════════════════════════ */
(function wireVideoButtons() {
    const wire = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };
    wire('accept-video-call-btn', () => acceptVideoCall());
    wire('reject-video-call-btn', () => rejectVideoCall());
    wire('video-end-btn',         () => endVideoCall());
    wire('toggle-audio-btn',      () => toggleVideoCallAudio());
    wire('toggle-video-btn',      () => toggleLocalVideo());
    wire('share-screen-btn',      () => toggleScreenShare());
})();

/* ════════════════════════════════════════════════════════
   EXPORTS
════════════════════════════════════════════════════════ */
window.initiateVideoCall      = initiateVideoCall;
window.acceptVideoCall        = acceptVideoCall;
window.rejectVideoCall        = rejectVideoCall;
window.endVideoCall           = endVideoCall;
window.cleanupVideoCall       = cleanupVideoCall;
window.toggleLocalVideo       = toggleLocalVideo;
window.toggleVideoCallAudio   = toggleVideoCallAudio;
window.toggleScreenShare      = toggleScreenShare;
window.handleIncomingVideoCall = handleIncomingVideoCall;
window.handleVideoCallAnswer  = handleVideoCallAnswer;
window.handleVideoCallIce     = handleVideoCallIce;
window.handleVideoCallEnd     = handleVideoCallEnd;

console.log('[VIDEO-CALL] ✓ Module loaded');