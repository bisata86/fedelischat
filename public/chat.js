// ==========================================
// Fedelissimi Chat — Core Application Logic
// ==========================================

const socket = io();

// UI Elements
const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const cryptoStatusStep = document.getElementById('crypto-status-step');
const cryptoStepText = document.getElementById('crypto-step-text');

const chatArea = document.getElementById('chat-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const mediaBtn = document.getElementById('media-btn');
const mediaInput = document.getElementById('media-input');
const clearChatBtn = document.getElementById('clear-chat-btn');

const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const usersList = document.getElementById('users-list');
const activeUserCount = document.getElementById('active-user-count');
const roomOnlineText = document.getElementById('room-online-text');

const myAvatarDisplay = document.getElementById('my-avatar-display');
const myUsernameDisplay = document.getElementById('my-username-display');

const soundToggleBtn = document.getElementById('sound-toggle-btn');
const soundIconOn = document.getElementById('sound-icon-on');
const soundIconOff = document.getElementById('sound-icon-off');

const securityCardTrigger = document.getElementById('security-card-trigger');
const securityInfoBtn = document.getElementById('security-info-btn');
const securityModal = document.getElementById('security-modal');
const closeSecurityBtn = document.getElementById('close-security-btn');
const secPubkeyFingerprint = document.getElementById('sec-pubkey-fingerprint');

const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxDownload = document.getElementById('lightbox-download');
const closeLightboxBtn = document.getElementById('close-lightbox-btn');

const gifBtn = document.getElementById('gif-btn');
const gifPopover = document.getElementById('gif-popover');
const gifSearchInput = document.getElementById('gif-search-input');
const gifGrid = document.getElementById('gif-grid');

const emojiBtn = document.getElementById('emoji-btn');
const emojiPopover = document.getElementById('emoji-popover');
const emojiSearchInput = document.getElementById('emoji-search-input');
const emojiGrid = document.getElementById('emoji-grid');

const typingIndicator = document.getElementById('typing-indicator');
const typingUserText = document.getElementById('typing-user-text');
const dragDropOverlay = document.getElementById('drag-drop-overlay');

// Application State
let currentUsername = '';
let rsaKeyPair = null;
let aesGroupKey = null;
let soundEnabled = localStorage.getItem('fedelissimi_sound') !== 'false';
let typingTimeout = null;
const userMessageMap = new Map(); // stores reactions per message

// Palette for avatar gradients
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #3b82f6, #06b6d4)',
    'linear-gradient(135deg, #ec4899, #f43f5e)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #8b5cf6, #d946ef)'
];

function getAvatarStyle(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[index];
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

// ==========================================
// Web Audio API Procedural Chimes
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type = 'receive') {
    if (!soundEnabled) return;
    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'send') {
            // Crisp soft high blip
            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else {
            // Warm glass chime
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(659.25, now); // E5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.start(now);
            osc.stop(now + 0.18);
        }
    } catch (e) {
        // Audio policy ignore
    }
}

// Sound toggle handler
function updateSoundUI() {
    if (soundEnabled) {
        soundToggleBtn.classList.add('active');
        soundIconOn.style.display = 'block';
        soundIconOff.style.display = 'none';
        soundToggleBtn.title = "Audio notification enabled (Click to mute)";
    } else {
        soundToggleBtn.classList.remove('active');
        soundIconOn.style.display = 'none';
        soundIconOff.style.display = 'block';
        soundToggleBtn.title = "Audio notification muted (Click to enable)";
    }
}
updateSoundUI();

soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('fedelissimi_sound', soundEnabled);
    updateSoundUI();
});

// ==========================================
// Cryptography Implementations (Web Crypto API)
// ==========================================
async function generateRSA() {
    return await window.crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["encrypt", "decrypt"]
    );
}

