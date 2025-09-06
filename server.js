require('dotenv').config(); // This must be the first line
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// --- Mongoose Models ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    status: { type: String, default: 'Available' },
    pfpUrl: { type: String, default: '' },
    backgroundUrl: { type: String, default: 'default' }
});
const User = mongoose.model('User', UserSchema);

const MessageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    room: { type: String, index: true },
    convoId: { type: String, index: true },
    from: { type: String, required: true },
    to: { type: String },
    type: { type: String, required: true, enum: ['text', 'file'] },
    text: { type: String },
    fileInfo: {
        url: String,
        name: String,
        type: String
    },
    timestamp: { type: String, required: true }
});
const Message = mongoose.model('Message', MessageSchema);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware & Static Folders ---
app.use(express.static('public'));
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const onlineUsers = {};

// --- Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

// --- Helper Functions ---
const broadcastUserDirectory = async () => {
    try {
        const allDbUsers = await User.find({}, 'username status pfpUrl');
        const allUsersList = allDbUsers.map(user => ({
            username: user.username,
            status: user.status,
            pfpUrl: user.pfpUrl,
            isOnline: !!onlineUsers[user.username]
        }));
        io.emit('update user directory', allUsersList);
    } catch (err) {
        console.error("Error broadcasting user directory:", err);
    }
};

const createTimestamp = () => {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
    });
};

// --- API ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
        if (await User.findOne({ username })) return res.status(400).json({ message: 'User already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username,
            password: hashedPassword,
            pfpUrl: `https://api.dicebear.com/8.x/initials/svg?seed=${username}`
        });
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: "Server error during registration." });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: "Server error during login." });
    }
});

app.post('/update-profile', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const updateData = { status: req.body.status, pfpUrl: req.body.pfpUrl, backgroundUrl: req.body.backgroundUrl };
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
        const updatedUser = await User.findOneAndUpdate({ username: decoded.username }, { $set: updateData }, { new: true });
        io.emit('profile updated', { username: updatedUser.username, status: updatedUser.status, pfpUrl: updatedUser.pfpUrl });
        await broadcastUserDirectory();
        res.json({ message: 'Profile updated successfully' });
    } catch (err) { res.sendStatus(401); }
});

app.post('/upload', upload.single('mediaFile'), async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const target = req.body.target;
        const file = req.file;
        if (!file || !target) return res.status(400).json({ message: 'Invalid request.' });

        const fileUrl = `/uploads/${file.filename}`;
        const messageData = { 
            id: new mongoose.Types.ObjectId().toString(), 
            type: 'file', 
            fileInfo: { url: fileUrl, name: file.originalname, type: file.mimetype }, 
            timestamp: createTimestamp()
        };
        
        if (target.startsWith('#')) {
            messageData.room = target;
            messageData.from = username;
            const message = new Message(messageData);
            await message.save();
            io.to(target).emit('chat message', message.toObject());
        } else {
            messageData.from = username;
            messageData.to = target;
            messageData.convoId = [username, target].sort().join('-');
            const message = new Message(messageData);
            await message.save();
            const targetUser = onlineUsers[target];
            const sender = onlineUsers[username];
            if (sender) io.to(sender.socketId).emit('private message', message.toObject());
            if (targetUser) io.to(targetUser.socketId).emit('private message', message.toObject());
        }
        res.status(201).json({ message: 'File uploaded successfully' });
    } catch (err) { res.sendStatus(401); }
});

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const username = decoded.username;
            const userProfile = await User.findOne({ username });
            if (!userProfile) throw new Error("User not found");

            socket.username = username;
            onlineUsers[username] = { socketId: socket.id };
            socket.join('#general');
            socket.currentRoom = '#general';
            
            await broadcastUserDirectory();
            socket.emit('load user settings', { backgroundUrl: userProfile.backgroundUrl });
            socket.emit('system message', `Welcome, ${username}!`);
            const history = await Message.find({ room: '#general' }).sort({ _id: -1 }).limit(50);
            socket.emit('load history', history.reverse());
            socket.to('#general').emit('system message', `${username} has joined the chat.`);
            
            socket.on('join room', async (room) => {
                socket.leave(socket.currentRoom); socket.join(room); socket.currentRoom = room;
                socket.emit('system message', `You joined the ${room} room.`);
                const history = await Message.find({ room }).sort({ _id: -1 }).limit(50);
                socket.emit('load history', history.reverse());
                socket.to(room).emit('system message', `${socket.username} has joined this room.`);
            });

            socket.on('load dm history', async ({ targetUser }) => {
                const convoId = [socket.username, targetUser].sort().join('-');
                const history = await Message.find({ convoId }).sort({ _id: -1 }).limit(50);
                socket.emit('load history', history.reverse());
            });

            socket.on('chat message', async (msg) => {
                const messageData = { id: new mongoose.Types.ObjectId().toString(), from: socket.username, type: 'text', text: msg, room: socket.currentRoom, timestamp: createTimestamp() };
                const message = new Message(messageData);
                await message.save();
                io.to(socket.currentRoom).emit('chat message', message.toObject());
            });
            
            socket.on('private message', async ({ to, text }) => {
                const convoId = [socket.username, to].sort().join('-');
                const messageData = { id: new mongoose.Types.ObjectId().toString(), from: socket.username, to, convoId, type: 'text', text, timestamp: createTimestamp() };
                const message = new Message(messageData);
                await message.save();
                const targetUser = onlineUsers[to];
                socket.emit('private message', message.toObject());
                if (targetUser) io.to(targetUser.socketId).emit('private message', message.toObject());
            });

            socket.on('delete message', async ({ roomId, messageId }) => {
                const message = await Message.findOne({ id: messageId });
                if (message && message.from === socket.username) {
                    await Message.deleteOne({ id: messageId });
                    if (roomId.startsWith('#')) {
                        io.to(roomId).emit('message deleted', messageId);
                    } else {
                        const targetUser = onlineUsers[roomId];
                        socket.emit('message deleted', messageId);
                        if (targetUser) io.to(targetUser.socketId).emit('message deleted', messageId);
                    }
                }
            });

            socket.on('disconnect', async () => {
                if (socket.username) {
                    delete onlineUsers[socket.username];
                    await broadcastUserDirectory();
                    io.emit('system message', `${socket.username} has left the chat.`);
                }
            });
        } catch (err) { socket.emit('auth_error'); socket.disconnect(); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server is listening on port ${PORT}`));