// Service worker: lưu sẵn giao diện để mở nhanh. Không bao giờ lưu dữ liệu API.
const VERSION = 'donnghi-0.3.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/api.js', 'js/ui.js', 'js/config.js', 'js/leavecalc.js', 'js/pdftools.js',
  'js/views/auth.js', 'js/views/home.js', 'js/views/leaveForm.js', 'js/views/leaveDetail.js', 'js/views/lists.js',
  'js/views/signPlacer.js', 'js/views/signatureTool.js', 'js/views/profile.js', 'js/views/admin.js',
  'fonts/be-vietnam-pro-vietnamese-400-normal.woff2', 'fonts/be-vietnam-pro-latin-400-normal.woff2',
  'fonts/be-vietnam-pro-vietnamese-600-normal.woff2', 'fonts/be-vietnam-pro-latin-600-normal.woff2',
  'fonts/be-vietnam-pro-vietnamese-700-normal.woff2', 'fonts/be-vietnam-pro-latin-700-normal.woff2',
  'icons/icon-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;  // API Google: luôn đi mạng
  // Mạng trước, lỗi mạng thì dùng bản đã lưu – để bản mới lên ngay khi có mạng.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
