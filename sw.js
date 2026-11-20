/* sw.js — DiaryWell service worker.
   - Pre-caches the app shell on install.
   - Cache-first for same-origin static assets, network never reached at runtime.
   - Schedules a daily reminder notification via setTimeout while the SW is alive.
*/

const VERSION = 'diarywell-v1.1.0';
const CACHE = VERSION;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './chart.js',
  './pdf.js',
  './ui.js',
  './manifest.webmanifest',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () {
        // Best-effort: pre-cache whatever exists. Missing files won't block install.
        return Promise.all(SHELL.map(function (url) {
          return c.add(url).catch(function () { return null; });
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        // Cache successful responses for next time (offline).
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () {
        // Offline fallback: serve index for navigation requests.
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

/* ---------- Reminder scheduling ---------- */

var reminderState = { enabled: false, time: '20:00' };
var reminderTimer = null;

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'reminder') {
    reminderState.enabled = !!data.enabled;
    reminderState.time = data.time || '20:00';
    scheduleReminder();
  }
});

function scheduleReminder() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
  if (!reminderState.enabled) return;
  var parts = reminderState.time.split(':');
  var hh = parseInt(parts[0], 10);
  var mm = parseInt(parts[1], 10);
  if (isNaN(hh) || isNaN(mm)) return;

  var now = new Date();
  var next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  var ms = next.getTime() - now.getTime();
  reminderTimer = setTimeout(function () {
    showReminder();
    scheduleReminder();
  }, Math.max(1000, ms));
}

function showReminder() {
  if (!self.registration || !self.registration.showNotification) return;
  // Only fire if the app isn't focused already.
  self.clients.matchAll({ type: 'window' }).then(function (cs) {
    var visible = cs.some(function (c) { return c.visibilityState === 'visible'; });
    if (visible) return;
    self.registration.showNotification('A moment for today?', {
      body: 'Take 30 seconds for your DiaryWell check-in whenever you can.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag: 'diarywell-daily',
      requireInteraction: false,
      silent: false,
      data: { url: './index.html#today' }
    });
  });
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || './index.html#today';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        if (c.url.indexOf(self.location.origin) === 0) {
          return c.focus().then(function () {
            return c.navigate(targetUrl).catch(function () { return c; });
          });
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
