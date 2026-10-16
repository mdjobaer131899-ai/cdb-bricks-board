/* CDB Bricks service worker: only shows weather notifications (no caching). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
      icon: "/cdb-logo.svg",
      badge: "/cdb-logo.svg",
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
