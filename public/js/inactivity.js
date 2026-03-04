/**
 * Inactivity Logout Module
 * Handles auto-logout after 10 minutes of inactivity
 */

/** Setup inactivity logout */
function setupInactivityLogout() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
        document.addEventListener(evt, () => resetInactivity(), { passive: true })
    );
    resetInactivity();
}
