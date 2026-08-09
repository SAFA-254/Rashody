// Расходы — service worker
// Кэширует оболочку приложения, чтобы оно открывалось без интернета.
// Запросы к Supabase всегда идут в сеть (данные должны быть свежими).

var CACHE = 'rashody-v1';
var SHELL = ['./', './index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () { /* игнорируем, если что-то не нашлось */ });
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // API и авторизация — только сеть, не кэшируем
  if (url.hostname.indexOf('supabase.co') >= 0) return;

  // Оболочка: сначала сеть (чтобы подхватывать обновления), при отказе — кэш
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
