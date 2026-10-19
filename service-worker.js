// 静态资源有改动就要把这个版本号往上加，否则装了 service worker 的客户端
// 会一直用缓存里的旧文件（cache-first），改了 CSS 也看不到效果
const CACHE_NAME = 'txtreader-v7';

// KaTeX 字体，离线时公式才能用正确字形渲染
const KATEX_FONTS = [
  'KaTeX_AMS-Regular',
  'KaTeX_Caligraphic-Bold',
  'KaTeX_Caligraphic-Regular',
  'KaTeX_Fraktur-Bold',
  'KaTeX_Fraktur-Regular',
  'KaTeX_Main-Bold',
  'KaTeX_Main-BoldItalic',
  'KaTeX_Main-Italic',
  'KaTeX_Main-Regular',
  'KaTeX_Math-BoldItalic',
  'KaTeX_Math-Italic',
  'KaTeX_SansSerif-Bold',
  'KaTeX_SansSerif-Italic',
  'KaTeX_SansSerif-Regular',
  'KaTeX_Script-Regular',
  'KaTeX_Size1-Regular',
  'KaTeX_Size2-Regular',
  'KaTeX_Size3-Regular',
  'KaTeX_Size4-Regular',
  'KaTeX_Typewriter-Regular'
].map((name) => `/lib/fonts/${name}.woff2`);

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/file.html',
  '/afdian_styles.css',
  '/afdian_styles-print.css',
  '/recLoc.js',
  '/lib/katex.min.css',
  '/lib/katex.min.js',
  '/lib/auto-render.min.js',
  '/lib/marked.min.js',
  '/web_icon/yanan.png',
  '/web_icon/yanan-f.png',
  '/web_icon/folder.svg',
  '/web_icon/refresh.svg',
  '/web_icon/epub.svg',
  '/web_icon/sort.svg',
  '/web_icon/arrow.svg',
  '/fonts/SarasaMonoSC-Regular.ttf',
  ...KATEX_FONTS
];

// 安装时缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('缓存静态资源');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.log('缓存失败:', err);
      })
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 拦截请求，优先从缓存获取
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过 API 请求和外部资源
  if (
    url.pathname.startsWith('/list-files') ||
    url.pathname.startsWith('/file-content') ||
    url.pathname.startsWith('/log-middle-p-index') ||
    url.pathname.startsWith('/get-progress') ||
    url.pathname.startsWith('/recent-reads') ||
    url.pathname.startsWith('/read-files') ||
    url.pathname.startsWith('/mark-read') ||
    url.pathname.startsWith('/server-config') ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => {
      // 缓存命中，返回缓存
      if (response) {
        return response;
      }

      // 未命中，发起网络请求
      return fetch(request)
        .then((networkResponse) => {
          // 只缓存成功的 GET 请求
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== 'basic' ||
            request.method !== 'GET'
          ) {
            return networkResponse;
          }

          // 克隆响应（因为响应流只能读取一次）
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // 网络失败，尝试返回离线页面
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
