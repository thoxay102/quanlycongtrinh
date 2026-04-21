// auth.js
//let currentUser = null;
//let currentUserRole = null;

function getSupabaseClient() {
    if (window.supabaseClient) return window.supabaseClient;
    const config = getSupabaseConfig();
    if (!config) return null;
    window.supabaseClient = supabase.createClient(config.url, config.anonKey);
    return window.supabaseClient;
}

const PERMISSIONS = {
    admin: { canView: true, canCreate: true, canUpdate: true, canDelete: true, canManageUsers: true },
    manager: { canView: true, canCreate: true, canUpdate: false, canDelete: false, canManageUsers: false },
    user: { canView: true, canCreate: false, canUpdate: false, canDelete: false, canManageUsers: false }
};

function hasPermission(action) {
    if (!currentUserRole) return false;
    return PERMISSIONS[currentUserRole][action] === true;
}

// ========== ĐĂNG NHẬP ==========
async function login(username, password) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Chưa cấu hình Supabase');
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('is_active', true)
            .limit(1);
        if (error) throw error;
        if (!users || users.length === 0) return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
        const user = users[0];
        if (password !== user.password) return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
        currentUser = { id: user.id, username: user.username, fullname: user.fullname, role: user.role };
        currentUserRole = user.role;
        localStorage.setItem('user_session', JSON.stringify(currentUser));
        window.currentUser = currentUser;
        window.currentUserRole = currentUserRole;
        return { success: true, user: currentUser };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function logout() {
    localStorage.removeItem('user_session');
    window.location.href = 'login.html';
}

async function restoreSession() {
    const saved = localStorage.getItem('user_session');
    if (saved) {
        const session = JSON.parse(saved);
        currentUser = session;
        currentUserRole = session.role;
        window.currentUser = currentUser;
        window.currentUserRole = currentUserRole;
        return true;
    }
    return false;
}

// ========== QUẢN LÝ USER ==========
async function getUsers() {
    if (!hasPermission('canManageUsers')) return { success: false, error: 'Không có quyền' };
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    return { success: !error, data, error };
}

async function registerNewUser(username, password, fullname, role = 'user') {
    if (!hasPermission('canManageUsers')) return { success: false, error: 'Không có quyền' };
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from('users').select('id').eq('username', username).limit(1);
    if (existing && existing.length > 0) return { success: false, error: 'Tên đăng nhập đã tồn tại' };
    const { data, error } = await supabase.from('users').insert({ username, fullname: fullname || username, password, role, is_active: true }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, user: data };
}

async function updateUserInfo(userId, data) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('users').update({ ...data, updated_at: new Date().toISOString() }).eq('id', userId);
    return { success: !error, error };
}

async function changePassword(userId, oldPassword, newPassword) {
    const supabase = getSupabaseClient();
    if (userId === currentUser?.id) {
        const { data: user } = await supabase.from('users').select('password').eq('id', userId).single();
        if (!user || user.password !== oldPassword) return { success: false, error: 'Mật khẩu cũ không đúng' };
    }
    const { error } = await supabase.from('users').update({ password: newPassword }).eq('id', userId);
    return { success: !error, error };
}

async function deleteUser(userId) {
    if (!hasPermission('canManageUsers')) return { success: false, error: 'Không có quyền' };
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('users').delete().eq('id', userId);
    return { success: !error, error };
}

// ========== TỰ ĐỘNG TẠO USER MẶC ĐỊNH ==========
async function ensureDefaultUsers() {
    const supabase = getSupabaseClient();
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (count === 0) {
        const defaults = [
            { username: 'admin', fullname: 'Quản trị viên', password: 'admin123', role: 'admin' },
            { username: 'manager', fullname: 'Quản lý', password: 'manager123', role: 'manager' },
            { username: 'user', fullname: 'Người dùng', password: 'user123', role: 'user' }
        ];
        for (const u of defaults) await supabase.from('users').insert(u);
        console.log('Đã tạo user mặc định');
    }
}

window.auth = { login, logout, restoreSession, getUsers, registerNewUser, updateUserInfo, changePassword, deleteUser, hasPermission, ensureDefaultUsers };