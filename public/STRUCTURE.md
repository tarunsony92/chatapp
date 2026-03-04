# Chat Application - Code Structure

## Directory Organization

```
public/
├── index.html              # Main HTML file
├── css/                    # Stylesheets
│   ├── style.css          # Master CSS (imports all)
│   ├── variables.css      # CSS variables & design tokens
│   ├── layout.css         # Layout & structure
│   ├── components.css     # UI components (buttons, lists, badges)
│   ├── messages.css       # Message styling & interactions
│   ├── modals.css         # Modals & overlays
│   └── mobile.css         # Responsive design
├── js/                    # JavaScript modules
│   ├── app.js            # Entry point & initialization
│   ├── utils.js          # Utility functions
│   ├── auth.js           # Authentication (login, register, session)
│   ├── socket.js         # Socket.io connection & event handlers
│   ├── messages.js       # Message handling & UI updates
│   ├── ui.js             # UI interactions & modal
│   ├── search.js         # User search & chat list
│   ├── media.js          # Image upload & voice recording
│   └── inactivity.js     # Auto-logout on inactivity
└── app.js               # (OLD - deprecated, use js/ modules instead)
```

## Module Descriptions

### `js/utils.js`
- **Purpose**: Shared utility functions
- **Exports**: 
  - `escapeHtml()` - XSS protection
  - `formatTime()` - Relative timestamps
  - `isMobile()` - Device detection
  - `api()` - HTTP requests
  - `resetInactivity()` - Activity tracking
  - `logout()` - Session cleanup

### `js/auth.js` 
- **Purpose**: User authentication and session management
- **Features**:
  - Login form handling
  - Register form handling
  - Session validation
  - JWT token management

### `js/socket.js`
- **Purpose**: Real-time socket.io connection
- **Events**:
  - `connect/disconnect`
  - `user-list` - Online users
  - `message/image/voice` - Incoming messages
  - `typing` - Typing indicators
  - `history` - Chat history
  - `mark-read` - Read status
  - `unseen-count` - Unread count

### `js/messages.js`
- **Purpose**: Message creation, sending, and rendering
- **Features**:
  - Send text messages
  - Add messages to UI
  - Reply context & quoted messages
  - Message swipe/click to view details
  - Scroll to quoted message

### `js/ui.js`
- **Purpose**: User interface interactions
- **Features**:
  - Message details modal
  - User selection
  - Mobile panel switching
  - Modal interactions

### `js/search.js`
- **Purpose**: User search and chat list management
- **Features**:
  - Search users
  - Filter by chat history
  - Dynamic chat list
  - Show/hide search results

### `js/media.js`
- **Purpose**: Media file handling
- **Features**:
  - Image upload
  - Voice recording
  - Base64 encoding
  - File validation

### `js/inactivity.js`
- **Purpose**: Auto-logout functionality
- **Features**:
  - Inactivity tracking
  - 10-minute timeout
  - Activity event listeners

### `css/variables.css`
Defines:
- Color scheme
- Spacing values
- Border radius
- Shadows
- Transitions
- Typography scales

### `css/layout.css`
Defines:
- App container layout
- Header, sidebar, chat-area
- Message container
- Input area

### `css/components.css`
Defines:
- Login/register forms
- Buttons (primary, secondary, icon)
- User lists
- Search input
- Badges
- Loading spinner

### `css/messages.css`
Defines:
- Message bubbles
- Reply context styling
- Swipe indicators
- Message highlight animation

### `css/modals.css`
Defines:
- Modal overlay
- Modal content & structure
- Message details modal
- Modal buttons

### `css/mobile.css`
Defines:
- Tablet breakpoint (768px)
- Mobile panel switching
- Responsive typography
- Touch-optimized buttons

## Script Loading Order

**In `index.html`:**

1. `socket.io.js` - Real-time connectivity library
2. `moment.js` - Date/time formatting
3. `js/utils.js` - Utility functions (dependency for all modules)
4. `js/auth.js` - Authentication (uses utils)
5. `js/socket.js` - Socket handlers (uses utils, auth)
6. `js/messages.js` - Message logic (uses utils, socket)
7. `js/ui.js` - UI interactions (uses messages, socket)
8. `js/search.js` - Search functionality (uses UI, socket)
9. `js/media.js` - Media handling (uses messages, socket)
10. `js/inactivity.js` - Inactivity tracking (uses utils)
11. `js/app.js` - Main entry point (initialization)

**This order ensures:**
- Dependencies load before dependents
- Global state is initialized before use
- DOM is fully loaded before interaction

## CSS Loading Order

**In `index.html`:**
- `css/style.css` (master file that imports all CSS modules)

The master imports in this order:
1. `variables.css` - Design tokens
2. `layout.css` - Structure
3. `components.css` - UI components
4. `messages.css` - Message styling
5. `modals.css` - Modal styling
6. `mobile.css` - Responsive design

## Key Features

✅ **Modular Architecture** - Each feature is self-contained
✅ **Clear Separation of Concerns** - Auth, messages, UI are separate
✅ **Well-Organized CSS** - Logical grouping, easy to maintain
✅ **Easy to Extend** - Add new modules without breaking existing code
✅ **Mobile Responsive** - Dedicated mobile CSS module
✅ **Performance** - CSS variables for efficient styling
✅ **Readable Code** - Clear file organization and naming

## Development Tips

1. **Adding a new feature?** Create a new `.js` file in `js/` directory
2. **Adding new styles?** Add them to appropriate `css/` file
3. **Updating colors?** Change values in `css/variables.css`
4. **Mobile bug?** Check `css/mobile.css` for responsive rules
5. **Need global styles?** Use `css/variables.css` for consistency

## Browser Support

- Chrome/Edge: ✅ Latest 2 versions
- Firefox: ✅ Latest 2 versions
- Safari: ✅ Latest 2 versions
- Mobile browsers: ✅ iOS Safari 12+, Chrome Android
