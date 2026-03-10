// ═════════════════════════════════════════════════════════════════
// VIDEO CALL MODULE - Fresh Implementation
// ═════════════════════════════════════════════════════════════════

console.log('[VIDEO-CALL] Module loading...');

let videoPeerConnection = null;
let videoCallPartner = null;
let videoCallStartTime = null;
let localVideoStream = null;
let localScreenStream = null;
let isScreenSharing = false;

const videoCallModal = document.getElementById('video-call-modal');
const incomingVideoCallModal = document.getElementById('incoming-video-call-modal');
const localVideoEl = document.getElementById('local-video');
const remoteVideoEl = document.getElementById('remote-video');
const videoDurationEl = document.getElementById('video-call-duration');
const videoStatusEl = document.getElementById('video-call-status');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const shareScreenBtn = document.getElementById('share-screen-btn');

let pendingVideoOffer = null;

// Helper to safely get socket
function getSocket() {
    return window.socket;
}

// ═════════════════════════════════════════════════════════════════
// INITIATE VIDEO CALL
// ═════════════════════════════════════════════════════════════════
async function initiateVideoCall(recipientUsername) {
    console.log('[VIDEO-CALL] Initiating video call with:', recipientUsername);
    
    if (videoPeerConnection) {
        alert('Already in a call');
        return;
    }

    videoCallPartner = recipientUsername;
    
    try {
        // Get camera permission
        localVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { min: 640, ideal: 1280, max: 1920 }, height: { min: 480, ideal: 720, max: 1080 } },
            audio: true
        });

        console.log('[VIDEO-CALL] Got local stream:', localVideoStream.id);
        console.log('[VIDEO-CALL] Video tracks:', localVideoStream.getVideoTracks().length);
        console.log('[VIDEO-CALL] Audio tracks:', localVideoStream.getAudioTracks().length);

        // Show local video
        if (localVideoEl) {
            console.log('[VIDEO-CALL] Setting local video element srcObject');
            localVideoEl.srcObject = localVideoStream;
        } else {
            console.error('[VIDEO-CALL] Local video element not found');
        }

        // Create peer connection
        videoPeerConnection = createVideoPeerConnection();

        // Add tracks to connection
        localVideoStream.getTracks().forEach(track => {
            console.log('[VIDEO-CALL] Adding track to peer connection:', track.kind, track.id);
            videoPeerConnection.addTrack(track, localVideoStream);
        });

        // Create offer
        const offer = await videoPeerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        await videoPeerConnection.setLocalDescription(offer);

        // Send offer to peer
        getSocket().emit('video-call-initiate', {
            from: currentUsername,
            to: recipientUsername,
            offer: offer
        });

        // Show video call modal
        videoCallModal.style.display = 'flex';
        const peerNameEl = document.getElementById('video-call-peer-name');
        if (peerNameEl) {
            peerNameEl.textContent = recipientUsername;
        }
        videoStatusEl.textContent = 'Calling...';
        videoCallStartTime = Date.now();

        // Start duration timer
        startVideoDurationTimer();

    } catch(err) {
        console.error('[VIDEO-CALL] Error initiating call:', err);
        alert('Error accessing camera: ' + err.message);
        cleanupVideoCall();
    }
}

// ═════════════════════════════════════════════════════════════════
// HANDLE INCOMING VIDEO CALL
// ═════════════════════════════════════════════════════════════════
async function handleIncomingVideoCall(data) {
    console.log('[VIDEO-CALL] Incoming video call from:', data.from);
    
    videoCallPartner = data.from;
    pendingVideoOffer = data.offer;

    // Show incoming call modal
    document.getElementById('incoming-video-caller-name').textContent = data.from;
    incomingVideoCallModal.style.display = 'flex';
}

// ═════════════════════════════════════════════════════════════════
// REJECT VIDEO CALL
// ═════════════════════════════════════════════════════════════════
function rejectVideoCall() {
    console.log('[VIDEO-CALL] Rejecting video call from:', videoCallPartner);
    
    if (videoCallPartner) {
        getSocket().emit('video-call-reject', {
            from: currentUsername,
            to: videoCallPartner
        });
    }

    incomingVideoCallModal.style.display = 'none';
    pendingVideoOffer = null;
    videoCallPartner = null;
}

