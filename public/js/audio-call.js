/**
 * Audio Call Module
 * Handles WebRTC peer-to-peer audio calls using Socket.IO signaling
 */

console.log('[AUDIO-CALL-MODULE] Loading...');

// Helper to get socket safely
function getSocket() {
    return window.socket;
}

// Global state
let peerConnection = null;
let localStream = null;
let callInProgress = false;
let callPartner = null; // Jo user ke saath call hai
let incomingCallFrom = null;
let callStartTime = null;
let callDurationInterval = null;

// Get DOM elements
let callModal = document.getElementById('call-modal');
let incomingCallModal = document.getElementById('incoming-call-modal');
let callStatusEl = document.getElementById('call-status');
let incomingCallerNameEl = document.getElementById('incoming-caller-name');
let callDurationEl = document.getElementById('call-duration');
let localAudioEl = document.getElementById('local-audio');
let remoteAudioEl = document.getElementById('remote-audio');

// ICE servers
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

/**
 * Initialize audio call - called when user clicks call button
 */
async function initiateAudioCall(recipientUsername) {
    if (callInProgress) {
        alert('Call already in progress');
        return;
    }
    
    const socket = window.socket;
    if (!socket || !socket.connected) {
        alert('Socket not connected. Please wait and try again.');
        return;
    }

    callPartner = recipientUsername; // Track call partner

    try {
        // Get user's microphone
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false 
        });

        // Show call UI
        showCallUI();
        callStatusEl.textContent = 'Connecting...';
        const callPeerNameEl = document.querySelector('.call-peer-name');
        if (callPeerNameEl) {
            callPeerNameEl.textContent = recipientUsername;
        }

        // Create peer connection
        createPeerConnection();

        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Create and send offer
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
        });

        await peerConnection.setLocalDescription(offer);

        console.log('[CALL] Initiating call to:', recipientUsername);
        getSocket().emit('call-initiate', {
            to: recipientUsername,
            offer: offer
        });

        callStatusEl.textContent = 'Calling ' + recipientUsername + '...';
    } catch (err) {
        console.error('Error initiating call:', err);
        alert('Error accessing microphone: ' + err.message);
        endCall();
    }
}

/**
 * Handle incoming call
 */
async function handleIncomingCall(fromUsername, offer) {
    console.log('[CALL] Incoming call from:', fromUsername);
    
    if (callInProgress) {
        console.log('[CALL] Call already in progress, rejecting...');
        getSocket().emit('call-reject', { to: fromUsername });
        return;
    }

    incomingCallFrom = fromUsername;
    callPartner = fromUsername;
    incomingCallerNameEl.textContent = fromUsername;
    showIncomingCallUI();

    try {
        // Store offer for later use
        window.pendingOffer = offer;
    } catch (err) {
        console.error('Error handling incoming call:', err);
    }
}

/**
 * Accept incoming call
 */
async function acceptCall() {
    try {
        if (!incomingCallFrom || !window.pendingOffer) return;

        console.log('[CALL] Accepting call from:', incomingCallFrom);

        // Get user's microphone
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false 
        });

        // Create peer connection
        createPeerConnection();

        // Add local stream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Set remote description from offer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.pendingOffer));

        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        getSocket().emit('call-answer', {
            to: incomingCallFrom,
            answer: answer
        });

        callInProgress = true;
        callPartner = incomingCallFrom;
        callStartTime = Date.now();
        hideIncomingCallUI();
        showCallUI();
        
        const callPeerNameEl = document.querySelector('.call-peer-name');
        if (callPeerNameEl) {
            callPeerNameEl.textContent = incomingCallFrom;
        }
        
        callStatusEl.textContent = 'Call connected';
        startCallDuration();

        // Clear pending offer
        delete window.pendingOffer;
    } catch (err) {
        console.error('Error accepting call:', err);
        alert('Error accepting call: ' + err.message);
        rejectCall();
    }
}

/**
 * Reject incoming call
 */
function rejectCall() {
    if (incomingCallFrom) {
        console.log('[CALL] Rejecting call from:', incomingCallFrom);
        
        // Log missed call
        if (window.logCall) {
            const me = currentUsername || (typeof nameInputEl !== 'undefined' ? nameInputEl.textContent : 'Unknown');
            window.logCall({
                type: 'audio',
                with: incomingCallFrom,
                duration: 0,
                status: 'missed',
                initiator: incomingCallFrom,
                receiver: me
            });
        }
        
        getSocket().emit('call-reject', { to: incomingCallFrom });
        incomingCallFrom = null;
    }
    hideIncomingCallUI();
    delete window.pendingOffer;
}

/**
 * Handle answer to our call
 */
async function handleCallAnswer(fromUsername, answer) {
    try {
        console.log('[CALL] Call answer received from:', fromUsername);
        if (!peerConnection) return;

        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        callInProgress = true;
        callPartner = fromUsername;
        callStatusEl.textContent = 'Call connected';
        callStartTime = Date.now();
        startCallDuration();
    } catch (err) {
        console.error('Error handling answer:', err);
    }
}

/**
 * Handle ICE candidates
 */
async function handleIceCandidate(fromUsername, candidate) {
    try {
        if (!peerConnection) return;
        
        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error adding ice candidate:', err);
    }
}

/**
 * Create peer connection
 */
