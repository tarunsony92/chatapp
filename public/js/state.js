/**
 * Global State Manager
 * Central place for all global variables and state
 * This must be loaded FIRST before all other modules
 */

// ═════════════════════════════════════════════════════════════════
// SOCKET & CONNECTION
// ═════════════════════════════════════════════════════════════════
let socket = null;

// ═════════════════════════════════════════════════════════════════
// USER STATE
// ═════════════════════════════════════════════════════════════════
let currentChatUser = null;
let allAvailableUsers = [];
let inactivityTimer = null;

// ═════════════════════════════════════════════════════════════════
// MESSAGE STATE
// ═════════════════════════════════════════════════════════════════
let replyToMsg = null;
let messageMap = {};

// ═════════════════════════════════════════════════════════════════
// MEDIA STATE
// ═════════════════════════════════════════════════════════════════
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isProcessingVoice = false;

// ═════════════════════════════════════════════════════════════════
// UI STATE
// ═════════════════════════════════════════════════════════════════
window.currentUserList = [];
window.unseenCounts = {};

console.log('✓ Global State Manager Initialized');