async function generateAES() {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function exportKey(key) {
    return await window.crypto.subtle.exportKey("jwk", key);
}

async function importPublicKey(jwk) {
    return await window.crypto.subtle.importKey(
        "jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
    );
}

async function exportAESKey(key) {
    return await window.crypto.subtle.exportKey("raw", key);
}

async function importAESKey(raw) {
    return await window.crypto.subtle.importKey(
        "raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
    );
}

async function encryptRSA(publicKey, data) {
    return await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        data
    );
}

async function decryptRSA(privateKey, encryptedData) {
    return await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        encryptedData
    );
}

async function encryptAES(key, text) {
    const encoder = new TextEncoder();
    const data = typeof text === 'string' ? encoder.encode(text) : new Uint8Array(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
    );
    return { encrypted: Array.from(new Uint8Array(encrypted)), iv: Array.from(iv) };
}

async function decryptAES(key, encryptedArray, ivArray, isString = true) {
    if (!encryptedArray || !ivArray) return null;
    const encrypted = new Uint8Array(encryptedArray);
    const iv = new Uint8Array(ivArray);
    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encrypted
        );
        if (isString) {
            return new TextDecoder().decode(decrypted);
        }
        return decrypted;
    } catch (e) {
        console.error("Decryption failed", e);
        return isString ? "[Decryption failed]" : null;
    }
}

async function computeKeyFingerprint(jwk) {
    const jsonStr = JSON.stringify(jwk);
    const msgBuffer = new TextEncoder().encode(jsonStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

// ==========================================
// Onboarding / Join Room
// ==========================================
async function joinChat() {
    const username = usernameInput.value.trim();
    if (!username) {
        usernameInput.focus();
        return;
    }

    joinBtn.disabled = true;
    cryptoStatusStep.style.display = 'flex';
    cryptoStepText.textContent = "Generating 2048-bit RSA keys...";

    try {
        // Step 1: Generate RSA Keypair
        rsaKeyPair = await generateRSA();
        const jwkPublic = await exportKey(rsaKeyPair.publicKey);
        const fingerprint = await computeKeyFingerprint(jwkPublic);
        secPubkeyFingerprint.textContent = fingerprint;

        cryptoStepText.textContent = "Establishing E2EE channel...";
        await new Promise(r => setTimeout(r, 350));

        currentUsername = username;

        // Step 2: Inform server with public key
        socket.emit('set_username', { username, publicKey: jwkPublic });

        // Step 3: Update local UI
        myUsernameDisplay.textContent = username;
        myAvatarDisplay.textContent = getInitials(username);
        myAvatarDisplay.style.background = getAvatarStyle(username);

        // Smooth fade out of overlay
        loginOverlay.style.opacity = '0';
        loginOverlay.style.transform = 'scale(1.04)';
        setTimeout(() => {
            loginOverlay.style.visibility = 'hidden';
        }, 500);

        messageInput.disabled = false;
        sendBtn.disabled = false;
        mediaBtn.disabled = false;
        gifBtn.disabled = false;
        emojiBtn.disabled = false;
        messageInput.focus();
    } catch (err) {
        console.error("Initialization error:", err);
        cryptoStepText.textContent = "Error setting up keys. Please retry.";
        joinBtn.disabled = false;
    }
}

joinBtn.addEventListener('click', joinChat);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

// ==========================================
// E2EE Socket Protocol
// ==========================================
socket.on('generate_group_key', async () => {
    aesGroupKey = await generateAES();
    console.log("🔐 Generated group master key (First participant)");
});

socket.on('request_key_share', async (data) => {
    if (!aesGroupKey) return;
    try {
        const targetPubKey = await importPublicKey(data.publicKey);
        const rawAes = await exportAESKey(aesGroupKey);
        const encryptedAes = await encryptRSA(targetPubKey, rawAes);

        socket.emit('share_group_key', {
            targetId: data.targetId,
            encryptedKey: Array.from(new Uint8Array(encryptedAes))
        });
    } catch (e) {
        console.error("Error sharing group key:", e);
    }
});

socket.on('receive_group_key', async (data) => {
    try {
        const encryptedBytes = new Uint8Array(data.encryptedKey);
        const rawAes = await decryptRSA(rsaKeyPair.privateKey, encryptedBytes);
        aesGroupKey = await importAESKey(rawAes);
        console.log("🔓 Received and decrypted group AES session key!");
    } catch (e) {
        console.error("Error receiving key:", e);
    }
});

// ==========================================
// Online Users & Room State
// ==========================================
socket.on('user_list', (users) => {
    usersList.innerHTML = '';
    activeUserCount.textContent = users.length;
    roomOnlineText.textContent = `${users.length} participant${users.length === 1 ? '' : 's'} online`;

    users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'user-item';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.background = getAvatarStyle(u.username);
        avatar.textContent = getInitials(u.username);

        const dot = document.createElement('div');
        dot.className = 'online-indicator';
        avatar.appendChild(dot);

        const textDiv = document.createElement('div');
        textDiv.className = 'user-info-text';

        const nameLine = document.createElement('div');
        nameLine.className = 'user-name-line';
        nameLine.textContent = u.username;

        if (u.username === currentUsername) {
            const youTag = document.createElement('span');
            youTag.className = 'you-tag';
            youTag.textContent = 'YOU';
            nameLine.appendChild(youTag);
        }

        textDiv.appendChild(nameLine);
        item.appendChild(avatar);
        item.appendChild(textDiv);
        usersList.appendChild(item);
    });
});