// ═════════════════════════════════════════════════════════════════
// ACCEPT VIDEO CALL
// ═════════════════════════════════════════════════════════════════
async function acceptVideoCall() {
    console.log('[VIDEO-CALL] Accepting video call from:', videoCallPartner);
    
    incomingVideoCallModal.style.display = 'none';

    if (!pendingVideoOffer) {
        alert('No pending offer');
        return;
    }

    try {
        // Get camera permission
        localVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { min: 640, ideal: 1280, max: 1920 }, height: { min: 480, ideal: 720, max: 1080 } },
            audio: true
        });

        console.log('[VIDEO-CALL] Got local stream:', localVideoStream.id);
        console.log('[VIDEO-CALL] Video tracks:', localVideoStream.getVideoTracks().length);
        console.log('[VIDEO-CALL] Audio tracks:', localVideoStream.getAudioTracks().length);

        // Show local video
        if (localVideoEl) {
            console.log('[VIDEO-CALL] Setting local video element srcObject');
            localVideoEl.srcObject = localVideoStream;
        } else {
            console.error('[VIDEO-CALL] Local video element not found');
        }

        // Create peer connection
        videoPeerConnection = createVideoPeerConnection();

        // Add tracks
        localVideoStream.getTracks().forEach(track => {
            console.log('[VIDEO-CALL] Adding track to peer connection:', track.kind, track.id);
            videoPeerConnection.addTrack(track, localVideoStream);
        });

        // Set remote description
        await videoPeerConnection.setRemoteDescription(new RTCSessionDescription(pendingVideoOffer));

        // Create answer
        const answer = await videoPeerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        await videoPeerConnection.setLocalDescription(answer);

        // Send answer
        getSocket().emit('video-call-answer', {
            from: currentUsername,
            to: videoCallPartner,
            answer: answer
        });

        // Show video call modal
        videoCallModal.style.display = 'flex';
        const peerNameEl = document.getElementById('video-call-peer-name');
        if (peerNameEl) {
            peerNameEl.textContent = videoCallPartner;
        }
        videoStatusEl.textContent = 'Connected';
        videoCallStartTime = Date.now();

        // Start duration timer
        startVideoDurationTimer();

        pendingVideoOffer = null;

    } catch(err) {
        console.error('[VIDEO-CALL] Error accepting call:', err);
        alert('Error accepting call: ' + err.message);
        cleanupVideoCall();
    }
}

// ═════════════════════════════════════════════════════════════════
// HANDLE VIDEO CALL ANSWER
// ═════════════════════════════════════════════════════════════════
async function handleVideoCallAnswer(data) {
    console.log('[VIDEO-CALL] Received answer from:', data.from);
    
    if (videoPeerConnection) {
        try {
            await videoPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            videoStatusEl.textContent = 'Connected';
        } catch(err) {
            console.error('[VIDEO-CALL] Error setting remote description:', err);
        }
    }
}

// ═════════════════════════════════════════════════════════════════
// CREATE VIDEO PEER CONNECTION
// ═════════════════════════════════════════════════════════════════
function createVideoPeerConnection() {
    console.log('[VIDEO-CALL] Creating peer connection');
    
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
        ]
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate && videoCallPartner) {
            console.log('[VIDEO-CALL] Sending ICE candidate');
            getSocket().emit('video-call-ice', {
                from: currentUsername,
                to: videoCallPartner,
                candidate: event.candidate
            });
        }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
        console.log('[VIDEO-CALL] Received remote track:', event.track.kind, 'Stream:', event.streams.length);
        
        if (event.track.kind === 'video') {
            if (remoteVideoEl) {
                console.log('[VIDEO-CALL] Setting remote video srcObject');
                remoteVideoEl.srcObject = event.streams[0];
            } else {
                console.error('[VIDEO-CALL] Remote video element not found');
            }
        } else if (event.track.kind === 'audio') {
            const remoteAudioEl = document.getElementById('remote-audio');
            if (remoteAudioEl) {
                console.log('[VIDEO-CALL] Setting remote audio srcObject');
                remoteAudioEl.srcObject = event.streams[0];
            } else {
                console.error('[VIDEO-CALL] Remote audio element not found');
            }
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log('[VIDEO-CALL] Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            console.log('[VIDEO-CALL] Connection lost');
            endVideoCall();
        }
    };

    return pc;
}

