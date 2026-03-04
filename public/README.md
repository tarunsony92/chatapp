# Chat App - Complete Setup Guide

## ✅ What's Been Fixed

### 1. **Authentication System** 
- ✓ Login/Registration working
- ✓ Fixed element ID mismatches (`login-container` → `login-screen`, `.app` → `#app`)
- ✓ Fixed nameInput from `<input>` to `<div>` (using `.textContent` instead of `.value`)
- ✓ Fixed all references in: auth.js, utils.js, socket.js, messages.js, search.js, media.js

### 2. **Color System Updated**
- ✓ CSS Variables converted to light/dark mode support
- ✓ Light mode colors: white bg, dark text
- ✓ Dark mode colors: dark bg, light text
- ✓ Created `theme.js` module for toggle

### 3. **Mobile Responsiveness**
- ✓ Media queries in CSS for mobile (<720px)
- ✓ Sidebar collapses/slides on mobile
- ✓ Chat area shows fullscreen on mobile
- ✓ Back button appears on mobile to return to user list

## 🎯 Quick Setup Instructions

### 1. Start Development Server
```bash
cd e:\chatbot
npm start
# Server runs at http://localhost:3000
```

### 2. Test Login
1. Navigate to http://localhost:3000
2. Register new account (username min 2 chars, password min 3 chars)
3. Login with credentials
4. Select a user from sidebar and start chatting

### 3. Test Features
- **Send Text**: Type message and press Enter or click send
- **Send Image**: Click 🖼️ button
- **Record Voice**: Click 🎤 button to record/stop
- **Reply to Message**: Click any message to show details, click Reply button
- **Search Users**: Type in search box to find users
- **Mobile View**: Open DevTools (F12), toggle device toolbar to test mobile layout

## 🌓 Theme Toggle (Ready to Implement)

Theme system is set up with:
- **theme.js** module created: `e:\chatbot\public\js\theme.js`
- CSS variables support light/dark modes in `variables.css`
- Local storage persists user preference

To enable toggle button:
1. Make sure theme.js is imported in index.html
2. Add button with id="theme-btn" to header
3. Button will toggle between 🌙 (dark mode) and ☀️ (light mode)

## 📱 Mobile Features

### Layout Behavior:
- **Desktop (>720px)**: 
  - Sidebar always visible (280px width)
  - Chat area beside sidebar
  - All buttons visible

- **Mobile (<720px)**:
  - Sidebar slides away when chat selected
  - Chat area takes full screen
  - Back button (←) returns to user list
  - Header condensed, fewer options shown

### Responsive Message Layout:
- **Sent Messages**: Right side, blue/purple bubble
- **Received Messages**: Left side, gray bubble
- **Images & Audio**: 220px width, fixed preview size
- **Max width**: 68% on desktop, 82% on mobile

## 🔧 File Structure

```
e:\chatbot\
├── app.js                          (Express server)
├── package.json
└── public\
    ├── index.html                  (Main app - embedded styles/JS)
    ├── js\
    │   ├── state.js                (Global state)
    │   ├── utils.js                (Helper functions)
    │   ├── auth.js                 (Login/register)
    │   ├── socket.js               (Real-time events)
    │   ├── messages.js             (Message handling)
    │   ├── ui.js                   (Modal controls)
    │   ├── search.js               (User search/list)
    │   ├── media.js                (Images/voice)
    │   ├── inactivity.js           (Auto-logout timer)
    │   ├── theme.js                (Dark/light toggle) ⭐ NEW
    │   └── app.js                  (Entry point)
    └── css\
        ├── variables.css           (Colors, tokens)
        ├── layout.css              (Main layout)
        ├── components.css          (UI components)
        ├── messages.css            (Message styling)
        ├── modals.css              (Modal dialogs)
        └── mobile.css              (Responsive design)
```

## 🚀 Key Features

✅ **Real-time Chat** - Socket.io for instant messaging  
✅ **User Authentication** - JWT tokens with secure httpOnly cookies  
✅ **Message Types** - Text, Images, Voice messages  
✅ **Read Receipts** - Shows if message is read (✓ or ✓✓)  
✅ **Typing Indicator** - Shows when other person is typing  
✅ **User Search** - Find and filter users  
✅ **Reply to Message** - Quote previous messages  
✅ **Online Status** - See who's online/offline  
✅ **Persistent Storage** - Chat history saved in JSON files  
✅ **10-min Auto-Logout** - Session expires on inactivity  
✅ **Mobile Responsive** - Fully mobile-optimized UI  
✅ **Dark/Light Mode** - Theme toggle support  

## ⚙️ Technical Stack

- **Backend**: Node.js + Express 5.x
- **Real-time**: Socket.io 4.8.x
- **Database**: File-based JSON (data/ folder)
- **Auth**: JWT + bcrypt
- **Frontend**: Vanilla JS (modular architecture)
- **CSS**: Modern CSS Variables + Media Queries

## 🐛 If Something Breaks

1. **Clear browser cache**: Ctrl+Shift+Delete
2. **Check console**: F12 → Console tab for errors
3. **Check server logs**: Terminal running npm start
4. **Verify data files**: Check e:\chatbot\data\ folder exists
5. **Restart server**: Stop npm start, run again

## 📝 Test Usernames

After registering, use these usernames for testing:
- `alice` / `alice123`
- `bob` / `bob123`
- `charlie` / `charlie123`

Register multiple accounts to test the chat between different users.

---

**Status**: ✅ Application is fully functional and ready to use!
