import { useState, useEffect, useCallback } from 'react';

export function useBrowserNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        // Check current permission on mount
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) {
            console.warn('Browser does not support notifications');
            return false;
        }

        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            return result === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }, []);

    const showNotification = useCallback((title: string, options?: NotificationOptions) => {
        if (!('Notification' in window) || permission !== 'granted') return;

        // Only show if page is hidden/unfocused to avoid spamming while user is active
        if (document.hidden) {
            try {
                const notification = new Notification(title, {
                    icon: '/favicon.ico', // fallback icon
                    badge: '/favicon.ico',
                    ...options
                });

                notification.onclick = function () {
                    window.focus();
                    this.close();
                };
            } catch (error) {
                console.error('Error showing notification:', error);
            }
        }
    }, [permission]);

    return {
        permission,
        requestPermission,
        showNotification
    };
}
