/**
 * video-call.js — NexChat Video Call Module
 * WebRTC P2P video calling with Socket.IO signaling
 */

console.log('[VIDEO-CALL] Module loading...');

/* ─── state ─────────────────────────────────────────── */
var videoPc            = null;
var videoLocalStream   = null;
var videoScreenStream  = null;
var videoRemoteStream  = null;
var videoRemoteAudio   = null;
var videoPartner       = null;
var videoCallStartTime = null;
var videoDurationInt   = null;
var videoPendingOffer  = null;
var videoIsSharing     = false;

/* ─── DOM ────────────────────────────────────────────── */
var videoCallModal       = document.getElementById('video-call-modal');
var incomingVideoModal   = document.getElementById('incoming-video-call-modal');
var localVideoEl         = document.getElementById('local-video');
var remoteVideoEl        = document.getElementById('remote-video');
var remoteAudioVideoEl   = document.getElementById('remote-audio-video');
var videoDurationEl      = document.getElementById('video-call-duration');
var videoStatusEl        = document.getElementById('video-call-status');

/* ─── ICE ────────────────────────────────────────────── */
var VIDEO_ICE_CONFIG = {
    iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
};

/* ════════════════════════════════════════════════════════
   INITIATE CALL
════════════════════════════════════════════════════════ */
async function initiateVideoCall(username) {
    if (videoPc) { alert('Already in a video call.'); return; }
    if (!socket || !socket.connected) { alert('Not connected to server.'); return; }

    videoPartner = username;

    try {
        videoLocalStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });
        if (localVideoEl) localVideoEl.srcObject = videoLocalStream;

        videoPc = createVideoPeerConnection();
        videoLocalStream.getTracks().forEach(function(t) { videoPc.addTrack(t, videoLocalStream); });

        var offer = await videoPc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await videoPc.setLocalDescription(offer);
        socket.emit('video-call-initiate', { from: currentUsername, to: username, offer: offer });

        showVideoCallUI(username);
        if (videoStatusEl) videoStatusEl.textContent = 'Calling…';
        videoCallStartTime = Date.now();
        startVideoCallTimer();

    } catch (err) {
        console.error('[VIDEO-CALL] initiate error:', err);
        alert('Camera/mic error: ' + err.message);
        cleanupVideoCall();
    }
}

/* ════════════════════════════════════════════════════════
   INCOMING CALL
════════════════════════════════════════════════════════ */
function handleIncomingVideoCall(data) {
    console.log('[VIDEO-CALL] Incoming call from:', data.from);
    videoPartner     = data.from;
    videoPendingOffer = data.offer;

    var el = document.getElementById('incoming-video-caller-name');
    if (el) el.textContent = data.from;
    if (incomingVideoModal) incomingVideoModal.style.display = 'flex';
}

/* ════════════════════════════════════════════════════════
   ACCEPT CALL
════════════════════════════════════════════════════════ */
async function acceptVideoCall() {
    if (!videoPendingOffer) return;
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';

    try {
        videoLocalStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });
        if (localVideoEl) localVideoEl.srcObject = videoLocalStream;

        videoPc = createVideoPeerConnection();
        videoLocalStream.getTracks().forEach(function(t) { videoPc.addTrack(t, videoLocalStream); });

        await videoPc.setRemoteDescription(new RTCSessionDescription(videoPendingOffer));
        var answer = await videoPc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await videoPc.setLocalDescription(answer);
        socket.emit('video-call-answer', { from: currentUsername, to: videoPartner, answer: answer });

        videoPendingOffer = null;
        showVideoCallUI(videoPartner);
        if (videoStatusEl) videoStatusEl.textContent = 'Connected';
        videoCallStartTime = Date.now();
        startVideoCallTimer();

    } catch (err) {
        console.error('[VIDEO-CALL] accept error:', err);
        alert('Error accepting call: ' + err.message);
        cleanupVideoCall();
    }
}

/* ════════════════════════════════════════════════════════
   REJECT CALL
════════════════════════════════════════════════════════ */
function rejectVideoCall() {
    if (videoPartner) {
        socket.emit('video-call-reject', { from: currentUsername, to: videoPartner });
    }
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';
    videoPendingOffer = null;
    videoPartner = null;
}

