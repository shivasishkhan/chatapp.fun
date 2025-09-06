const token = localStorage.getItem('chat_token');
if (!token) {
    window.location.href = '/login.html';
}

const socket = io();
socket.emit('authenticate', token);

// --- DOM Elements ---
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const roomList = document.getElementById('room-list');
const userList = document.getElementById('user-list');
const currentRoomTitle = document.getElementById('current-room-title');
const iconSidebar = document.getElementById('icon-sidebar');
const panels = { rooms: document.getElementById('rooms-panel'), users: document.getElementById('users-panel') };
const logoutButton = document.getElementById('logout-button');
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const cancelSettingsButton = document.getElementById('cancel-settings');
const themeSwitcher = document.getElementById('theme-switcher');
const customBgInput = document.getElementById('bg-url');
const userProfilePanel = document.getElementById('user-profile');

// --- State ---
let username = '';
let currentChatTarget = '#general';
let userProfiles = {};
let unreadCounts = {};

// --- Functions ---
function addMessage(msg) {
    const item = document.createElement('li');
    item.dataset.messageId = msg.id;
    const user = msg.from;
    const isMyMessage = user === username;

    if (msg.type === 'system') {
        item.classList.add('system-message');
        item.textContent = msg.text;
    } else {
        const pfpUrl = userProfiles[user]?.pfpUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${user}`;
        item.classList.add('message-item');
        if (isMyMessage) item.classList.add('my-message');
        
        item.innerHTML = `
            <img src="${pfpUrl}" alt="${user}" class="avatar" data-user="${user}">
            <div class="message-content">
                <div class="message-header">
                    <strong>${user} ${msg.convoId ? `(private DM)` : ''}</strong>
                    <span class="timestamp">${msg.timestamp}</span>
                </div>
                <p class="message-text">${msg.text}</p>
            </div>
        `;
        
        if (isMyMessage) {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
            item.appendChild(deleteButton);
        }
    }
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

function updateUserDirectory(users) {
    userList.innerHTML = '';
    users.sort((a, b) => b.isOnline - a.isOnline || a.username.localeCompare(b.username));
    users.forEach(user => {
        userProfiles[user.username] = { status: user.status, pfpUrl: user.pfpUrl, backgroundUrl: user.backgroundUrl };
        if (user.username === username) return;
        const item = document.createElement('li');
        item.classList.add('user-list-item');
        item.dataset.id = user.username;
        item.innerHTML = `
            <div class="avatar-container">
                <img src="${user.pfpUrl}" alt="${user.username}" class="avatar" data-user="${user.username}">
                <div class="status-indicator ${user.isOnline ? 'online' : 'offline'}"></div>
            </div>
            <div class="user-info">
                <span class="username">${user.username}</span>
                <span class="status">${user.status}</span>
            </div>
        `;
        userList.appendChild(item);
    });
    renderMyProfile();
    updateUnreadIndicators();
}

function renderMyProfile() {
    if (userProfiles[username]) {
        const myProfile = userProfiles[username];
        userProfilePanel.innerHTML = `
            <img src="${myProfile.pfpUrl}" alt="${username}" class="avatar" data-user="${username}">
            <div class="user-info">
                <span class="username">${username}</span>
                <span class="status">${myProfile.status}</span>
            </div>
        `;
    }
}

function updateUnreadIndicators() {
    document.querySelectorAll('.unread-dot').forEach(dot => dot.remove());
    for (const id in unreadCounts) {
        if (unreadCounts[id] > 0) {
            const listItem = document.querySelector(`[data-id="${id}"]`);
            if (listItem && !listItem.querySelector('.unread-dot')) {
                const dot = document.createElement('div');
                dot.className = 'unread-dot';
                listItem.appendChild(dot);
            }
        }
    }
}

function applyTheme(theme) { document.body.classList.toggle('light-theme', theme === 'light'); themeSwitcher.innerHTML = theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>'; localStorage.setItem('chat_theme', theme); }
function applyBackground(bg) { if (bg === 'default' || !bg) { messages.style.backgroundImage = 'none'; } else { messages.style.backgroundImage = bg.startsWith('url(') ? bg : `url('${bg}')`; } }
function switchPanel(panelName) { Object.values(panels).forEach(p => p.classList.remove('active')); document.querySelectorAll('.nav-icon').forEach(i => i.classList.remove('active')); panels[panelName].classList.add('active'); document.querySelector(`.nav-icon[data-panel="${panelName}"]`).classList.add('active'); }

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => { const savedTheme = localStorage.getItem('chat_theme') || 'dark'; applyTheme(savedTheme); });
socket.on('connect', () => { try { const payload = JSON.parse(atob(token.split('.')[1])); username = payload.username; } catch (e) { localStorage.removeItem('chat_token'); window.location.href = '/login.html'; } });
socket.on('auth_error', () => { alert("Authentication error!"); localStorage.removeItem('chat_token'); window.location.href = '/login.html'; });

// --- Event Listeners ---
form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value) { if (currentChatTarget.startsWith('#')) { socket.emit('chat message', input.value); } else { socket.emit('private message', { to: currentChatTarget, text: input.value }); } input.value = ''; } });
themeSwitcher.addEventListener('click', () => { const newTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light'; applyTheme(newTheme); });
settingsButton.addEventListener('click', () => { if (userProfiles[username]) { document.getElementById('pfp-url').value = userProfiles[username].pfpUrl; document.getElementById('status-text').value = userProfiles[username].status; const currentBg = userProfiles[username].backgroundUrl; if (currentBg && currentBg !== 'default') { customBgInput.value = currentBg.startsWith('url(') ? currentBg.slice(5, -2) : currentBg; } else { customBgInput.value = ''; } } settingsModal.classList.remove('hidden'); });
cancelSettingsButton.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });
settingsForm.addEventListener('submit', async (e) => { e.preventDefault(); const pfpUrl = document.getElementById('pfp-url').value; const status = document.getElementById('status-text').value; const backgroundUrl = customBgInput.value ? `url('${customBgInput.value}')` : 'default'; await fetch('/update-profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ pfpUrl, status, backgroundUrl }), }); applyBackground(backgroundUrl); if (userProfiles[username]) { userProfiles[username].backgroundUrl = backgroundUrl; } settingsModal.classList.add('hidden'); });
iconSidebar.addEventListener('click', (e) => { const navIcon = e.target.closest('.nav-icon'); if (navIcon && navIcon.dataset.panel) { switchPanel(navIcon.dataset.panel); } });
logoutButton.addEventListener('click', () => { localStorage.removeItem('chat_token'); window.location.href = '/login.html'; });
roomList.addEventListener('click', (e) => { const targetLi = e.target.closest('.room-item'); if (targetLi) { const newRoom = targetLi.dataset.id; socket.emit('join room', newRoom); currentChatTarget = newRoom; currentRoomTitle.textContent = newRoom; input.placeholder = `Message ${newRoom}...`; document.querySelectorAll('.room-item, .user-list-item').forEach(li => li.classList.remove('active-room')); targetLi.classList.add('active-room'); unreadCounts[newRoom] = 0; updateUnreadIndicators(); } });
userList.addEventListener('click', (e) => { const targetLi = e.target.closest('.user-list-item'); if (targetLi) { const targetUser = targetLi.dataset.id; if (targetUser !== username) { currentChatTarget = targetUser; currentRoomTitle.textContent = `Private Chat with ${targetUser}`; input.placeholder = `Private message to ${targetUser}...`; document.querySelectorAll('.room-item, .user-list-item').forEach(li => li.classList.remove('active-room')); targetLi.classList.add('active-room'); messages.innerHTML = ''; socket.emit('load dm history', { targetUser }); unreadCounts[targetUser] = 0; updateUnreadIndicators(); } } });
messages.addEventListener('click', (e) => { if (e.target.closest('.delete-button')) { const messageItem = e.target.closest('.message-item'); const messageId = messageItem.dataset.messageId; if (confirm('Are you sure you want to delete this message?')) { socket.emit('delete message', { roomId: currentChatTarget, messageId }); } } });

// --- Socket Handlers ---
socket.on('chat message', (msg) => { if (currentChatTarget === msg.room) { addMessage(msg); } else { unreadCounts[msg.room] = (unreadCounts[msg.room] || 0) + 1; updateUnreadIndicators(); } });
socket.on('private message', (msg) => { const convoWith = msg.from === username ? msg.to : msg.from; if (currentChatTarget === convoWith) { addMessage(msg); } else { unreadCounts[convoWith] = (unreadCounts[convoWith] || 0) + 1; updateUnreadIndicators(); } });
socket.on('system message', (text) => addMessage({ type: 'system', text }));
socket.on('load history', (history) => { messages.innerHTML = ''; history.forEach(addMessage); });
socket.on('update user directory', (users) => updateUserDirectory(users));
socket.on('load user settings', (settings) => { applyBackground(settings.backgroundUrl); if (userProfiles[username]) { userProfiles[username].backgroundUrl = settings.backgroundUrl; } });
socket.on('message deleted', (messageId) => { const messageItem = document.querySelector(`[data-message-id='${messageId}']`); if (messageItem) { messageItem.classList.add('deleting'); setTimeout(() => { messageItem.remove(); }, 400); } });
socket.on('profile updated', ({ username: updatedUsername, status, pfpUrl }) => { if (userProfiles[updatedUsername]) { userProfiles[updatedUsername].pfpUrl = pfpUrl; userProfiles[updatedUsername].status = status; } const userListItem = userList.querySelector(`[data-id="${updatedUsername}"]`); if(userListItem) { userListItem.querySelector('.status').textContent = status; userListItem.querySelector('.avatar').src = pfpUrl; } if(updatedUsername === username) { renderMyProfile(); } document.querySelectorAll(`.avatar[data-user="${updatedUsername}"]`).forEach(img => { img.src = pfpUrl; }); });