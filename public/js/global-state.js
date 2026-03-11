/**
 * Global State Manager
 * Central place for all global variables and state
 * This must be loaded FIRST before all other modules
 */

// ═════════════════════════════════════════════════════════════════
// SOCKET & CONNECTION
// ═════════════════════════════════════════════════════════════════
var socket = null;

// ═════════════════════════════════════════════════════════════════
// USER STATE
// ═════════════════════════════════════════════════════════════════
var currentChatUser = null;
var allAvailableUsers = [];
var inactivityTimer = null;
var currentUsername = '';

// ═════════════════════════════════════════════════════════════════
// MESSAGE STATE
// ═════════════════════════════════════════════════════════════════
var replyToMsg = null;
var messageMap = {};

// ═════════════════════════════════════════════════════════════════
// MEDIA STATE
// ═════════════════════════════════════════════════════════════════
var mediaRecorder = null;
var recordedChunks = [];
var isRecording = false;
var isProcessingVoice = false;
var typingTimeout = null;

// ═════════════════════════════════════════════════════════════════
// UI STATE
// ═════════════════════════════════════════════════════════════════
window.currentUserList = [];
window.unseenCounts = {};

// ═════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════════════
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInitials(name) {
    return name ? name.slice(0, 2).toUpperCase() : '??';
}

function formatTime(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(diff / 3600000);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(diff / 86400000);
    if (d < 7)  return d + 'd ago';
    return new Date(ts).toLocaleDateString();
}

function isMobile() {
    return window.innerWidth < 720;
}

function resetInactivity() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function() {
        alert('Session expired due to inactivity.');
        if (typeof logout === 'function') logout();
    }, 10 * 60 * 1000);
}

function setupInactivityLogout() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(evt) {
        document.addEventListener(evt, resetInactivity, { passive: true });
    });
    resetInactivity();
}

console.log('✓ Global State Manager Initialized');