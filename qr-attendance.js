// qr-attendance.js
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Browser } from '@capacitor/browser';

// ====================== TẠO QR CODE CHO CÔNG TRÌNH ======================
export async function generateQRCode(projectId, projectName) {
    const supabase = getSupabase();
    
    // Tạo QR code duy nhất
    const qrValue = `${window.location.origin}/attendance?project=${projectId}&token=${generateToken()}`;
    
    // Lưu vào database
    const { data } = await supabase
        .from('qr_codes')
        .upsert({
            project_id: projectId,
            qr_code: qrValue,
            is_active: true,
            expires_at: new Date(Date.now() + 30*24*60*60*1000) // 30 ngày
        })
        .select()
        .single();
    
    // Tạo QR image để in ấn
    const qrImageUrl = await createQRImage(qrValue);
    
    // Hiển thị modal QR
    showQRModal(qrImageUrl, projectName);
    
    return qrValue;
}

async function createQRImage(text) {
    // Dùng API tạo QR code
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
}

// ====================== CHẤM CÔNG BẰNG QR ======================
export async function scanQRCode() {
    // Trên mobile, mở camera quét QR
    if (window.Capacitor?.isNativePlatform()) {
        const { Browser } = Capacitor.Plugins;
        // Mở scanner QR (dùng plugin hoặc web fallback)
        alert('Vui lòng quét mã QR tại công trình');
    } else {
        // Web fallback: nhập mã
        const qrCode = prompt('Nhập mã QR code:');
        if (qrCode) await processAttendance(qrCode);
    }
}

async function processAttendance(qrCode, photoBase64 = null, location = null) {
    const supabase = getSupabase();
    
    // Xác thực QR code
    const { data: qrData, error: qrError } = await supabase
        .from('qr_codes')
        .select('project_id, is_active, expires_at')
        .eq('qr_code', qrCode)
        .single();
    
    if (qrError || !qrData) {
        showNotification('❌ Mã QR không hợp lệ!', 'danger');
        return;
    }
    
    if (!qrData.is_active) {
        showNotification('❌ Mã QR đã bị vô hiệu hóa!', 'danger');
        return;
    }
    
    if (new Date(qrData.expires_at) < new Date()) {
        showNotification('❌ Mã QR đã hết hạn!', 'danger');
        return;
    }
    
    // Lấy vị trí GPS
    let latitude = null, longitude = null, locationName = null;
    if (navigator.geolocation) {
        try {
            const position = await getCurrentPosition();
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
            locationName = await getLocationName(latitude, longitude);
        } catch(e) {
            console.warn('Không lấy được GPS:', e);
        }
    }
    
    // Upload ảnh nếu có
    let photoUrl = null;
    if (photoBase64) {
        photoUrl = await uploadAttendancePhoto(photoBase64, qrData.project_id);
    }
    
    // Lấy thông tin nhân công hiện tại
    const member = await getCurrentMember();
    
    // Tạo bản ghi chấm công
    const { error } = await supabase
        .from('timesheets')
        .insert({
            date: new Date().toISOString().slice(0,10),
            member_id: member.id,
            project_id: qrData.project_id,
            value: 1,
            notes: `Chấm công bằng QR tại ${locationName || 'vị trí không xác định'}`,
            latitude: latitude,
            longitude: longitude,
            location_name: locationName,
            photo_url: photoUrl,
            is_verified: true
        });
    
    if (error) {
        showNotification('❌ Lỗi khi chấm công: ' + error.message, 'danger');
    } else {
        showNotification('✅ Chấm công thành công!', 'success');
    }
}

// ====================== CHỤP ẢNH & UPLOAD CLOUD ======================
export async function takeAttendancePhoto() {
    if (!window.Capacitor?.isNativePlatform()) {
        // Web fallback: dùng input file
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }
    
    // Dùng Capacitor Camera
    const { Camera } = Capacitor.Plugins;
    
    try {
        const photo = await Camera.getPhoto({
            quality: 80,
            allowEditing: true,
            resultType: 'base64',
            saveToGallery: false
        });
        
        return `data:image/jpeg;base64,${photo.base64String}`;
    } catch(error) {
        console.error('Camera error:', error);
        return null;
    }
}

async function uploadAttendancePhoto(base64Image, projectId) {
    const supabase = getSupabase();
    
    // Tạo tên file duy nhất
    const fileName = `attendance/${projectId}/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;
    
    // Convert base64 to blob
    const blob = base64ToBlob(base64Image);
    
    // Upload lên Supabase Storage
    const { data, error } = await supabase.storage
        .from('attendance-photos')
        .upload(fileName, blob, {
            contentType: 'image/jpeg',
            cacheControl: '3600'
        });
    
    if (error) {
        console.error('Upload error:', error);
        return null;
    }
    
    // Lấy public URL
    const { data: urlData } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(fileName);
    
    // Lưu log upload
    await saveUploadLog(fileName, urlData.publicUrl, projectId);
    
    return urlData.publicUrl;
}

function base64ToBlob(base64) {
    const byteString = atob(base64.split(',')[1]);
    const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

// ====================== LƯU LOG UPLOAD ======================
async function saveUploadLog(fileName, publicUrl, projectId) {
    const supabase = getSupabase();
    
    await supabase.from('logs').insert({
        action: 'PHOTO_UPLOAD',
        entity_type: 'attendance',
        details: {
            fileName: fileName,
            publicUrl: publicUrl,
            projectId: projectId,
            uploadedAt: new Date().toISOString()
        }
    });
}

// ====================== LẤY TÊN ĐỊA ĐIỂM TỪ GPS ======================
async function getLocationName(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        );
        const data = await response.json();
        return data.display_name?.substring(0, 100) || `${lat}, ${lng}`;
    } catch(e) {
        return `${lat}, ${lng}`;
    }
}

function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
        });
    });
}