/**
 * Media Module
 * Handles image upload and voice recording
 */

const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');
const voiceBtn = document.getElementById('voice-btn');

/** Image upload handler */
if (imageBtn) imageBtn.addEventListener('click', () => imageInput && imageInput.click());

if (imageInput) {
    imageInput.addEventListener('change', e => {
        if (!e.target.files.length) return;
        if (!currentChatUser) return alert('Select a user first');
        const file = e.target.files[0];
        if (file.size > 5 * 1024 * 1024) return alert('Image must be under 5MB');
        const reader = new FileReader();
        reader.onload = evt => {
            const base64 = evt.target.result;
            const msg = { from: nameInput.value, to: currentChatUser, type: 'image', content: base64, time: Date.now() };
            
            // Save to localStorage for chat list tracking
            const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
            chatHistory.push(msg);
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            updateChatUserList();
            
            socket.emit('image', { to: currentChatUser, base64 });
            addImageToUI(true, msg);
            imageInput.value = '';
            resetInactivity();
        };
        reader.readAsDataURL(file);
    });
}

/** Voice recording handler */
if (voiceBtn) {
    voiceBtn.addEventListener('click', async e => {
        e.preventDefault();
        
        // Prevent multiple clicks while processing
        if (isProcessingVoice) return;
        
        if (!isRecording) {
            if (!currentChatUser) return alert('Select a user first');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                recordedChunks = [];
                mediaRecorder.ondataavailable = evt => { if (evt.data.size > 0) recordedChunks.push(evt.data); };
                mediaRecorder.onstop = () => {
                    isProcessingVoice = true;
                    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = evt => {
                        const base64 = evt.target.result;
                        const msg = { from: nameInput.value, to: currentChatUser, type: 'voice', content: base64, time: Date.now() };
                        
                        // Save to localStorage for chat list tracking
                        const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
                        chatHistory.push(msg);
                        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                        updateChatUserList();
                        
                        socket.emit('voice', { to: currentChatUser, base64 });
                        addVoiceToUI(true, msg);
                        resetInactivity();
                        
                        // Done processing, allow next recording
                        isProcessingVoice = false;
                    };
                    reader.readAsDataURL(blob);
                    stream.getTracks().forEach(t => t.stop());
                };
                mediaRecorder.start();
                isRecording = true;
                voiceBtn.textContent = '⏹ Stop';
                voiceBtn.classList.add('recording');
            } catch (err) {
                alert('Microphone access denied: ' + err.message);
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.innerHTML = '🎤';
            voiceBtn.classList.remove('recording');
        }
    });
}
