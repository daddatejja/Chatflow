import { pushAPI } from "./pushAPI";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const subscribeToPushNotifications = async () => {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers are not supported in this browser");
    return false;
  }

  if (!("PushManager" in window)) {
    console.warn("Push notifications are not supported in this browser");
    return false;
  }

  try {
    // 1. Ask for permission first
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Push notification permission denied");
      return false;
    }

    // 2. Register service worker
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker registered with scope:", registration.scope);

    // Wait until it's active
    await navigator.serviceWorker.ready;

    // 3. Get VAPID public key from backend
    const { data } = await pushAPI.getVapidKey();
    const publicVapidKey = data.publicKey;

    if (!publicVapidKey) {
      console.error("No VAPID key received from server");
      return false;
    }

    // 4. Create the push subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
    });

    // 5. Send subscription to backend
    await pushAPI.subscribe(subscription);
    console.log("Successfully subscribed to push notifications");
    return true;
  } catch (err) {
    console.error("Failed to subscribe to push notifications:", err);
    return false;
  }
};

export const unsubscribeFromPushNotifications = async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await pushAPI.unsubscribe(subscription.endpoint);
      console.log("Successfully unsubscribed from push notifications");
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to unsubscribe:", err);
    return false;
  }
};