function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(iceServers);

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && callPartner && getSocket()) {
                getSocket().emit('ice-candidate', {
                    to: callPartner,
                    candidate: event.candidate
                });
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('[CALL] Remote track received:', event.track.kind);
            if (remoteAudioEl && event.streams[0]) {
                remoteAudioEl.srcObject = event.streams[0];
                remoteAudioEl.play().catch(e => console.log('Audio play error:', e));
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log('[CALL] Connection state:', peerConnection.connectionState);
            
            if (peerConnection.connectionState === 'failed' || 
                peerConnection.connectionState === 'disconnected') {
                endCall();
            }
        };

        // Handle ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            console.log('[CALL] ICE connection state:', peerConnection.iceConnectionState);
            
            if (peerConnection.iceConnectionState === 'failed') {
                console.error('[CALL] ICE connection failed');
                endCall();
            }
        };
    } catch (err) {
        console.error('Error creating peer connection:', err);
    }
}

/**
 * End call
 */
function endCall() {
    console.log('[CALL] Ending call with:', callPartner);
    
    // Calculate call duration
    let duration = 0;
    if (callStartTime) {
        duration = Math.floor((Date.now() - callStartTime) / 1000);
        console.log('[CALL] Call duration:', duration, 'seconds');
    }
    
    // Log the call
    if (callPartner && window.logCall) {
        const me = currentUsername || (typeof nameInputEl !== 'undefined' ? nameInputEl.textContent : 'Unknown');
        window.logCall({
            type: 'audio',
            with: callPartner,
            duration: duration,
            status: 'completed',
            initiator: me,
            receiver: callPartner
        });
    }
    
    callInProgress = false;
    incomingCallFrom = null;
    callStartTime = null;
    
    // Stop call duration timer
    if (callDurationInterval) {
        clearInterval(callDurationInterval);
        callDurationInterval = null;
    }

    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Clear audio elements
    if (localAudioEl) localAudioEl.srcObject = null;
    if (remoteAudioEl) remoteAudioEl.srcObject = null;

    // Hide call UI
    hideCallUI();
    hideIncomingCallUI();

    // Notify other user
    if (callPartner && getSocket()) {
        getSocket().emit('call-end', { to: callPartner });
    }

    callPartner = null;
    delete window.pendingOffer;
}

/**
 * Handle call rejection
 */
function handleCallRejection(fromUsername) {
    console.log('[CALL] Call rejected by:', fromUsername);
    if (callStatusEl) {
        callStatusEl.textContent = 'Call rejected by ' + fromUsername;
    }
    setTimeout(() => {
        endCall();
    }, 1500);
}

/**
 * Handle call end from other user
 */
function handleCallEnd() {
    console.log('[CALL] Call ended by other user');
    if (callStatusEl) {
        callStatusEl.textContent = 'Call ended';
    }
    setTimeout(() => {
        endCall();
    }, 500);
}

/**
 * Start call duration timer
 */
function startCallDuration() {
    callStartTime = Date.now();
    callDurationInterval = setInterval(() => {
        if (callDurationEl) {
            const duration = Math.floor((Date.now() - callStartTime) / 1000);
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            callDurationEl.textContent = 
                (mins < 10 ? '0' + mins : mins) + ':' + 
                (secs < 10 ? '0' + secs : secs);
        }
    }, 1000);
}

/**
 * Show call UI
 */
function showCallUI() {
    console.log('[CALL] Showing call UI');
    if (callModal) {
        callModal.style.display = 'flex';
        if (callStatusEl) callStatusEl.textContent = 'Initializing...';
        if (callDurationEl) callDurationEl.textContent = '00:00';
    }
}

/**
 * Hide call UI
 */
function hideCallUI() {
    console.log('[CALL] Hiding call UI');
    if (callModal) {
        callModal.style.display = 'none';
    }
}

/**
 * Show incoming call UI
 */
function showIncomingCallUI() {
    console.log('[CALL] Showing incoming call UI');
    if (incomingCallModal) {
        incomingCallModal.style.display = 'flex';
        // Play ringtone
        playRingtone();
    }
}

/**
 * Hide incoming call UI
 */
function hideIncomingCallUI() {
    console.log('[CALL] Hiding incoming call UI');
    if (incomingCallModal) {
        incomingCallModal.style.display = 'none';
        stopRingtone();
    }
}

/**
 * Play ringtone sound
 */
function playRingtone() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 440; // A4 note
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        // Repeat ringtone
        window.ringtoneTimeout = setTimeout(playRingtone, 600);
    } catch (err) {
        console.log('Error playing ringtone:', err);
    }
}

/**
 * Stop ringtone
 */
function stopRingtone() {
    if (window.ringtoneTimeout) {
        clearTimeout(window.ringtoneTimeout);
        window.ringtoneTimeout = null;
    }
}

/**
 * Toggle local audio mute
 */
function toggleLocalAudio() {
    if (!localStream) {
        console.log('[CALL] No active call to toggle audio');
        return;
    }
    
    const audioTracks = localStream.getAudioTracks();
    const isCurrentlyMuted = audioTracks.some(track => !track.enabled);
    
    audioTracks.forEach(track => {
        track.enabled = isCurrentlyMuted; // Toggle: if muted, enable; if enabled, mute
    });
    
    const muteBtn = document.getElementById('mute-audio-btn');
    if (muteBtn) {
        if (isCurrentlyMuted) {
            muteBtn.style.opacity = '1';
            muteBtn.title = 'Mute audio';
            muteBtn.textContent = '🎤';
        } else {
            muteBtn.style.opacity = '0.5';
            muteBtn.title = 'Unmute audio';
            muteBtn.textContent = '🔇';
        }
    }
    
    console.log('[CALL] Audio', isCurrentlyMuted ? 'enabled' : 'muted');
}

// Export functions for global use
console.log('[AUDIO-CALL-MODULE] Exporting functions...');
window.initiateAudioCall = initiateAudioCall;
window.acceptCall = acceptCall;
window.rejectCall = rejectCall;
window.endCall = endCall;
window.toggleLocalAudio = toggleLocalAudio;
console.log('[AUDIO-CALL-MODULE] ✓ Loaded successfully');