/* ════════════════════════════════════════════════════════
   HANDLE ANSWER
════════════════════════════════════════════════════════ */
async function handleVideoCallAnswer(data) {
    if (!videoPc) return;
    try {
        await videoPc.setRemoteDescription(new RTCSessionDescription(data.answer));
        if (videoStatusEl) videoStatusEl.textContent = 'Connected';
        if (!videoCallStartTime) videoCallStartTime = Date.now();
    } catch (err) {
        console.error('[VIDEO-CALL] handle answer error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   HANDLE ICE
════════════════════════════════════════════════════════ */
async function handleVideoCallIce(data) {
    if (!videoPc) return;
    try {
        if (videoPc.remoteDescription) {
            await videoPc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) {
        console.warn('[VIDEO-CALL] ICE error:', err);
    }
}

/* ════════════════════════════════════════════════════════
   END CALL
════════════════════════════════════════════════════════ */
function endVideoCall() {
    if (videoPartner) {
        socket.emit('video-call-end', { from: currentUsername, to: videoPartner });
    }
    if (videoPartner && videoCallStartTime && typeof logCall === 'function') {
        var duration = Math.floor((Date.now() - videoCallStartTime) / 1000);
        logCall({ type: 'video', partner: videoPartner, duration: duration, timestamp: videoCallStartTime });
    }
    cleanupVideoCall();
}

function handleVideoCallEnd() {
    console.log('[VIDEO-CALL] Ended by peer');
    cleanupVideoCall();
}

/* ════════════════════════════════════════════════════════
   PEER CONNECTION
════════════════════════════════════════════════════════ */
function createVideoPeerConnection() {
    var pc = new RTCPeerConnection(VIDEO_ICE_CONFIG);

    pc.onicecandidate = function(e) {
        if (e.candidate && videoPartner) {
            socket.emit('video-call-ice', { from: currentUsername, to: videoPartner, candidate: e.candidate });
        }
    };

    pc.ontrack = function(e) {
        var kind = e.track.kind;
        if (kind === 'video') {
            if (!videoRemoteStream) videoRemoteStream = new MediaStream();
            // Remove old video tracks before adding new one (handles screen share switching)
            videoRemoteStream.getVideoTracks().forEach(function(t) { videoRemoteStream.removeTrack(t); });
            videoRemoteStream.addTrack(e.track);
            if (remoteVideoEl) remoteVideoEl.srcObject = videoRemoteStream;
        } else if (kind === 'audio') {
            if (!videoRemoteAudio) videoRemoteAudio = new MediaStream();
            videoRemoteAudio.addTrack(e.track);
            if (remoteAudioVideoEl) {
                remoteAudioVideoEl.srcObject = videoRemoteAudio;
                remoteAudioVideoEl.play().catch(function() {});
            }
        }
    };

    pc.onconnectionstatechange = function() {
        console.log('[VIDEO-CALL] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            endVideoCall();
        }
    };

    return pc;
}

/* ════════════════════════════════════════════════════════
   CONTROLS
════════════════════════════════════════════════════════ */
function toggleLocalVideo() {
    if (!videoLocalStream) return;
    var track = videoLocalStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    var btn = document.getElementById('toggle-video-btn');
    if (btn) btn.style.opacity = track.enabled ? '1' : '0.5';
}

function toggleVideoCallAudio() {
    if (!videoLocalStream) return;
    var track = videoLocalStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    var btn = document.getElementById('toggle-audio-btn');
    if (btn) btn.style.opacity = track.enabled ? '1' : '0.5';
}

async function toggleScreenShare() {
    if (!videoPc) return;
    var btn = document.getElementById('share-screen-btn');

    if (!videoIsSharing) {
        try {
            videoScreenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' }, audio: false
            });
            var screenTrack = videoScreenStream.getVideoTracks()[0];
            var sender = videoPc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
            if (sender) await sender.replaceTrack(screenTrack);

            videoIsSharing = true;
            if (btn) { btn.style.background = '#22c55e'; btn.textContent = '📺 Stop'; }

            screenTrack.onended = function() {
                if (videoIsSharing) toggleScreenShare();
            };
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                console.error('[VIDEO-CALL] screen share error:', err);
                alert('Screen share error: ' + err.message);
            }
        }
    } else {
        if (videoScreenStream) {
            videoScreenStream.getTracks().forEach(function(t) { t.stop(); });
            videoScreenStream = null;
        }
        try {
            var camStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
            });
            var camTrack = camStream.getVideoTracks()[0];
            var sender2 = videoPc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
            if (sender2) await sender2.replaceTrack(camTrack);

            if (videoLocalStream) {
                var oldTrack = videoLocalStream.getVideoTracks()[0];
                if (oldTrack) { videoLocalStream.removeTrack(oldTrack); oldTrack.stop(); }
                videoLocalStream.addTrack(camTrack);
            }
            if (localVideoEl && videoLocalStream) localVideoEl.srcObject = videoLocalStream;
        } catch (err) {
            console.warn('[VIDEO-CALL] re-acquire camera:', err);
        }

        videoIsSharing = false;
        if (btn) { btn.style.background = ''; btn.textContent = '📺'; }
    }
}

