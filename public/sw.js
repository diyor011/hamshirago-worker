// Service Worker — HamshiraGo Nurse Push Notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Сохраняем данные заказа в IndexedDB — ждём завершения транзакции
function savePendingOrder(payload) {
  return new Promise((resolve) => {
    const req = indexedDB.open('hamshirago', 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('pending', { keyPath: 'id' })
    req.onsuccess = (e) => {
      const db = e.target.result
      try {
        const tx = db.transaction('pending', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.objectStore('pending').put({ id: 'order', payload, ts: Date.now() })
      } catch { resolve() }
    }
    req.onerror = () => resolve()
  })
}

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() || {} } catch {}

  const title = data.title || '🏥 Новый заказ!'
  const options = {
    body: data.body || 'Нажмите чтобы принять заказ',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: 'order-' + (data.orderId || Date.now()),
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    data: { orderId: data.orderId, payload: data.data },
  }

  // Сначала сохраняем в IndexedDB, потом показываем уведомление
  event.waitUntil(
    savePendingOrder(data.data || data).then(() =>
      self.registration.showNotification(title, options)
    )
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const payload = event.notification.data?.payload

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Есть открытая вкладка — шлём сообщение и фокусируем
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'ORDER_INCOMING', payload })
          return client.focus()
        }
      }
      // Нет вкладки — открываем новую (данные заказа уже в IndexedDB)
      return self.clients.openWindow('/')
    })
  )
})