// ═════════════════════════════════════════════════════════════════
// HANDLE VIDEO CALL ICE
// ═════════════════════════════════════════════════════════════════
async function handleVideoCallIce(data) {
    if (videoPeerConnection) {
        try {
            await videoPeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch(err) {
            console.error('[VIDEO-CALL] Error adding ICE candidate:', err);
        }
    }
}

// ═════════════════════════════════════════════════════════════════
// END VIDEO CALL
// ═════════════════════════════════════════════════════════════════
function endVideoCall() {
    console.log('[VIDEO-CALL] Ending video call');
    
    // Log the call
    if (videoCallPartner && videoCallStartTime) {
        const duration = Math.floor((Date.now() - videoCallStartTime) / 1000);
        if (window.logCall) {
            window.logCall({
                type: 'video',
                partner: videoCallPartner,
                duration: duration,
                timestamp: Date.now()
            });
        }
    }

    // Notify peer
    if (videoCallPartner) {
        getSocket().emit('video-call-end', {
            from: currentUsername,
            to: videoCallPartner
        });
    }

    cleanupVideoCall();
}

// ═════════════════════════════════════════════════════════════════
// HANDLE VIDEO CALL END
// ═════════════════════════════════════════════════════════════════
function handleVideoCallEnd() {
    console.log('[VIDEO-CALL] Call ended by peer');
    cleanupVideoCall();
}

// ═════════════════════════════════════════════════════════════════
// CLEANUP VIDEO CALL
// ═════════════════════════════════════════════════════════════════
function cleanupVideoCall() {
    console.log('[VIDEO-CALL] Cleaning up');
    
    // Stop all tracks
    if (localVideoStream) {
        localVideoStream.getTracks().forEach(track => track.stop());
        localVideoStream = null;
    }

    if (localScreenStream) {
        localScreenStream.getTracks().forEach(track => track.stop());
        localScreenStream = null;
    }

    // Close peer connection
    if (videoPeerConnection) {
        videoPeerConnection.close();
        videoPeerConnection = null;
    }

    // Clear video elements
    if (localVideoEl) {
        localVideoEl.srcObject = null;
    }
    if (remoteVideoEl) {
        remoteVideoEl.srcObject = null;
    }
    const remoteAudioEl = document.getElementById('remote-audio');
    if (remoteAudioEl) {
        remoteAudioEl.srcObject = null;
    }

    // Hide modals
    videoCallModal.style.display = 'none';
    incomingVideoCallModal.style.display = 'none';

    // Stop duration timer
    stopVideoDurationTimer();

    // Reset state
    videoCallPartner = null;
    videoCallStartTime = null;
    isScreenSharing = false;
    pendingVideoOffer = null;
}

// ═════════════════════════════════════════════════════════════════
// TOGGLE LOCAL VIDEO
// ═════════════════════════════════════════════════════════════════
function toggleLocalVideo() {
    if (!localVideoStream) return;

    const videoTrack = localVideoStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (toggleVideoBtn) {
            toggleVideoBtn.style.opacity = videoTrack.enabled ? '1' : '0.5';
        }
        console.log('[VIDEO-CALL] Video:', videoTrack.enabled ? 'ON' : 'OFF');
    }
}

// ═════════════════════════════════════════════════════════════════
// TOGGLE LOCAL AUDIO
// ═════════════════════════════════════════════════════════════════
function toggleLocalAudio() {
    if (!localVideoStream) return;

    const audioTrack = localVideoStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        if (toggleAudioBtn) {
            toggleAudioBtn.style.opacity = audioTrack.enabled ? '1' : '0.5';
        }
        console.log('[VIDEO-CALL] Audio:', audioTrack.enabled ? 'ON' : 'OFF');
    }
}

