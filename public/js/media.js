/**
 * Media Module
 * Handles image upload and voice recording
 */

var imageBtn   = document.getElementById('image-btn');
var imageInput = document.getElementById('image-input');
var voiceBtn   = document.getElementById('voice-btn');

/** Image upload handler */
if (imageBtn) {
    imageBtn.addEventListener('click', function() {
        if (!currentChatUser) { alert('Select a user first.'); return; }
        if (imageInput) imageInput.click();
    });
}

if (imageInput) {
    imageInput.addEventListener('change', function(e) {
        if (!e.target.files || !e.target.files.length) return;
        if (!currentChatUser) { alert('Select a user first.'); return; }

        var file = e.target.files[0];
        if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB.'); imageInput.value = ''; return; }

        var reader = new FileReader();
        reader.onload = function(evt) {
            var base64 = evt.target.result;
            var msg = {
                from:    currentUsername,
                to:      currentChatUser,
                type:    'image',
                content: base64,
                time:    Date.now()
            };
            trackMsg(msg);
            socket.emit('image', { to: currentChatUser, base64: base64 });
            addImageToUI(true, msg);
            imageInput.value = '';
            resetInactivity();
        };
        reader.readAsDataURL(file);
    });
}

/** Voice recording handler */
if (voiceBtn) {
    voiceBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        if (isProcessingVoice) return;

        if (!isRecording) {
            if (!currentChatUser) { alert('Select a user first.'); return; }
            try {
                var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder  = new MediaRecorder(stream);
                recordedChunks = [];

                mediaRecorder.ondataavailable = function(evt) {
                    if (evt.data.size > 0) recordedChunks.push(evt.data);
                };

                mediaRecorder.onstop = function() {
                    isProcessingVoice = true;
                    var blob   = new Blob(recordedChunks, { type: 'audio/webm' });
                    var reader = new FileReader();
                    reader.onload = function(evt) {
                        var base64 = evt.target.result;
                        var msg = {
                            from:    currentUsername,
                            to:      currentChatUser,
                            type:    'voice',
                            content: base64,
                            time:    Date.now()
                        };
                        trackMsg(msg);
                        socket.emit('voice', { to: currentChatUser, base64: base64 });
                        addVoiceToUI(true, msg);
                        resetInactivity();
                        isProcessingVoice = false;
                    };
                    reader.readAsDataURL(blob);
                    stream.getTracks().forEach(function(t) { t.stop(); });
                };

                mediaRecorder.start();
                isRecording = true;
                voiceBtn.textContent = '⏹';
                voiceBtn.classList.add('recording');

            } catch (err) {
                alert('Microphone access denied: ' + err.message);
            }
        } else {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            isRecording = false;
            voiceBtn.textContent = '🎤';
            voiceBtn.classList.remove('recording');
        }
    });
}