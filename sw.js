// sw.js - Service Worker cho PWA
const CACHE_NAME = 'qlct-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Danh sách file cần cache
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  '/login.html',
  '/setup-config.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'
];

// ====================== INSTALL EVENT ======================
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Skip waiting to activate');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// ====================== ACTIVATE EVENT ======================
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// ====================== FETCH EVENT (XỬ LÝ OFFLINE) ======================
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Chỉ cache các request cùng origin (không cache API)
  const isSameOrigin = url.origin === self.location.origin;
  const isApiCall = url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/');
  
  // Không cache API calls (Supabase)
  if (isApiCall) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Strategy: Cache First, then Network
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Trả về cache, đồng thời cập nhật cache mới ở background
          event.waitUntil(
            fetch(request).then(networkResponse => {
              return caches.open(CACHE_NAME).then(cache => {
                cache.put(request, networkResponse.clone());
                return networkResponse;
              });
            }).catch(() => {})
          );
          return cachedResponse;
        }
        
        // Không có cache, fetch từ network
        return fetch(request).then(networkResponse => {
          // Cache response mới nếu là GET request
          if (request.method === 'GET') {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          }
          return networkResponse;
        }).catch(error => {
          console.error('[SW] Fetch failed:', error);
          
          // Trả về trang offline nếu là navigation request
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          
          return new Response('Bạn đang offline!', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain; charset=utf-8'
            })
          });
        });
      })
  );
});

// ====================== PUSH NOTIFICATION (TÙY CHỌN) ======================
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Có thông báo mới từ ứng dụng',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Mở ứng dụng'
      },
      {
        action: 'close',
        title: 'Đóng'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Quản Lý Công Trình', options)
  );
});

// Xử lý click vào notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Nếu đã có cửa sổ đang mở, focus vào nó
        for (let client of windowClients) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        // Nếu chưa có, mở mới
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
  );
});

// ====================== BACKGROUND SYNC (TÙY CHỌN) ======================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncDataWithServer());
  }
});

async function syncDataWithServer() {
  try {
    const db = await openIndexedDB();
    const pendingOps = await db.getAll('syncQueue');
    
    for (const op of pendingOps) {
      await fetch(op.url, {
        method: op.method,
        headers: op.headers,
        body: op.body
      });
      await db.delete('syncQueue', op.id);
    }
    
    console.log('[SW] Synced', pendingOps.length, 'operations');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Helper để mở IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QLCT_Offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { autoIncrement: true });
      }
    };
  });
}