// chat-module.js
import { io } from 'socket.io-client';

let socket = null;
let currentProjectId = null;
let currentUser = null;

// Kết nối WebSocket realtime (dùng Supabase Realtime hoặc Socket.io)
export function initChat(projectId, user) {
    currentProjectId = projectId;
    currentUser = user;
    
    // Cách 1: Dùng Supabase Realtime (đơn giản)
    const supabase = getSupabase();
    
    supabase
        .channel(`chat-${projectId}`)
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `project_id=eq.${projectId}` },
            (payload) => {
                displayNewMessage(payload.new);
            }
        )
        .subscribe();
    
    // Tải lịch sử chat
    loadChatHistory();
}

async function loadChatHistory() {
    const supabase = getSupabase();
    const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('project_id', currentProjectId)
        .order('created_at', { ascending: true })
        .limit(100);
    
    data.forEach(msg => displayNewMessage(msg));
}

async function sendMessage(message, imageBase64 = null) {
    let imageUrl = null;
    
    if (imageBase64) {
        // Upload ảnh lên Supabase Storage
        imageUrl = await uploadImage(imageBase64, 'chat_images');
    }
    
    const supabase = getSupabase();
    await supabase.from('chat_messages').insert({
        project_id: currentProjectId,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        message: message,
        image_url: imageUrl
    });
}

function displayNewMessage(msg) {
    const chatContainer = document.getElementById('chat-messages');
    const isOwn = msg.sender_id === currentUser.id;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOwn ? 'own-message' : 'other-message'}`;
    messageDiv.innerHTML = `
        <div class="message-sender">${msg.sender_name}</div>
        <div class="message-text">${escapeHtml(msg.message)}</div>
        ${msg.image_url ? `<img src="${msg.image_url}" class="message-image" onclick="viewImage('${msg.image_url}')">` : ''}
        <div class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
    `;
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function uploadImage(base64, folder) {
    // Sẽ implement ở phần chụp ảnh
}