/* CDB Bricks service worker: makes the app installable, shows a small page when the
   phone is offline, and shows weather notifications. Nothing is cached, so every page
   and figure always comes fresh from the server. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// pages always from the network; only when there is no internet, a short Bangla note
const OFFLINE = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CDB Bricks</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f3f2ef;color:#1c1917;text-align:center;padding:24px}
button{margin-top:16px;padding:12px 20px;border:0;border-radius:12px;background:#a63a1c;color:#fff;font-size:16px}</style></head>
<body><div><img src="/icon-192.png" width="96" height="96" alt=""><h2>ইন্টারনেট নেই</h2><p>সংযোগ ফিরলে আবার চেষ্টা করুন।</p><button onclick="location.reload()">আবার চেষ্টা</button></div></body></html>`;
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: "CDB Bricks", body: event.data ? event.data.text() : "" };
  }
  const red = d.level === "red";
  event.waitUntil(
    self.registration.showNotification(d.title || "CDB Bricks", {
      body: d.body || "",
      tag: d.tag || "cdb",
      renotify: true,
      requireInteraction: red,
      vibrate: red ? [500, 200, 500, 200, 500] : [200, 100, 200],
      icon: "/icon-192.png",
      badge: "/favicon-48.png",
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
