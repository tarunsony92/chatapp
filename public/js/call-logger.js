/**
 * Call Logger Module
 * Tracks and logs all audio and video calls with duration, type, and status
 */

// Store call history in localStorage
function logCall(data) {
    try {
        const callRecord = {
            id: Date.now(),
            type: data.type, // 'audio' or 'video'
            with: data.with, // username of the person
            duration: data.duration || 0, // in seconds
            status: data.status, // 'completed', 'missed', 'rejected'
            initiator: data.initiator, // who started the call (username)
            receiver: data.receiver, // who received it
            timestamp: Date.now(),
            date: new Date().toLocaleString()
        };

        // Get existing calls
        const existingCalls = localStorage.getItem('callHistory');
        const callHistory = existingCalls ? JSON.parse(existingCalls) : [];
        
        // Add new call
        callHistory.push(callRecord);
        
        // Save to localStorage (max 500 calls)
        if (callHistory.length > 500) {
            callHistory.shift();
        }
        localStorage.setItem('callHistory', JSON.stringify(callHistory));

        console.log('[CALL-LOGGER] Call logged:', callRecord);
        return callRecord;
    } catch (err) {
        console.error('[CALL-LOGGER] Error logging call:', err);
    }
}

function getCallHistory(username = null) {
    try {
        const existingCalls = localStorage.getItem('callHistory');
        const callHistory = existingCalls ? JSON.parse(existingCalls) : [];
        
        if (username) {
            return callHistory.filter(call => call.with === username);
        }
        return callHistory;
    } catch (err) {
        console.error('[CALL-LOGGER] Error getting call history:', err);
        return [];
    }
}

function formatCallDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
}

function createCallLogMessage(callRecord) {
    const icon = callRecord.type === 'audio' ? '☎️' : '🎥';
    const isMissed = callRecord.status === 'missed' || callRecord.status === 'rejected';
    const me = window.me || localStorage.getItem('username') || document.querySelector('[data-username]')?.dataset.username || 'me';
    const isOutgoing = callRecord.initiator === me;
    
    const typeText = callRecord.type === 'audio' ? 'Audio Call' : 'Video Call';
    const statusText = isMissed ? (isOutgoing ? 'Rejected' : 'Missed') : 'Completed';
    const durationText = callRecord.duration > 0 ? ` • ${formatCallDuration(callRecord.duration)}` : '';
    
    return `${icon} ${typeText} • ${statusText}${durationText}`;
}

// Make functions globally accessible
window.logCall = logCall;
window.getCallHistory = getCallHistory;
window.formatCallDuration = formatCallDuration;
window.createCallLogMessage = createCallLogMessage;
