// camera-utils.js
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Lấy ảnh từ Camera hoặc Thư viện
 * @param {boolean} useCamera - true: chụp ảnh, false: chọn từ thư viện
 * @returns {Promise<string|null>} - Base64 image hoặc null
 */
export async function getPhoto(useCamera = true) {
    try {
        const photo = await Camera.getPhoto({
            quality: 85,
            allowEditing: true,
            resultType: CameraResultType.Base64,
            source: useCamera ? CameraSource.Camera : CameraSource.Photos,
            promptLabel: useCamera ? 'Chụp ảnh công việc' : 'Chọn ảnh từ thư viện',
            saveToGallery: false,
            webUseInput: true,  // Fallback cho web
            presentationStyle: 'fullscreen'
        });
        
        if (!photo || !photo.base64String) {
            return null;
        }
        
        return `data:image/jpeg;base64,${photo.base64String}`;
        
    } catch (error) {
        console.error('Camera error:', error);
        
        // Xử lý lỗi từ chối quyền
        if (error.message?.includes('canceled')) {
            return null;
        }
        
        if (error.message?.includes('permission')) {
            alert('⚠️ Vui lòng cấp quyền camera/thư viện ảnh trong cài đặt ứng dụng!');
        }
        
        return null;
    }
}

/**
 * Mở camera chụp ảnh (kèm fallback sang thư viện nếu lỗi)
 */
export async function takePhotoWithFallback() {
    try {
        // Thử mở camera trước
        return await getPhoto(true);
    } catch (error) {
        console.warn('Camera failed, fallback to gallery:', error);
        // Nếu camera lỗi, chuyển sang chọn từ thư viện
        return await getPhoto(false);
    }
}

/**
 * Hiển thị dialog cho người dùng chọn: Chụp ảnh hoặc chọn từ thư viện
 */
export async function choosePhotoSource() {
    // Tạo custom prompt (vì alert chỉ có OK/Cancel)
    const useCamera = confirm('📸 Chọn nguồn ảnh:\n\n• OK: Chụp ảnh mới\n• Cancel: Chọn từ thư viện');
    
    if (useCamera) {
        return await getPhoto(true);
    } else {
        return await getPhoto(false);
    }
}

/**
 * Lấy vị trí GPS hiện tại
 * @returns {Promise<object|null>} - { latitude, longitude, accuracy } hoặc null
 */
export async function getCurrentPosition() {
    // Kiểm tra môi trường
    const isNative = window.Capacitor && Capacitor.isNativePlatform();
    
    // Trên web, dùng navigator.geolocation
    if (!isNative) {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                alert('Trình duyệt không hỗ trợ GPS!');
                resolve(null);
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        altitude: position.coords.altitude,
                        timestamp: position.timestamp
                    });
                },
                (error) => {
                    handleGeolocationError(error);
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });
    }
    
    // Trên native (Capacitor)
    try {
        // Yêu cầu quyền trước
        let permissionStatus = await Geolocation.checkPermissions();
        
        if (permissionStatus.location !== 'granted') {
            permissionStatus = await Geolocation.requestPermissions();
            
            if (permissionStatus.location !== 'granted') {
                alert('⚠️ Bạn cần cấp quyền vị trí để sử dụng tính năng GPS!\n\nVào Cài đặt → Ứng dụng → Quản lý công trình → Quyền → Vị trí');
                return null;
            }
        }
        
        // Lấy vị trí với độ chính xác cao
        const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        });
        
        return {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            timestamp: position.timestamp
        };
        
    } catch (error) {
        console.error('Geolocation error:', error);
        handleGeolocationError(error);
        return null;
    }
}

/**
 * Xử lý lỗi GPS
 */
function handleGeolocationError(error) {
    let errorMsg = '';
    
    if (error.message) {
        if (error.message.includes('denied')) {
            errorMsg = '❌ Quyền vị trí bị từ chối. Vui lòng bật GPS và cấp quyền trong cài đặt ứng dụng!';
        } else if (error.message.includes('timeout')) {
            errorMsg = '⏰ Quá thời gian chờ. Vui lòng ra nơi thoáng đãng và thử lại!';
        } else if (error.message.includes('unavailable')) {
            errorMsg = '📍 Không thể xác định vị trí. Vui lòng bật GPS trên thiết bị!';
        } else {
            errorMsg = '❌ Lỗi GPS: ' + error.message;
        }
    } else if (error.code) {
        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMsg = '❌ Quyền vị trí bị từ chối!';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMsg = '📍 Không thể xác định vị trí!';
                break;
            case error.TIMEOUT:
                errorMsg = '⏰ Quá thời gian chờ!';
                break;
            default:
                errorMsg = '❌ Lỗi GPS không xác định!';
        }
    } else {
        errorMsg = '❌ Lỗi GPS: ' + String(error);
    }
    
    alert(errorMsg);
}

/**
 * Kiểm tra và yêu cầu tất cả quyền cần thiết
 */
export async function requestAllPermissions() {
    const isNative = window.Capacitor && Capacitor.isNativePlatform();
    
    if (!isNative) {
        // Trên web, chỉ cần kiểm tra trình duyệt
        const hasGeolocation = !!navigator.geolocation;
        const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        return {
            camera: hasCamera,
            gallery: hasCamera,
            location: hasGeolocation,
            isNative: false
        };
    }
    
    const results = {
        camera: false,
        gallery: false,
        location: false,
        isNative: true
    };
    
    // Camera & Gallery (cùng 1 quyền)
    try {
        const cameraPerm = await Camera.checkPermissions();
        if (cameraPerm.camera !== 'granted') {
            const requested = await Camera.requestPermissions();
            results.camera = requested.camera === 'granted';
            results.gallery = requested.photos === 'granted';
        } else {
            results.camera = true;
            results.gallery = true;
        }
    } catch (e) {
        console.warn('Camera permission check failed:', e);
    }
    
    // Location
    try {
        const locationPerm = await Geolocation.checkPermissions();
        if (locationPerm.location !== 'granted') {
            const requested = await Geolocation.requestPermissions();
            results.location = requested.location === 'granted';
        } else {
            results.location = true;
        }
    } catch (e) {
        console.warn('Location permission check failed:', e);
    }
    
    return results;
}

// Export mặc định
export default {
    getPhoto,
    takePhotoWithFallback,
    choosePhotoSource,
    getCurrentPosition,
    requestAllPermissions
};