import webpush from "web-push";
import prisma from "../lib/prisma";

// Ensure VAPID keys are present
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:admin@chatflow.com";

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
}

export const sendPushNotification = async (userId: string, payload: any) => {
  if (!publicVapidKey || !privateVapidKey) {
    console.warn("VAPID keys not configured, skipping push notification");
    return;
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const stringPayload = JSON.stringify(payload);

    // Send to all registered devices for this user
    const promises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, stringPayload);
      } catch (error: any) {
        // If subscription is expired or unsubscribed, remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Removing invalid push subscription for user ${userId}`);
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } else {
          console.error("Error sending push notification:", error);
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error in sendPushNotification service:", error);
  }
};
