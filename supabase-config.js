// supabase-config.js
const SUPABASE_CONFIG_KEY = 'supabase_config';

function getSupabaseConfig() {
    // Kiểm tra config từ localStorage (lưu từ trình cài đặt)
    const savedConfig = localStorage.getItem('supabase_config');
    if (savedConfig) {
        const config = JSON.parse(savedConfig);
        return { url: config.supabaseUrl, anonKey: config.supabaseAnonKey };
    }
    
    // Fallback: nếu chưa có, trả về null
    return null;
}

// Hàm kiểm tra xem đã cấu hình chưa
function isSupabaseConfigured() {
    const config = getSupabaseConfig();
    return config !== null && config.url && config.anonKey;
}

function saveSupabaseConfig(url, anonKey) {
    const config = { 
        url: url.replace(/\/$/, ''), // Xóa / ở cuối nếu có
        anonKey, 
        configuredAt: new Date().toISOString() 
    };
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
    return config;
}

function clearSupabaseConfig() {
    localStorage.removeItem(SUPABASE_CONFIG_KEY);
}

function createSupabaseClient() {
    const config = getSupabaseConfig();
    if (!config) return null;
    
    try {
        // Kiểm tra supabase object có tồn tại không
        if (typeof supabase === 'undefined') {
            console.error('Supabase library chưa được load!');
            return null;
        }
        return supabase.createClient(config.url, config.anonKey);
    } catch(e) {
        console.error('Lỗi tạo Supabase client:', e);
        return null;
    }
}

// Kiểm tra kết nối Supabase
async function testSupabaseConnection() {
    const client = createSupabaseClient();
    if (!client) {
        return { success: false, error: 'Chưa cấu hình Supabase' };
    }
    
    try {
        // Thử query đơn giản
        const { data, error } = await client.from('members').select('count', { count: 'exact', head: true });
        
        if (error) {
            console.error('Supabase connection test failed:', error);
            
            // Phân tích lỗi
            if (error.message.includes('CORS') || error.code === 'PGRST301') {
                return { 
                    success: false, 
                    error: 'CORS_ERROR',
                    message: 'Lỗi CORS! Vui lòng chạy ứng dụng qua Live Server hoặc thêm domain vào Supabase Settings → API → Additional allowed origins'
                };
            }
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                return { 
                    success: false, 
                    error: 'NETWORK_ERROR',
                    message: 'Không thể kết nối đến Supabase. Vui lòng kiểm tra mạng hoặc URL có đúng không.'
                };
            }
            if (error.message.includes('JWT') || error.message.includes('invalid')) {
                return { 
                    success: false, 
                    error: 'AUTH_ERROR',
                    message: 'Anon key không hợp lệ. Vui lòng kiểm tra lại!'
                };
            }
            if (error.message.includes('relation') && error.message.includes('does not exist')) {
                return { 
                    success: false, 
                    error: 'TABLE_ERROR',
                    message: 'Bảng members chưa được tạo. Vui lòng chạy SQL tạo bảng trong tab Cài đặt!'
                };
            }
            
            return { success: false, error: error.message };
        }
        
        return { success: true, message: 'Kết nối Supabase thành công!' };
        
    } catch (err) {
        console.error('Connection test exception:', err);
        return { success: false, error: err.message };
    }
}

