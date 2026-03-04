/**
 * Theme Toggle Module
 * Handles light/dark mode switching
 */

const themeBtn = document.getElementById('theme-btn');
let currentTheme = localStorage.getItem('theme') || 'light';

// Apply saved theme
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    currentTheme = theme;
    updateThemeButton();
}

// Update button icon based on theme
function updateThemeButton() {
    if (themeBtn) {
        themeBtn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
        themeBtn.title = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

// Theme toggle handler
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(currentTheme);
    });
}

// Initialize
applyTheme(currentTheme);
console.log('✓ Theme Manager Ready (' + currentTheme + ' mode)');
