const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Default curated rooms
const DEFAULT_ROOMS = ['lounge-encrypted', 'general', 'cyber-vault', 'random'];
const rooms = new Set(DEFAULT_ROOMS);

// Helper to sanitize room names
function sanitizeRoomName(name) {
    if (!name || typeof name !== 'string') return 'lounge-encrypted';
    const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 30);
    return cleaned || 'lounge-encrypted';
}

// Helper to get rooms summary with online counts
function getRoomsInfo() {
    const list = [];
    for (const roomName of rooms) {
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        let count = 0;
        if (roomSockets) {
            for (const sid of roomSockets) {
                const s = io.sockets.sockets.get(sid);
                if (s && s.username) count++;
            }
        }
        list.push({
            name: roomName,
            userCount: count,
            isDefault: DEFAULT_ROOMS.includes(roomName)
        });
    }
    return list;
}

function broadcastRoomList() {
    io.emit('room_list', getRoomsInfo());
}

function broadcastRoomUsers(roomName) {
    if (!roomName) return;
    const roomSockets = io.sockets.adapter.rooms.get(roomName);
    const users = [];
    if (roomSockets) {
        for (const sid of roomSockets) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.username) {
                users.push({ id: s.id, username: s.username });
            }
        }
    }
    io.to(roomName).emit('user_list', { room: roomName, users });
}

function handleJoinRoom(socket, targetRoom) {
    const sanitized = sanitizeRoomName(targetRoom);
    rooms.add(sanitized);

    // If socket is already in this room, do nothing
    if (socket.currentRoom === sanitized) {
        return;
    }

    const previousRoom = socket.currentRoom;
    if (previousRoom) {
        socket.leave(previousRoom);
        io.to(previousRoom).emit('chat_message', {
            username: 'System',
            text: `${socket.username} left the room`,
            type: 'system',
            room: previousRoom,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        broadcastRoomUsers(previousRoom);
    }

    socket.currentRoom = sanitized;
    socket.join(sanitized);

    // Notify client of room transition
    socket.emit('room_joined', { room: sanitized });

    // Key exchange protocol for this room:
    // Check if other users with username & public key already exist in this room
    const roomSockets = io.sockets.adapter.rooms.get(sanitized);
    const peers = [];
    if (roomSockets) {
        for (const sid of roomSockets) {
            if (sid !== socket.id) {
                const s = io.sockets.sockets.get(sid);
                if (s && s.username && s.publicKey) {
                    peers.push(s);
                }
            }
        }
    }

    if (peers.length > 0) {
        // Request existing member to share the room key
        io.to(peers[0].id).emit('request_key_share', {
            targetId: socket.id,
            publicKey: socket.publicKey,
            room: sanitized
        });
    } else {
        // First participant in this room: generate the room's master AES key
        socket.emit('generate_group_key', { room: sanitized });
    }

    io.to(sanitized).emit('chat_message', {
        username: 'System',
        text: `${socket.username} joined #${sanitized}. E2E Encryption Active 🔒`,
        type: 'system',
        room: sanitized,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    broadcastRoomUsers(sanitized);
    broadcastRoomList();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send initial rooms list on connect
    socket.emit('room_list', getRoomsInfo());

    // Prompt for username and setup E2EE
    socket.on('set_username', (data) => {
        socket.username = data.username;
        socket.publicKey = data.publicKey; // Store public key

        const initialRoom = sanitizeRoomName(data.room || 'lounge-encrypted');
        handleJoinRoom(socket, initialRoom);
    });

    // Switch or create room
    socket.on('join_room', (data) => {
        if (!socket.username) return;
        const targetRoom = sanitizeRoomName(data.room);
        handleJoinRoom(socket, targetRoom);
    });

    // Route the encrypted group key for a specific room to the target user
    socket.on('share_group_key', (data) => {
        io.to(data.targetId).emit('receive_group_key', {
            encryptedKey: data.encryptedKey,
            room: data.room
        });
    });

    socket.on('key_share_failed', (data) => {
        // Fallback: ask target to generate key if peer didn't have it
        io.to(data.targetId).emit('generate_group_key', { room: data.room });
    });

    socket.on('chat_message', (data) => {
        const room = data.room || socket.currentRoom;
        if (!room) return;
        io.to(room).emit('chat_message', {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            username: socket.username || 'Anonymous',
            encryptedText: data.encryptedText,
            iv: data.iv,
            room: room,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'user'
        });
    });

    socket.on('chat_media', (data) => {
        const room = data.room || socket.currentRoom;
        if (!room) return;
        io.to(room).emit('chat_media', {
            id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            username: socket.username || 'Anonymous',
            encryptedFileData: data.encryptedFileData,
            iv: data.iv,
            fileType: data.fileType,
            fileName: data.fileName || 'attachment',
            room: room,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'user'
        });
    });

    socket.on('typing', (data) => {
        const room = (data && data.room) || socket.currentRoom;
        if (socket.username && room) {
            socket.to(room).emit('user_typing', { username: socket.username, room });
        }
    });

    socket.on('stop_typing', (data) => {
        const room = (data && data.room) || socket.currentRoom;
        if (socket.username && room) {
            socket.to(room).emit('user_stop_typing', { username: socket.username, room });
        }
    });

    socket.on('message_reaction', (data) => {
        const room = data.room || socket.currentRoom;
        if (!room) return;
        io.to(room).emit('message_reaction', {
            messageId: data.messageId,
            emoji: data.emoji,
            username: socket.username || 'Anonymous',
            room: room
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.username && socket.currentRoom) {
            io.to(socket.currentRoom).emit('chat_message', {
                username: 'System',
                text: `${socket.username} left the room`,
                type: 'system',
                room: socket.currentRoom,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            const leftRoom = socket.currentRoom;
            socket.currentRoom = null;
            broadcastRoomUsers(leftRoom);
        }
        broadcastRoomList();
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
