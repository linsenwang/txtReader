// 页面、脚本和样式改为网络优先，在线刷新就能拿到最新版本；
// 这个版本号只用于更新离线缓存，并在资源列表变化时递增。
const CACHE_NAME = 'txtreader-v17';

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
  '/corner-buttons.css',
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
  '/web_icon/clipboard.svg',
  '/web_icon/save.svg',
  '/web_icon/arrow.svg',
  '/web_icon/arrow_forward.svg',
  '/web_icon/paged_mode.svg',
  '/web_icon/scroll_mode.svg',
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

// 页面、脚本和样式必须优先走网络，避免改动后一直看到旧版本；
// 图片、字体等不常变化且体积较大的资源仍然缓存优先。
const NETWORK_FIRST_RE = /\.(?:html?|css|js)$/i;

async function handleNetworkFirst(request) {
  const url = new URL(request.url);
  // 导航请求按路径缓存，避免 ?name=... 生成大量重复的 HTML 缓存
  const cacheKey = request.mode === 'navigate' ? url.pathname : request;

  try {
    const response = await fetch(request);
    if (
      response &&
      response.status === 200 &&
      response.type === 'basic' &&
      request.method === 'GET'
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const fallback = url.pathname.endsWith('/file.html') ? '/file.html' : '/index.html';
      const fallbackResponse = await caches.match(fallback);
      if (fallbackResponse) return fallbackResponse;
    }
    throw error;
  }
}

async function handleCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (
    response &&
    response.status === 200 &&
    response.type === 'basic' &&
    request.method === 'GET'
  ) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// 拦截请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET；API 请求和外部资源直接走网络
  if (request.method !== 'GET') return;
  if (
    url.pathname.startsWith('/list-files') ||
    url.pathname.startsWith('/file-content') ||
    url.pathname.startsWith('/log-middle-p-index') ||
    url.pathname.startsWith('/get-progress') ||
    url.pathname.startsWith('/recent-reads') ||
    url.pathname.startsWith('/read-files') ||
    url.pathname.startsWith('/mark-read') ||
    url.pathname.startsWith('/temp-read') ||
    url.pathname.startsWith('/server-config') ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  const useNetworkFirst = request.mode === 'navigate' || NETWORK_FIRST_RE.test(url.pathname);
  event.respondWith(
    useNetworkFirst ? handleNetworkFirst(request) : handleCacheFirst(request)
  );
});
