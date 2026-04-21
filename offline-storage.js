// offline-storage.js - Lưu dữ liệu offline với IndexedDB

const DB_NAME = 'QLCT_Offline';
const DB_VERSION = 1;

class OfflineStorage {
    constructor() {
        this.db = null;
        this.init();
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store cho dữ liệu offline
                if (!db.objectStoreNames.contains('offlineData')) {
                    db.createObjectStore('offlineData', { keyPath: 'id' });
                }
                
                // Store cho hàng đợi sync
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const syncStore = db.createObjectStore('syncQueue', { 
                        autoIncrement: true 
                    });
                    syncStore.createIndex('timestamp', 'timestamp');
                }
                
                // Store cho logs
                if (!db.objectStoreNames.contains('offlineLogs')) {
                    db.createObjectStore('offlineLogs', { autoIncrement: true });
                }
            };
        });
    }
    
    // Lưu dữ liệu offline
    async saveData(table, data) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['offlineData'], 'readwrite');
            const store = transaction.objectStore('offlineData');
            const request = store.put({ id: table, data: data, timestamp: Date.now() });
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    // Lấy dữ liệu offline
    async getData(table) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['offlineData'], 'readonly');
            const store = transaction.objectStore('offlineData');
            const request = store.get(table);
            
            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }
    
    // Thêm vào hàng đợi sync
    async queueOperation(operation) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.add({
                ...operation,
                timestamp: Date.now(),
                retries: 0
            });
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    // Lấy tất cả operations pending
    async getPendingOperations() {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readonly');
            const store = transaction.objectStore('syncQueue');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
    
    // Xóa operation sau khi sync thành công
    async removeOperation(id) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    // Ghi log offline
    async log(message, data = null) {
        await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['offlineLogs'], 'readwrite');
            const store = transaction.objectStore('offlineLogs');
            const request = store.add({
                message,
                data,
                timestamp: new Date().toISOString()
            });
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
    
    async ensureDB() {
        if (!this.db) {
            await this.init();
        }
    }
}

// Tạo instance toàn cục
window.offlineStorage = new OfflineStorage();

// Hàm đồng bộ dữ liệu khi có mạng
window.syncPendingData = async () => {
    if (!navigator.onLine) return;
    
    const operations = await window.offlineStorage.getPendingOperations();
    if (operations.length === 0) return;
    
    console.log(`🔄 Syncing ${operations.length} pending operations...`);
    
    for (const op of operations) {
        try {
            const response = await fetch(op.url, {
                method: op.method,
                headers: op.headers || {},
                body: op.body
            });
            
            if (response.ok) {
                await window.offlineStorage.removeOperation(op.id);
                console.log(`✅ Synced operation ${op.id}`);
            } else if (op.retries >= 3) {
                await window.offlineStorage.removeOperation(op.id);
                console.log(`❌ Failed operation ${op.id} after 3 retries, removed`);
            } else {
                // Tăng retries và giữ lại
                op.retries++;
                await window.offlineStorage.queueOperation(op);
            }
        } catch (error) {
            console.error(`Sync failed for operation ${op.id}:`, error);
        }
    }
};

// Lắng nghe sự kiện online để sync
window.addEventListener('online', () => {
    setTimeout(() => window.syncPendingData(), 1000);
});