// ==========================================
// Typing Indicators
// ==========================================
let isTyping = false;
messageInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing');
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('stop_typing');
    }, 1500);
});

socket.on('user_typing', (data) => {
    if (data.username !== currentUsername) {
        typingUserText.textContent = `${data.username} is typing...`;
        typingIndicator.classList.add('visible');
    }
});

socket.on('user_stop_typing', () => {
    typingIndicator.classList.remove('visible');
});

// ==========================================
// Sending Text & Media
// ==========================================
async function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg) return;

    if (!aesGroupKey) {
        alert("Establishing encryption handshake... please wait a moment.");
        return;
    }

    try {
        const { encrypted, iv } = await encryptAES(aesGroupKey, msg);
        socket.emit('chat_message', {
            encryptedText: encrypted,
            iv: iv
        });
        messageInput.value = '';
        messageInput.focus();
        isTyping = false;
        socket.emit('stop_typing');
        playSound('send');
    } catch (e) {
        console.error("Send error:", e);
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Media attachment processing
async function sendFile(file) {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit.');
        return;
    }

    if (!aesGroupKey) {
        alert("Encryption handshake not ready yet.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const { encrypted, iv } = await encryptAES(aesGroupKey, ev.target.result);
            socket.emit('chat_media', {
                encryptedFileData: encrypted,
                iv: iv,
                fileType: file.type,
                fileName: file.name
            });
            playSound('send');
        } catch (err) {
            console.error("Media send error:", err);
        }
    };
    reader.readAsDataURL(file);
}

mediaBtn.addEventListener('click', () => mediaInput.click());
mediaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        sendFile(file);
        mediaInput.value = '';
    }
});

// Clipboard paste image support
window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            sendFile(file);
            break;
        }
    }
});

// Drag and drop file support
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragDropOverlay.classList.add('active');
});

window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
        dragDropOverlay.classList.remove('active');
    }
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDropOverlay.classList.remove('active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        sendFile(e.dataTransfer.files[0]);
    }
});

// ==========================================
// Rendering Messages & Reactions
// ==========================================
function appendMessage(wrapper) {
    chatArea.appendChild(wrapper);
    chatArea.scrollTo({
        top: chatArea.scrollHeight,
        behavior: 'smooth'
    });
}

