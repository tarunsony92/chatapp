const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');

// CONFIG
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_in_production';
const DATA_DIR = path.join(__dirname, 'data');

// EXPRESS SETUP
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// COOKIE OPTIONS
const AUTH_COOKIE_NAME = 'token';
const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Persist across reload + browser restart for token lifetime
    maxAge: 2 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
};

// DATABASE
let chatHistory = [];
let users = {};

async function loadState() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });

        try {
            const rawChats = await fs.readFile(path.join(DATA_DIR, 'chats.json'), 'utf8');
            chatHistory = JSON.parse(rawChats);

            // Migrate legacy chat entries
            let chatMigrated = false;
            chatHistory = chatHistory.map(m => {
                if (!m.from && m.name && m.username) {
                    chatMigrated = true;
                    return {
                        from: m.name,
                        to: m.username,
                        type: 'text',
                        content: m.message || m.text || '',
                        time: m.dateTime || m.time || Date.now()
                    };
                }
                if (m.content === undefined && m.message !== undefined) m.content = m.message;
                if (m.time === undefined && m.dateTime !== undefined) m.time = m.dateTime;
                return m;
            });
            if (chatMigrated) {
                console.log('[DB] Migrated chatHistory entries');
            }
        } catch (e) {
            chatHistory = [];
        }

        try {
            const rawUsers = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'users.json'), 'utf8'));
            users = {};
            let migrated = false;
            for (const name in rawUsers) {
                const entry = rawUsers[name];
                const hash = entry.hash || entry.passwordHash;
                if (hash && !entry.hash) migrated = true;
                users[name] = { hash };
            }
            if (migrated) console.log('[DB] Migrated user hash fields');
        } catch (e) {
            users = {};
        }

        await saveState();
        console.log('[DB] Data loaded');
    } catch (e) {
        console.log('[DB] Init error:', e.message);
    }
}

async function saveState() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await Promise.all([
            fs.writeFile(path.join(DATA_DIR, 'chats.json'), JSON.stringify(chatHistory, null, 2)),
            fs.writeFile(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2))
        ]);
    } catch (e) {
        console.error('[DB] Save error:', e.message);
    }
}

loadState();

// AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
    const token = req.cookies[AUTH_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ROUTES
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.length < 2 || password.length < 3) {
        return res.status(400).json({ error: 'Username min 2 chars, password min 3 chars' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores' });
    }
    if (users[username]) {
        return res.status(409).json({ error: 'Username already taken' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        users[username] = { hash };
        await saveState();
        // Auto-login after register so refresh doesn't require re-login
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
        res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
        res.status(201).json({ username });
    } catch (e) {
        console.error('Register error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credentials required' });
    const u = users[username];
    if (!u || !u.hash) return res.status(401).json({ error: 'Invalid username or password' });

    try {
        const ok = await bcrypt.compare(password, u.hash);
        if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
        res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
        res.json({ username });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/me', authMiddleware, (req, res) => {
    res.json({ username: req.user.username });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
});

app.get('/api/users', authMiddleware, (req, res) => {
    res.json(Object.keys(users));
});

// Catch-all API 404
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// SERVER
const server = app.listen(PORT, () => {
    console.log('[SERVER] Running at http://localhost:' + PORT);
});

const io = require('socket.io')(server);

// SOCKET MAPS
const socketsConnected = new Map(); // socketId -> username
const userSockets = new Map();      // username -> Set of socketIds

function broadcastUserList() {
    const online = new Set(socketsConnected.values());
    const list = Object.keys(users).map(u => ({ username: u, online: online.has(u) }));
    io.emit('users', list);
}

// SOCKET AUTH
io.use((socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies.token;
    if (!token) return next(new Error('authentication error'));
    try {
        socket.username = jwt.verify(token, JWT_SECRET).username;
        next();
    } catch {
        next(new Error('authentication error'));
    }
});

// SOCKET EVENTS
io.on('connection', (socket) => {
    console.log('[SOCKET] Connected:', socket.username);

    socketsConnected.set(socket.id, socket.username);
    if (!userSockets.has(socket.username)) userSockets.set(socket.username, new Set());
    userSockets.get(socket.username).add(socket.id);

    io.emit('client-count', socketsConnected.size);
    broadcastUserList();

    // Send message
    socket.on('message', (data) => {
        if (!data || !data.to || typeof data.text !== 'string') return;
        const content = data.text.trim();
        if (!content) return;

        const msg = {
            from: socket.username,
            to: data.to,
            type: 'text',
            content,
            time: Date.now(),
            read: false,
            readAt: null
        };

        // Include reply context if provided
        if (data.replyTo) {
            msg.replyTo = data.replyTo;
        }

        chatHistory.push(msg);
        saveState();

        // Send to recipient(s)
        const recips = userSockets.get(data.to);
        if (recips) recips.forEach(id => io.to(id).emit('message', msg));

        // Echo back to sender
        socket.emit('message', msg);
    });

    // Send image
    socket.on('image', (data) => {
        if (!data || !data.to || !data.base64) return;
        // Basic size check: ~5MB base64 limit
        if (data.base64.length > 7 * 1024 * 1024) {
            return socket.emit('error', { message: 'Image too large (max ~5MB)' });
        }

        const msg = {
            from: socket.username,
            to: data.to,
            type: 'image',
            content: data.base64,
            time: Date.now(),
            read: false,
            readAt: null
        };
        chatHistory.push(msg);
        saveState();

        const recips = userSockets.get(data.to);
        if (recips) recips.forEach(id => io.to(id).emit('image', msg));
        socket.emit('image', msg);
    });

    // Send voice
    socket.on('voice', (data) => {
        if (!data || !data.to || !data.base64) return;

        const msg = {
            from: socket.username,
            to: data.to,
            type: 'voice',
            content: data.base64,
            time: Date.now(),
            read: false,
            readAt: null
        };
        chatHistory.push(msg);
        saveState();

        const recips = userSockets.get(data.to);
        if (recips) recips.forEach(id => io.to(id).emit('voice', msg));
        socket.emit('voice', msg);
    });

    // Mark messages as read
    socket.on('mark-read', (data) => {
        if (!data || !data.from) return;
        const fromUser = data.from;
        const now = Date.now();
        let changed = false;
        
        chatHistory.forEach(m => {
            if (m.from === fromUser && m.to === socket.username && !m.read) {
                m.read = true;
                m.readAt = now;
                changed = true;
            }
        });
        
        if (changed) {
            saveState();
            // notify sender that msgs are read
            const senderSockets = userSockets.get(fromUser);
            if (senderSockets) {
                senderSockets.forEach(id => io.to(id).emit('msgs-read', {
                    from: socket.username,
                    readAt: now
                }));
            }
        }
    });

    // Get unseen count for a user
    socket.on('get-unseen', (targetUser) => {
        if (typeof targetUser !== 'string') return;
        const count = chatHistory.filter(m => 
            m.from === targetUser && m.to === socket.username && !m.read
        ).length;
        socket.emit('unseen-count', { user: targetUser, count });
    });

    socket.on('get-history', (targetUser) => {
        if (typeof targetUser !== 'string') return;
        const msgs = chatHistory.filter(m =>
            (m.from === socket.username && m.to === targetUser) ||
            (m.from === targetUser && m.to === socket.username)
        );
        socket.emit('history', msgs);
    });

    // Typing indicator
    socket.on('typing', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) recips.forEach(id =>
            io.to(id).emit('typing', { from: socket.username, active: !!data.active })
        );
    });

    // Audio Call Signaling
    socket.on('call-initiate', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('call-initiate', {
                from: socket.username,
                offer: data.offer
            }));
        }
    });

    socket.on('call-answer', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('call-answer', {
                from: socket.username,
                answer: data.answer
            }));
        }
    });

    socket.on('ice-candidate', (data) => {
        if (!data || !data.to || !data.candidate) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('ice-candidate', {
                from: socket.username,
                candidate: data.candidate
            }));
        }
    });

    socket.on('call-reject', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('call-reject', {
                from: socket.username
            }));
        }
    });

    socket.on('call-end', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('call-end', {
                from: socket.username
            }));
        }
    });

    // Video Call Signaling
    socket.on('video-call-initiate', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('video-call-initiate', {
                from: socket.username,
                offer: data.offer
            }));
        }
    });

    socket.on('video-call-answer', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('video-call-answer', {
                from: socket.username,
                answer: data.answer
            }));
        }
    });

    socket.on('video-call-ice-candidate', (data) => {
        if (!data || !data.to || !data.candidate) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('video-call-ice-candidate', {
                from: socket.username,
                candidate: data.candidate
            }));
        }
    });

    socket.on('video-call-reject', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('video-call-reject', {
                from: socket.username
            }));
        }
    });

    socket.on('video-call-end', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('video-call-end', {
                from: socket.username
            }));
        }
    });

    socket.on('screen-share-toggle', (data) => {
        if (!data || !data.to) return;
        const recips = userSockets.get(data.to);
        if (recips) {
            recips.forEach(id => io.to(id).emit('screen-share-toggle', {
                from: socket.username,
                active: data.active
            }));
        }
    });

    socket.on('disconnect', () => {
        console.log('[SOCKET] Disconnected:', socket.username);
        socketsConnected.delete(socket.id);
        const set = userSockets.get(socket.username);
        if (set) {
            set.delete(socket.id);
            if (set.size === 0) userSockets.delete(socket.username);
        }
        io.emit('client-count', socketsConnected.size);
        broadcastUserList();
    });
});