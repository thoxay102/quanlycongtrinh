// auth-simple.js - Hệ thống user đơn giản

let currentUser = null;
let currentUserRole = null;

function getSupabaseClient() {
    if (window.supabaseClient) return window.supabaseClient;
    const config = getSupabaseConfig();
    if (!config) return null;
    window.supabaseClient = supabase.createClient(config.url, config.anonKey);
    return window.supabaseClient;
}

// Hàm hash mật khẩu đơn giản (trong thực tế nên dùng bcrypt)
// Tạm thời dùng base64 để demo
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'salt_123'); // Thêm salt cố định
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function verifyPassword(password, hash) {
    const newHash = await hashPassword(password);
    return newHash === hash;
}

// QUYỀN HẠN
let PERMISSIONS = {
    admin: {
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canManageUsers: true
    },
    manager: {
        canView: true,
        canCreate: true,     // Manager được tạo chấm công, nhân công
        canUpdate: false,    // Không được sửa
        canDelete: false,    // Không được xóa
        canManageUsers: false
    },
    user: {
        canView: true,       // Chỉ xem
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canManageUsers: false
    }
};

function hasPermission(action) {
    if (!currentUserRole) return false;
    return PERMISSIONS[currentUserRole][action] === true;
}

// ĐĂNG NHẬP
async function login(username, password) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Chưa cấu hình Supabase');
        
        // Tìm user theo username
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('is_active', true)
            .limit(1);
        
        if (error) throw error;
        if (!users || users.length === 0) {
            return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
        }
        
        const user = users[0];
        
        // Kiểm tra mật khẩu (tạm thời so sánh trực tiếp)
        // Trong thực tế nên dùng bcrypt
        if (password !== user.password) { // Tạm thời dùng plain text
            return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
        }
        
        currentUser = {
            id: user.id,
            username: user.username,
            fullname: user.fullname,
            role: user.role
        };
        currentUserRole = user.role;
        
        console.log('Login successful:', currentUser);
        
        // Lưu session
        localStorage.setItem('user_session', JSON.stringify({
            id: currentUser.id,
            username: currentUser.username,
            fullname: currentUser.fullname,
            role: currentUserRole
        }));
        
        window.currentUser = currentUser;
        window.currentUserRole = currentUserRole;
        
        return { success: true, user: currentUser };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

// ĐĂNG XUẤT
async function logout() {
    currentUser = null;
    currentUserRole = null;
    window.currentUser = null;
    window.currentUserRole = null;
    localStorage.removeItem('user_session');
    window.location.href = 'login.html';
}

// KHÔI PHỤC SESSION
async function restoreSession() {
    const saved = localStorage.getItem('user_session');
    if (saved) {
        const session = JSON.parse(saved);
        currentUser = session;
        currentUserRole = session.role;
        window.currentUser = currentUser;
        window.currentUserRole = currentUserRole;
        console.log('Session restored, role:', currentUserRole);
        return true;
    }
    return false;
}

// LẤY DANH SÁCH USER (chỉ admin)
async function getUsers() {
    if (!hasPermission('canManageUsers')) {
        return { success: false, error: 'Không có quyền' };
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id, username, fullname, role, is_active, created_at')
        .order('created_at', { ascending: false });
    return { success: !error, data, error };
}

// CẬP NHẬT ROLE USER (chỉ admin)
async function updateUserRole(userId, newRole) {
    if (!hasPermission('canManageUsers')) {
        return { success: false, error: 'Không có quyền' };
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('users')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);
    return { success: !error, error };
}

// TẠO USER MỚI (chỉ admin)
async function registerNewUser(username, password, fullname, role = 'user') {
    if (!hasPermission('canManageUsers')) {
        return { success: false, error: 'Không có quyền tạo user' };
    }
    
    const supabase = getSupabaseClient();
    
    // Kiểm tra username đã tồn tại
    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .limit(1);
    
    if (existing && existing.length > 0) {
        return { success: false, error: 'Tên đăng nhập đã tồn tại' };
    }
    
    // Tạo user mới (tạm thời lưu plain text, nên dùng hash trong thực tế)
    const { data, error } = await supabase
        .from('users')
        .insert({
            username: username,
            fullname: fullname || username,
            password: password, // Tạm thời plain text
            role: role,
            is_active: true
        })
        .select()
        .single();
    
    if (error) return { success: false, error: error.message };
    return { success: true, user: data };
}

// XÓA USER (chỉ admin)
async function deleteUser(userId) {
    if (!hasPermission('canManageUsers')) {
        return { success: false, error: 'Không có quyền' };
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
    return { success: !error, error };
}

// Export
window.auth = {
    login,
    logout,
    restoreSession,
    getUsers,
    updateUserRole,
    registerNewUser,
    deleteUser,
    hasPermission,
    getCurrentUser: () => currentUser,
    getCurrentRole: () => currentUserRole
};

console.log('auth-simple.js loaded');