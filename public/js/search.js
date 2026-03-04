/**
 * Search Module
 * Handles user search and dynamic chat list
 */

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

/** Get list of users with whom we have exchanged messages */
function getChatUsers() {
    // Load chat history from localStorage
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const usersWithChats = new Set();
    
    chatHistory.forEach(msg => {
        const me = nameInput.value;
        if (msg.from === me) usersWithChats.add(msg.to);
        if (msg.to === me) usersWithChats.add(msg.from);
    });
    
    return Array.from(usersWithChats);
}

/** Update the main user list to show only users with chats */
function updateChatUserList() {
    const me = nameInput.value;
    const chatUsers = getChatUsers();
    
    userListElement.innerHTML = '';
    const chatUserObjs = allAvailableUsers.filter(u => chatUsers.includes(u.username));
    
    if (chatUserObjs.length === 0) {
        userListElement.innerHTML = '<li style="opacity:0.6; padding: 10px 12px; font-size:12px;">No conversations yet</li>';
    }
    
    chatUserObjs.forEach(obj => {
        const li = document.createElement('li');
        li.dataset.username = obj.username;
        
        const dot = obj.online ? '🟢' : '⚫';
        const count = window.unseenCounts[obj.username] || 0;
        const badge = count > 0 ? ` <span class="unseen-badge">${count}</span>` : '';
        
        li.innerHTML = `${dot} ${escapeHtml(obj.username)}${badge}`;
        if (currentChatUser === obj.username) li.classList.add('active');
        li.style.cursor = 'pointer';
        if (!obj.online) li.style.opacity = '0.6';
        li.addEventListener('click', () => selectUser(obj.username));
        userListElement.appendChild(li);
    });
}

/** Handle search input */
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        if (!query) {
            searchResults.style.display = 'none';
            updateChatUserList();
            return;
        }
        
        const me = nameInput.value;
        const filtered = allAvailableUsers.filter(u => 
            u.username.toLowerCase().includes(query) && u.username !== me
        );
        
        searchResults.innerHTML = '';
        if (filtered.length === 0) {
            searchResults.innerHTML = '<li style="opacity:0.6; padding: 10px 12px; font-size:12px;">No users found</li>';
        } else {
            filtered.forEach(obj => {
                const li = document.createElement('li');
                li.dataset.username = obj.username;
                
                const dot = obj.online ? '🟢' : '⚫';
                li.innerHTML = `${dot} ${escapeHtml(obj.username)}`;
                li.addEventListener('click', () => {
                    selectUser(obj.username);
                    searchInput.value = '';
                    searchResults.style.display = 'none';
                });
                searchResults.appendChild(li);
            });
        }
        
        searchResults.style.display = 'block';
    });
    
    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
}