function createHoverActionBar(messageId, textToCopy = null) {
    const bar = document.createElement('div');
    bar.className = 'message-actions-bar';

    const emojis = ['❤️', '😂', '🔥', '👍', '🔒'];
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn-mini';
        btn.textContent = emoji;
        btn.title = `React with ${emoji}`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            socket.emit('message_reaction', { messageId, emoji });
        });
        bar.appendChild(btn);
    });

    if (textToCopy) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn-mini';
        copyBtn.title = "Copy message";
        copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(textToCopy);
            copyBtn.style.color = '#10b981';
            setTimeout(() => { copyBtn.style.color = ''; }, 1000);
        });
        bar.appendChild(copyBtn);
    }

    return bar;
}

// Receive Text Messages
socket.on('chat_message', async (data) => {
    const isSelf = data.username === currentUsername;
    const isSystem = data.type === 'system';

    const wrapper = document.createElement('div');
    wrapper.id = data.id || ('msg_' + Date.now());
    wrapper.className = `message-wrapper ${isSystem ? 'system-wrapper' : isSelf ? 'my-wrapper' : 'other-wrapper'}`;

    if (isSystem) {
        const badge = document.createElement('div');
        badge.className = 'system-badge';
        badge.textContent = data.text;
        wrapper.appendChild(badge);
        appendMessage(wrapper);
        return;
    }

    // Avatar (for others)
    if (!isSelf) {
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.style.background = getAvatarStyle(data.username);
        avatar.textContent = getInitials(data.username);
        wrapper.appendChild(avatar);
    }

    // Content container
    const contentBox = document.createElement('div');
    contentBox.className = 'message-content-box';

    // Metadata (name & time)
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `
        <span class="message-sender">${isSelf ? 'You' : data.username}</span>
        <span class="message-time">${data.time || ''}</span>
    `;
    contentBox.appendChild(meta);

    // Decrypt content
    let plainText = "[Encrypted Content]";
    if (aesGroupKey) {
        plainText = await decryptAES(aesGroupKey, data.encryptedText, data.iv);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = plainText;
    contentBox.appendChild(bubble);

    // Hover action bar
    const actionBar = createHoverActionBar(wrapper.id, plainText);
    bubble.appendChild(actionBar);

    // Reactions container
    const reactionsBox = document.createElement('div');
    reactionsBox.className = 'reactions-container';
    reactionsBox.id = `reactions_${wrapper.id}`;
    contentBox.appendChild(reactionsBox);

    wrapper.appendChild(contentBox);
    appendMessage(wrapper);

    if (!isSelf) {
        playSound('receive');
    }
});

// Receive Media Messages
socket.on('chat_media', async (data) => {
    const isSelf = data.username === currentUsername;

    const wrapper = document.createElement('div');
    wrapper.id = data.id || ('media_' + Date.now());
    wrapper.className = `message-wrapper ${isSelf ? 'my-wrapper' : 'other-wrapper'}`;

    if (!isSelf) {
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.style.background = getAvatarStyle(data.username);
        avatar.textContent = getInitials(data.username);
        wrapper.appendChild(avatar);
    }

    const contentBox = document.createElement('div');
    contentBox.className = 'message-content-box';

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `
        <span class="message-sender">${isSelf ? 'You' : data.username}</span>
        <span class="message-time">${data.time || ''}</span>
    `;
    contentBox.appendChild(meta);

    let mediaDataUrl = null;
    if (aesGroupKey) {
        mediaDataUrl = await decryptAES(aesGroupKey, data.encryptedFileData, data.iv);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (mediaDataUrl && !mediaDataUrl.includes("[Decryption failed]")) {
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-container';

        if (data.fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = mediaDataUrl;
            img.className = 'message-media-img';
            img.alt = 'Encrypted media';

            if (data.fileType === 'image/gif') {
                const gifBadge = document.createElement('span');
                gifBadge.className = 'media-badge-gif';
                gifBadge.textContent = 'GIF';
                mediaContainer.appendChild(gifBadge);
            }

            img.addEventListener('click', () => {
                lightboxImage.src = mediaDataUrl;
                lightboxDownload.href = mediaDataUrl;
                lightboxModal.classList.add('open');
            });

            mediaContainer.appendChild(img);
        } else if (data.fileType.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = mediaDataUrl;
            video.className = 'message-media-video';
            video.controls = true;
            mediaContainer.appendChild(video);
        }

        bubble.appendChild(mediaContainer);
    } else {
        bubble.textContent = "[Encrypted Media — Decryption Failed]";
    }

    const actionBar = createHoverActionBar(wrapper.id, null);
    bubble.appendChild(actionBar);

    const reactionsBox = document.createElement('div');
    reactionsBox.className = 'reactions-container';
    reactionsBox.id = `reactions_${wrapper.id}`;
    contentBox.appendChild(reactionsBox);

    wrapper.appendChild(contentBox);
    appendMessage(wrapper);

    if (!isSelf) {
        playSound('receive');
    }
});

// Socket Reactions Broadcast
socket.on('message_reaction', (data) => {
    const reactionsBox = document.getElementById(`reactions_${data.messageId}`);
    if (!reactionsBox) return;

    if (!userMessageMap.has(data.messageId)) {
        userMessageMap.set(data.messageId, {});
    }
    const msgReactions = userMessageMap.get(data.messageId);

    if (!msgReactions[data.emoji]) {
        msgReactions[data.emoji] = new Set();
    }

    const userSet = msgReactions[data.emoji];
    if (userSet.has(data.username)) {
        userSet.delete(data.username);
    } else {
        userSet.add(data.username);
    }

    // Render reactions
    reactionsBox.innerHTML = '';
    Object.keys(msgReactions).forEach(emoji => {
        const count = msgReactions[emoji].size;
        if (count > 0) {
            const pill = document.createElement('button');
            const hasReacted = msgReactions[emoji].has(currentUsername);
            pill.className = `reaction-pill ${hasReacted ? 'reacted' : ''}`;
            pill.innerHTML = `<span>${emoji}</span> <span>${count}</span>`;
            pill.title = Array.from(msgReactions[emoji]).join(', ');
            pill.addEventListener('click', () => {
                socket.emit('message_reaction', {
                    messageId: data.messageId,
                    emoji: emoji
                });
            });
            reactionsBox.appendChild(pill);
        }
    });
});

// ==========================================
// Curated GIF Library & Popover
// ==========================================
const CURATED_GIFS = {
    reactions: [
        'https://media.giphy.com/media/26AHONQCd8P0g1SLm/giphy.gif',
        'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
        'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif',
        'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',
        'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif',
        'https://media.giphy.com/media/11ISwbgCxEzMyY/giphy.gif'
    ],
    celebrate: [
        'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
        'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif',
        'https://media.giphy.com/media/DhstvI3zZ598Nb1rFf/giphy.gif',
        'https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif'
    ],
    hacker: [
        'https://media.giphy.com/media/YQitE4YNQNahy/giphy.gif',
        'https://media.giphy.com/media/eCqFYAVjjDksg/giphy.gif',
        'https://media.giphy.com/media/ule4akeXnY9Fb20IZX/giphy.gif',
        'https://media.giphy.com/media/QbumCX9HFFDQA/giphy.gif'
    ],
    cat: [
        'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/BzyTuYCmvSORqs1ABM/giphy.gif',
        'https://media.giphy.com/media/VbnUQIRNNzrDq/giphy.gif'
    ],
    anime: [
        'https://media.giphy.com/media/12bVDtXPOzYwda/giphy.gif',
        'https://media.giphy.com/media/tHIRLHtNwxpjIFqPdV/giphy.gif',
        'https://media.giphy.com/media/dG7ZiL6ImLyNO/giphy.gif',
        'https://media.giphy.com/media/vnoZnCd4vI7ZC/giphy.gif'
    ],
    memes: [
        'https://media.giphy.com/media/COYGe9rZeciaQ/giphy.gif',
        'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
        'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
        'https://media.giphy.com/media/G6sJqVUPAT7JUlOGGq/giphy.gif'
    ]
};

function renderGifs(category = 'reactions', filterQuery = '') {
    gifGrid.innerHTML = '';
    const list = CURATED_GIFS[category] || CURATED_GIFS.reactions;
    
    list.forEach(url => {
        const item = document.createElement('div');
        item.className = 'gif-grid-item';
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';

        item.addEventListener('click', async () => {
            gifPopover.classList.remove('open');
            // Convert to blob and encrypt
            try {
                const res = await fetch(url);
                const blob = await res.blob();
                const file = new File([blob], 'encrypted.gif', { type: 'image/gif' });
                sendFile(file);
            } catch (e) {
                // Fallback direct base64
                console.error("Error sending gif", e);
            }
        });

        item.appendChild(img);
        gifGrid.appendChild(item);
    });
}

document.querySelectorAll('.gif-cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.gif-cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderGifs(chip.getAttribute('data-cat'));
    });
});

gifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPopover.classList.remove('open');
    gifPopover.classList.toggle('open');
    if (gifPopover.classList.contains('open')) {
        renderGifs();
    }
});

// ==========================================
// Emoji Library & Popover
// ==========================================
const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍',
    '🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩',
    '🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭',
    '😮‍💨','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔',
    '🫣','🤭','🫢','🫡','🤫','🫠','🤐','🤨','😐','😑','😶','🫥','🤝','👍','👎','👊',
    '✊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','💪','🦾','❤️','🧡','💛','💚','💙',
    '💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💖','🔥','✨','🎉','🚀','🔒','🔑','🛡️'
];

function renderEmojis(filter = '') {
    emojiGrid.innerHTML = '';
    const filtered = filter ? EMOJIS.filter(e => e.includes(filter)) : EMOJIS;
    filtered.forEach(em => {
        const item = document.createElement('div');
        item.className = 'emoji-grid-item';
        item.textContent = em;
        item.addEventListener('click', () => {
            messageInput.value += em;
            messageInput.focus();
            emojiPopover.classList.remove('open');
        });
        emojiGrid.appendChild(item);
    });
}

emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    gifPopover.classList.remove('open');
    emojiPopover.classList.toggle('open');
    if (emojiPopover.classList.contains('open')) {
        renderEmojis();
    }
});

