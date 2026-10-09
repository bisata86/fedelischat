const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Broadcast active users helper
    function broadcastUserList() {
        const users = Array.from(io.sockets.sockets.values())
            .filter(s => s.username)
            .map(s => ({ id: s.id, username: socket.username === s.username ? s.username : s.username }));
        io.emit('user_list', users);
    }

    // Prompt for username and setup E2EE
    socket.on('set_username', (data) => {
        socket.username = data.username;
        socket.publicKey = data.publicKey; // Store their public key

        const otherSockets = Array.from(io.sockets.sockets.values())
            .filter(s => s.id !== socket.id && s.username);
            
        if (otherSockets.length > 0) {
            // Ask the first existing user to share the group key
            io.to(otherSockets[0].id).emit('request_key_share', {
                targetId: socket.id,
                publicKey: data.publicKey
            });
        } else {
            // This is the first user, tell them to generate the group key
            socket.emit('generate_group_key');
        }

        io.emit('chat_message', {
            username: 'System',
            text: `${data.username} joined the chat. E2E Encryption Active 🔒`,
            type: 'system',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        broadcastUserList();
    });

    // Route the encrypted group key to the new user
    socket.on('share_group_key', (data) => {
        io.to(data.targetId).emit('receive_group_key', {
            encryptedKey: data.encryptedKey
        });
    });

    socket.on('chat_message', (data) => {
        io.emit('chat_message', {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            username: socket.username || 'Anonymous',
            encryptedText: data.encryptedText,
            iv: data.iv,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'user'
        });
    });

    socket.on('chat_media', (data) => {
        io.emit('chat_media', {
            id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            username: socket.username || 'Anonymous',
            encryptedFileData: data.encryptedFileData,
            iv: data.iv,
            fileType: data.fileType,
            fileName: data.fileName || 'attachment',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'user'
        });
    });

    socket.on('typing', () => {
        if (socket.username) {
            socket.broadcast.emit('user_typing', { username: socket.username });
        }
    });

    socket.on('stop_typing', () => {
        if (socket.username) {
            socket.broadcast.emit('user_stop_typing', { username: socket.username });
        }
    });

    socket.on('message_reaction', (data) => {
        io.emit('message_reaction', {
            messageId: data.messageId,
            emoji: data.emoji,
            username: socket.username || 'Anonymous'
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.username) {
            io.emit('chat_message', {
                username: 'System',
                text: `${socket.username} left the chat`,
                type: 'system',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            broadcastUserList();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