// ═════════════════════════════════════════════════════════════════
// TOGGLE SCREEN SHARE
// ═════════════════════════════════════════════════════════════════
async function toggleScreenShare() {
    if (!videoPeerConnection) {
        console.log('[VIDEO-CALL] No active connection for screen share');
        return;
    }

    try {
        if (!isScreenSharing) {
            // Start screen share
            console.log('[VIDEO-CALL] Starting screen share');
            
            localScreenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            const screenTrack = localScreenStream.getVideoTracks()[0];

            // Get current video sender
            const sender = videoPeerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
                await sender.replaceTrack(screenTrack);
            }

            // Update UI
            isScreenSharing = true;
            if (shareScreenBtn) {
                shareScreenBtn.style.background = '#4CAF50';
                shareScreenBtn.style.color = 'white';
            }

            // Handle screen share stop
            screenTrack.onended = async () => {
                console.log('[VIDEO-CALL] Screen share stopped by user');
                await toggleScreenShare();
            };

        } else {
            // Stop screen share - switch back to camera
            console.log('[VIDEO-CALL] Stopping screen share, switching back to camera');
            
            if (localScreenStream) {
                localScreenStream.getTracks().forEach(track => track.stop());
            }

            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { min: 640, ideal: 1280, max: 1920 }, height: { min: 480, ideal: 720, max: 1080 } },
                audio: false
            });

            const cameraTrack = cameraStream.getVideoTracks()[0];
            const sender = videoPeerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
                await sender.replaceTrack(cameraTrack);
            }

            // Update video stream with camera track
            if (localVideoStream) {
                const oldVideoTrack = localVideoStream.getVideoTracks()[0];
                if (oldVideoTrack) {
                    localVideoStream.removeTrack(oldVideoTrack);
                    oldVideoTrack.stop();
                }
                localVideoStream.addTrack(cameraTrack);
            }

            // Update local video element
            if (localVideoEl) {
                localVideoEl.srcObject = localVideoStream;
            }

            // Update UI
            isScreenSharing = false;
            if (shareScreenBtn) {
                shareScreenBtn.style.background = '';
                shareScreenBtn.style.color = '';
            }
        }

    } catch(err) {
        console.error('[VIDEO-CALL] Error toggling screen share:', err);
        if (err.name !== 'NotAllowedError') {
            alert('Error: ' + err.message);
        }
    }
}

// ═════════════════════════════════════════════════════════════════
// DURATION TIMER
// ═════════════════════════════════════════════════════════════════
let videoDurationInterval = null;

function startVideoDurationTimer() {
    if (videoDurationInterval) clearInterval(videoDurationInterval);
    
    videoDurationInterval = setInterval(() => {
        if (videoCallStartTime && videoDurationEl) {
            const seconds = Math.floor((Date.now() - videoCallStartTime) / 1000);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            videoDurationEl.textContent = 
                String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        }
    }, 1000);
}

function stopVideoDurationTimer() {
    if (videoDurationInterval) {
        clearInterval(videoDurationInterval);
        videoDurationInterval = null;
    }
}

// ═════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═════════════════════════════════════════════════════════════════
console.log('[VIDEO-CALL] Exporting functions...');

window.initiateVideoCall = initiateVideoCall;
window.acceptVideoCall = acceptVideoCall;
window.rejectVideoCall = rejectVideoCall;
window.endVideoCall = endVideoCall;
window.toggleLocalVideo = toggleLocalVideo;
window.toggleLocalAudio = toggleLocalAudio;
window.toggleScreenShare = toggleScreenShare;
window.handleIncomingVideoCall = handleIncomingVideoCall;
window.handleVideoCallAnswer = handleVideoCallAnswer;
window.handleVideoCallIce = handleVideoCallIce;
window.handleVideoCallEnd = handleVideoCallEnd;

console.log('[VIDEO-CALL] ✓ Module loaded successfully');
