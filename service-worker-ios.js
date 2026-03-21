// iOS 优化的 Service Worker - 修复离线空白问题
const CACHE_NAME = 'txtreader-v5';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/file.html',
  '/afdian_styles.css',
  '/afdian_styles-print.css',
  '/recLoc.js',
  '/progress-sync.js',
  '/web_icon/yanan.png',
  '/web_icon/yanan-f.png',
  '/web_icon/folder.svg',
  '/web_icon/refresh.svg',
  '/web_icon/epub.svg',
  '/fonts/SarasaMonoSC-Regular.ttf'
];

// 安装时缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 开始缓存资源...');
        // 逐个缓存，避免一个失败全部失败
        return Promise.all(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.log('[SW] 缓存失败:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] 安装完成，跳过等待');
        return self.skipWaiting();
      })
  );
});

// 激活时立即控制所有客户端
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      console.log('[SW] 已激活，立即控制所有客户端');
      // 关键：立即控制所有客户端
      return self.clients.claim();
    })
  );
});

// 请求拦截策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 只处理 GET 请求
  if (request.method !== 'GET') return;
  
  // 跳过 API 请求（除了 list-files）
  if (url.pathname.startsWith('/log-middle-p-index') ||
      url.pathname.startsWith('/get-progress') ||
      url.pathname.startsWith('/server-config')) {
    return;
  }
  
  // 文件列表请求 - 使用 pathname 作为缓存键（忽略查询参数）
  if (url.pathname === '/list-files') {
    const cacheKey = '/list-files'; // 统一缓存键
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(cacheKey).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] 返回缓存的文件列表');
            // 后台更新
            fetch(request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(cacheKey, networkResponse.clone());
              }
            }).catch(() => {});
            return cachedResponse;
          }
          
          // 没有缓存，从网络获取
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(cacheKey, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // 离线且无缓存，返回空列表
            console.log('[SW] 离线且无文件列表缓存，返回空数组');
            return new Response('[]', {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }
  
  // 其他请求使用 Cache First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[SW] 返回缓存:', url.pathname);
        // 后台更新
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      
      // 没有缓存，尝试网络
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[SW] 网络失败，无缓存:', url.pathname);
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        throw err;
      });
    })
  );
});

// 监听消息
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
