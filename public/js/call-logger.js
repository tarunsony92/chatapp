// /**
//  * Call Logger Module
//  * Tracks and logs all audio and video calls with duration, type, and status
//  */

// // Store call history in localStorage
// function logCall(data) {
//     try {
//         const callRecord = {
//             id: Date.now(),
//             type: data.type, // 'audio' or 'video'
//             with: data.with, // username of the person
//             duration: data.duration || 0, // in seconds
//             status: data.status, // 'completed', 'missed', 'rejected'
//             initiator: data.initiator, // who started the call (username)
//             receiver: data.receiver, // who received it
//             timestamp: Date.now(),
//             date: new Date().toLocaleString()
//         };

//         // Get existing calls
//         const existingCalls = localStorage.getItem('callHistory');
//         const callHistory = existingCalls ? JSON.parse(existingCalls) : [];
        
//         // Add new call
//         callHistory.push(callRecord);
        
//         // Save to localStorage (max 500 calls)
//         if (callHistory.length > 500) {
//             callHistory.shift();
//         }
//         localStorage.setItem('callHistory', JSON.stringify(callHistory));

//         console.log('[CALL-LOGGER] Call logged:', callRecord);
//         return callRecord;
//     } catch (err) {
//         console.error('[CALL-LOGGER] Error logging call:', err);
//     }
// }

// function getCallHistory(username = null) {
//     try {
//         const existingCalls = localStorage.getItem('callHistory');
//         const callHistory = existingCalls ? JSON.parse(existingCalls) : [];
        
//         if (username) {
//             return callHistory.filter(call => call.with === username);
//         }
//         return callHistory;
//     } catch (err) {
//         console.error('[CALL-LOGGER] Error getting call history:', err);
//         return [];
//     }
// }

// function formatCallDuration(seconds) {
//     if (seconds < 60) return `${seconds}s`;
//     const minutes = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${minutes}m ${secs}s`;
// }

// function createCallLogMessage(callRecord) {
//     const icon = callRecord.type === 'audio' ? '☎️' : '🎥';
//     const isMissed = callRecord.status === 'missed' || callRecord.status === 'rejected';
//     const me = window.me || localStorage.getItem('username') || document.querySelector('[data-username]')?.dataset.username || 'me';
//     const isOutgoing = callRecord.initiator === me;
    
//     const typeText = callRecord.type === 'audio' ? 'Audio Call' : 'Video Call';
//     const statusText = isMissed ? (isOutgoing ? 'Rejected' : 'Missed') : 'Completed';
//     const durationText = callRecord.duration > 0 ? ` • ${formatCallDuration(callRecord.duration)}` : '';
    
//     return `${icon} ${typeText} • ${statusText}${durationText}`;
// }

// // Make functions globally accessible
// window.logCall = logCall;
// window.getCallHistory = getCallHistory;
// window.formatCallDuration = formatCallDuration;
// window.createCallLogMessage = createCallLogMessage;
/**
 * call-logger.js — NexChat Call History Logger
 * Stores call logs in localStorage and provides helpers for display
 */

console.log('[CALL-LOGGER] Module loading...');

const CALL_HISTORY_KEY = 'nexchat_call_history';
const MAX_CALL_LOGS = 200;

/**
 * Log a completed call.
 * @param {Object} record - { type: 'audio'|'video', partner: string, duration: number (seconds), timestamp: number }
 */
function logCall(record) {
    if (!record || !record.partner) return;
    try {
        const history = getCallHistoryAll();
        history.push({
            type:      record.type || 'audio',
            partner:   record.partner,
            duration:  record.duration || 0,
            timestamp: record.timestamp || Date.now(),
            initiator: window.currentUsername || ''
        });
        // Keep bounded
        if (history.length > MAX_CALL_LOGS) history.splice(0, history.length - MAX_CALL_LOGS);
        localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(history));
        console.log('[CALL-LOGGER] Call logged:', record);
    } catch (e) {
        console.warn('[CALL-LOGGER] Could not save call log:', e);
    }
}

/**
 * Get all call history entries.
 */
function getCallHistoryAll() {
    try {
        return JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || '[]');
    } catch {
        return [];
    }
}

/**
 * Get call history with a specific user (partner).
 * @param {string} partnerUsername
 */
function getCallHistory(partnerUsername) {
    if (!partnerUsername) return [];
    return getCallHistoryAll().filter(r =>
        r.partner === partnerUsername ||
        (r.initiator && r.initiator === window.currentUsername && r.partner === partnerUsername)
    );
}

/**
 * Format a call record into a readable string.
 * @param {Object} callRecord
 * @returns {string}
 */
function createCallLogMessage(callRecord) {
    const me = window.currentUsername || '';
    const isOutgoing = callRecord.initiator === me;
    const direction = isOutgoing ? 'Outgoing' : 'Incoming';
    const type = callRecord.type === 'video' ? 'video call' : 'audio call';
    const dur = formatCallDuration(callRecord.duration || 0);
    return `${direction} ${type}${dur ? ' · ' + dur : ''}`;
}

/**
 * Format seconds into mm:ss or hh:mm:ss string.
 * Returns empty string for 0-duration calls.
 */
function formatCallDuration(seconds) {
    if (!seconds || seconds < 1) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/**
 * Clear all call history.
 */
function clearCallHistory() {
    localStorage.removeItem(CALL_HISTORY_KEY);
}

/* ─── exports ────────────────────────────────────────── */
window.logCall              = logCall;
window.getCallHistory       = getCallHistory;
window.getCallHistoryAll    = getCallHistoryAll;
window.createCallLogMessage = createCallLogMessage;
window.clearCallHistory     = clearCallHistory;

console.log('[CALL-LOGGER] ✓ Module loaded');