emojiSearchInput.addEventListener('input', (e) => {
    renderEmojis(e.target.value);
});

// Close popovers on outer click
document.addEventListener('click', (e) => {
    if (!gifPopover.contains(e.target) && e.target !== gifBtn) {
        gifPopover.classList.remove('open');
    }
    if (!emojiPopover.contains(e.target) && e.target !== emojiBtn) {
        emojiPopover.classList.remove('open');
    }
});

// ==========================================
// Modals & Controls
// ==========================================
// Mobile Sidebar Toggle
sidebarToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('mobile-open');
});

document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && e.target !== sidebarToggleBtn) {
        sidebar.classList.remove('mobile-open');
    }
});

// Security Modal
function openSecurityModal() {
    securityModal.classList.add('open');
}
function closeSecurityModal() {
    securityModal.classList.remove('open');
}
securityCardTrigger.addEventListener('click', openSecurityModal);
securityInfoBtn.addEventListener('click', openSecurityModal);
closeSecurityBtn.addEventListener('click', closeSecurityModal);

// Lightbox Modal
closeLightboxBtn.addEventListener('click', () => {
    lightboxModal.classList.remove('open');
});

// Clear Local Screen
clearChatBtn.addEventListener('click', () => {
    if (confirm("Clear local chat screen? (This does not affect other participants)")) {
        const systemCard = chatArea.querySelector('.e2ee-notice-card');
        chatArea.innerHTML = '';
        if (systemCard) chatArea.appendChild(systemCard);
    }
});

// Close modals on Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSecurityModal();
        lightboxModal.classList.remove('open');
        gifPopover.classList.remove('open');
        emojiPopover.classList.remove('open');
    }
});

// Initial focus
window.addEventListener('DOMContentLoaded', () => {
    usernameInput.focus();
});
