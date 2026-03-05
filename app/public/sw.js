self.addEventListener('push', function (event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const title = data.title || 'ChatFlow';
            const options = {
                body: data.body || 'You have a new message',
                icon: '/icon-192x192.png',
                badge: '/badge-72x72.png',
                vibrate: [100, 50, 100],
                data: data.data || { url: '/' },
                tag: data.tag || 'message'
            };

            event.waitUntil(self.registration.showNotification(title, options));
        } catch (err) {
            console.error('Error parsing push payload:', err);
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;
            
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                // Focus if already open
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window if not open
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
