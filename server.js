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

    // Prompt for username
    socket.on('set_username', (username) => {
        socket.username = username;
        io.emit('chat_message', {
            username: 'System',
            text: `${username} joined the chat`,
            type: 'system'
        });
    });

    socket.on('chat_message', (msg) => {
        if (msg.trim().length > 0) {
            io.emit('chat_message', {
                username: socket.username || 'Anonymous',
                text: msg,
                type: 'user'
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.username) {
            io.emit('chat_message', {
                username: 'System',
                text: `${socket.username} left the chat`,
                type: 'system'
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