/* ════════════════════════════════════════════════════════
   TIMER
════════════════════════════════════════════════════════ */
function startVideoCallTimer() {
    stopVideoCallTimer();
    if (!videoCallStartTime) videoCallStartTime = Date.now();
    videoDurationInt = setInterval(function() {
        if (!videoCallStartTime || !videoDurationEl) return;
        var s = Math.floor((Date.now() - videoCallStartTime) / 1000);
        videoDurationEl.textContent =
            String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
}

function stopVideoCallTimer() {
    clearInterval(videoDurationInt);
    videoDurationInt = null;
}

/* ════════════════════════════════════════════════════════
   UI
════════════════════════════════════════════════════════ */
function showVideoCallUI(username) {
    var el = document.getElementById('video-call-peer-name');
    if (el) el.textContent = username;
    if (videoDurationEl) videoDurationEl.textContent = '00:00';
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';
    if (videoCallModal) videoCallModal.style.display = 'flex';
}

/* ════════════════════════════════════════════════════════
   CLEANUP
════════════════════════════════════════════════════════ */
function cleanupVideoCall() {
    stopVideoCallTimer();

    [videoLocalStream, videoScreenStream, videoRemoteStream, videoRemoteAudio].forEach(function(s) {
        if (s) s.getTracks().forEach(function(t) { t.stop(); });
    });
    videoLocalStream = videoScreenStream = videoRemoteStream = videoRemoteAudio = null;

    if (videoPc) { videoPc.close(); videoPc = null; }
    if (localVideoEl)       localVideoEl.srcObject       = null;
    if (remoteVideoEl)      remoteVideoEl.srcObject      = null;
    if (remoteAudioVideoEl) remoteAudioVideoEl.srcObject = null;
    if (videoCallModal)     videoCallModal.style.display     = 'none';
    if (incomingVideoModal) incomingVideoModal.style.display = 'none';

    var shareBtn = document.getElementById('share-screen-btn');
    if (shareBtn) { shareBtn.style.background = ''; shareBtn.textContent = '📺'; }

    videoPartner       = null;
    videoCallStartTime = null;
    videoPendingOffer  = null;
    videoIsSharing     = false;
}

/* ════════════════════════════════════════════════════════
   BUTTON WIRING
════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
    function wire(id, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }
    wire('accept-video-call-btn', function() { acceptVideoCall(); });
    wire('reject-video-call-btn', function() { rejectVideoCall(); });
    wire('video-end-btn',         function() { endVideoCall(); });
    wire('toggle-audio-btn',      function() { toggleVideoCallAudio(); });
    wire('toggle-video-btn',      function() { toggleLocalVideo(); });
    wire('share-screen-btn',      function() { toggleScreenShare(); });
});

/* ════════════════════════════════════════════════════════
   EXPORTS
════════════════════════════════════════════════════════ */
window.initiateVideoCall       = initiateVideoCall;
window.handleIncomingVideoCall = handleIncomingVideoCall;
window.handleVideoCallAnswer   = handleVideoCallAnswer;
window.handleVideoCallIce      = handleVideoCallIce;
window.handleVideoCallEnd      = handleVideoCallEnd;
window.cleanupVideoCall        = cleanupVideoCall;
window.acceptVideoCall         = acceptVideoCall;
window.rejectVideoCall         = rejectVideoCall;
window.endVideoCall            = endVideoCall;

console.log('[VIDEO-CALL] ✓ Module loaded');