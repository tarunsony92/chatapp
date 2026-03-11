/**
 * call-logger.js — NexChat Call History Logger
 * Stores call logs in localStorage and provides helpers for display
 */

console.log('[CALL-LOGGER] Module loading...');

var CALL_HISTORY_KEY = 'nexchat_call_history';
var MAX_CALL_LOGS = 200;

/**
 * Log a completed call.
 * @param {Object} record - { type: 'audio'|'video', partner: string, duration: number (seconds), timestamp: number }
 */
function logCall(record) {
    if (!record || !record.partner) return;
    try {
        var history = getCallHistoryAll();
        history.push({
            type:      record.type || 'audio',
            partner:   record.partner,
            duration:  record.duration || 0,
            timestamp: record.timestamp || Date.now(),
            initiator: currentUsername || ''
        });
        if (history.length > MAX_CALL_LOGS) {
            history.splice(0, history.length - MAX_CALL_LOGS);
        }
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
    } catch (e) {
        return [];
    }
}

/**
 * Get call history with a specific user (partner).
 * @param {string} partnerUsername
 */
function getCallHistory(partnerUsername) {
    if (!partnerUsername) return [];
    return getCallHistoryAll().filter(function(r) {
        return r.partner === partnerUsername;
    });
}

/**
 * Format seconds into mm:ss or h:mm:ss string.
 * Returns empty string for 0-duration calls.
 */
function formatCallDuration(seconds) {
    if (!seconds || seconds < 1) return '';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) {
        return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/**
 * Format a call record into a readable string.
 * @param {Object} callRecord
 * @returns {string}
 */
function createCallLogMessage(callRecord) {
    var me = currentUsername || '';
    var direction = callRecord.initiator === me ? 'Outgoing' : 'Incoming';
    var type = callRecord.type === 'video' ? 'video call' : 'audio call';
    var dur = formatCallDuration(callRecord.duration || 0);
    return direction + ' ' + type + (dur ? ' · ' + dur : '');
}

/**
 * Clear all call history.
 */
function clearCallHistory() {
    localStorage.removeItem(CALL_HISTORY_KEY);
    console.log('[CALL-LOGGER] History cleared');
}

/* ─── exports ────────────────────────────────────────────────────── */
window.logCall              = logCall;
window.getCallHistory       = getCallHistory;
window.getCallHistoryAll    = getCallHistoryAll;
window.createCallLogMessage = createCallLogMessage;
window.formatCallDuration   = formatCallDuration;
window.clearCallHistory     = clearCallHistory;

console.log('[CALL-LOGGER] ✓ Module loaded');