// Hiển thị modal cấu hình với hướng dẫn chi tiết
function showConfigModal() {
    // Kiểm tra nếu modal đã tồn tại
    if (document.getElementById('config-modal')) return;
    
    const modalHtml = `
        <div id="config-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;overflow-y:auto;">
            <div style="background:white;padding:30px;border-radius:16px;max-width:550px;width:90%;max-height:90vh;overflow-y:auto;">
                <h3 style="color:#d32f2f;margin-top:0;">⚙️ CẤU HÌNH SUPABASE</h3>
                <p>Vui lòng nhập thông tin dự án Supabase của bạn:</p>
                
                <div style="margin:15px 0;">
                    <label style="display:block;margin-bottom:5px;font-weight:bold;">Supabase URL:</label>
                    <input type="text" id="supabase-url" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;" placeholder="https://xxxxx.supabase.co">
                    <small style="color:#666;">Lấy từ Project Settings → API → Project URL</small>
                </div>
                
                <div style="margin:15px 0;">
                    <label style="display:block;margin-bottom:5px;font-weight:bold;">Anon public key:</label>
                    <input type="text" id="supabase-anon-key" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;" placeholder="eyJhbGciOiJIUzI1NiIs...">
                    <small style="color:#666;">Lấy từ Project Settings → API → anon public key</small>
                </div>
                
                <div style="margin-top:20px;display:flex;gap:10px;">
                    <button id="save-config-btn" style="flex:1;padding:10px;background:#007bff;color:white;border:none;border-radius:8px;cursor:pointer;">Lưu & Tiếp tục</button>
                    <button id="test-connection-btn" style="flex:1;padding:10px;background:#6c757d;color:white;border:none;border-radius:8px;cursor:pointer;">Kiểm tra kết nối</button>
                </div>
                
                <div id="connection-test-result" style="margin-top:15px;font-size:13px;display:none;"></div>
                
                <hr style="margin:20px 0;">
                
                <details>
                    <summary style="cursor:pointer;color:#007bff;font-weight:bold;">📘 Hướng dẫn tạo Supabase (Bấm để xem)</summary>
                    <div style="background:#f0f0f0;padding:15px;border-radius:8px;font-size:13px;margin-top:10px;">
                        <ol style="margin:0;padding-left:20px;">
                            <li>Truy cập <a href="https://supabase.com" target="_blank">supabase.com</a> → New project</li>
                            <li>Đặt tên project (VD: quan-ly-cong-trinh)</li>
                            <li>Tạo Database password và nhớ lưu</li>
                            <li>Chọn region gần nhất (Singapore hoặc Southeast Asia)</li>
                            <li>Chờ vài phút để database khởi tạo</li>
                            <li>Vào Project Settings → API → lấy URL và anon key</li>
                            <li>Dán 2 thông tin trên vào form này</li>
                            <li>Sau đó chạy file SQL mẫu (có trong tab Cài đặt) để tạo bảng</li>
                        </ol>
                        <p style="margin-top:10px;color:#d32f2f;"><strong>⚠️ LƯU Ý QUAN TRỌNG:</strong></p>
                        <ul style="margin:5px 0 0 20px;">
                            <li>Phải chạy ứng dụng qua <strong>Live Server</strong> (không mở file trực tiếp)</li>
                            <li>Nếu gặp lỗi CORS, vào Supabase Dashboard → Settings → API → Additional allowed origins → thêm <code>http://localhost:5500</code> và <code>http://127.0.0.1:5500</code></li>
                        </ul>
                    </div>
                </details>
                
                <button id="close-config-modal" style="margin-top:15px;width:100%;padding:8px;background:#f0f0f0;border:none;border-radius:8px;cursor:pointer;">Đóng</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Nút Lưu
    document.getElementById('save-config-btn').onclick = () => {
        const url = document.getElementById('supabase-url').value.trim();
        const anonKey = document.getElementById('supabase-anon-key').value.trim();
        
        if (!url) {
            alert('Vui lòng nhập Supabase URL!');
            return;
        }
        if (!anonKey) {
            alert('Vui lòng nhập Anon key!');
            return;
        }
        
        saveSupabaseConfig(url, anonKey);
        document.getElementById('config-modal').remove();
        window.location.reload();
    };
    
    // Nút Kiểm tra kết nối
    document.getElementById('test-connection-btn').onclick = async () => {
        const url = document.getElementById('supabase-url').value.trim();
        const anonKey = document.getElementById('supabase-anon-key').value.trim();
        const resultDiv = document.getElementById('connection-test-result');
        
        if (!url || !anonKey) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<span style="color:orange;">⚠️ Vui lòng nhập đầy đủ URL và Anon key trước khi kiểm tra!</span>';
            return;
        }
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color:blue;">⏳ Đang kiểm tra kết nối...</span>';
        
        try {
            // Tạo client tạm thời để test
            const testClient = supabase.createClient(url, anonKey);
            const { error } = await testClient.from('members').select('count', { count: 'exact', head: true });
            
            if (error) {
                if (error.message.includes('CORS')) {
                    resultDiv.innerHTML = '<span style="color:red;">❌ Lỗi CORS! Vui lòng chạy ứng dụng qua Live Server và thêm domain vào Supabase Settings.</span>';
                } else if (error.message.includes('Failed to fetch')) {
                    resultDiv.innerHTML = '<span style="color:red;">❌ Không thể kết nối! Kiểm tra URL và mạng.</span>';
                } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
                    resultDiv.innerHTML = '<span style="color:orange;">⚠️ Kết nối thành công nhưng chưa có bảng. Vui lòng chạy SQL tạo bảng.</span>';
                } else {
                    resultDiv.innerHTML = `<span style="color:red;">❌ Lỗi: ${error.message}</span>`;
                }
            } else {
                resultDiv.innerHTML = '<span style="color:green;">✅ Kết nối thành công! Bạn có thể lưu cấu hình.</span>';
            }
        } catch(err) {
            resultDiv.innerHTML = `<span style="color:red;">❌ Lỗi: ${err.message}</span>`;
        }
    };
    
    // Nút Đóng
    document.getElementById('close-config-modal').onclick = () => {
        document.getElementById('config-modal').remove();
    };
}

// Hàm kiểm tra và hiển thị hướng dẫn nếu lỗi CORS
function showCORSGuide() {
    const guideHtml = `
        <div id="cors-guide" style="position:fixed;bottom:20px;right:20px;z-index:9999;background:#fff3cd;border-left:4px solid #ffc107;padding:15px;border-radius:8px;max-width:350px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="color:#856404;">⚠️ Lỗi kết nối Supabase</strong>
                <button id="close-cors-guide" style="background:none;border:none;font-size:20px;cursor:pointer;">&times;</button>
            </div>
            <p style="margin:10px 0 0;font-size:13px;color:#856404;">
                Bạn đang gặp lỗi CORS hoặc không thể kết nối. Hãy:
                <br>1. Chạy bằng <strong>Live Server</strong> (không mở file trực tiếp)
                <br>2. Kiểm tra lại cấu hình Supabase
                <br>3. Thêm domain vào Supabase Settings → API → Additional allowed origins
            </p>
        </div>
    `;
    
    if (!document.getElementById('cors-guide')) {
        document.body.insertAdjacentHTML('beforeend', guideHtml);
        document.getElementById('close-cors-guide').onclick = () => {
            document.getElementById('cors-guide').remove();
        };
        
        setTimeout(() => {
            const guide = document.getElementById('cors-guide');
            if (guide) guide.remove();
        }, 10000);
    }
}

// Tự động kiểm tra kết nối khi trang load
setTimeout(async () => {
    const config = getSupabaseConfig();
    if (config) {
        const test = await testSupabaseConnection();
        if (!test.success) {
            if (test.error === 'CORS_ERROR' || test.error === 'NETWORK_ERROR') {
                showCORSGuide();
            }
            console.warn('Supabase connection issue:', test.message);
        }
    }
}, 3000);