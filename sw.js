// Расходы — service worker v2
// Задача: приложение открывается без интернета и при этом НЕ застревает
// на старой версии. Оболочка всегда берётся из сети, кэш — только запасной путь.

var VERSION = 'rashody-v2';
var SHELL_KEYS = ['./', './index.html'];   // оба адреса ведут на одну страницу

// Кладём ответ сразу под оба ключа, чтобы они не разъезжались
function cacheShell(response) {
  return caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL_KEYS.map(function (k) {
      return c.put(k, response.clone());
    }));
  });
}

function fetchShell() {
  // cache:'reload' — обойти HTTP-кэш браузера, взять действительно свежее
  return fetch('./index.html', { cache: 'reload' }).then(function (res) {
    if (res && res.ok) return cacheShell(res);
  });
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(fetchShell().catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== VERSION) return caches.delete(k);   // выкидываем старые версии
        }));
      })
      .then(function () { return fetchShell().catch(function () {}); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Supabase — всегда сеть, никакого кэша
  if (url.hostname.indexOf('supabase.co') >= 0) return;
  if (url.origin !== self.location.origin) return;

  var isPage = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (isPage) {
    // Страница: сначала сеть (чтобы подхватывать обновления), при отказе — кэш
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) cacheShell(res);
        return res;
      }).catch(function () {
        return caches.match('./').then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Остальное (иконки и т.п.): сеть с запасным кэшем
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req); })
  );
});

// Позволяет странице попросить обновиться немедленно
self.addEventListener('message', function (e) {
  if (e.data === 'refresh-shell') fetchShell();
});
