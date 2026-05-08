import admin from 'firebase-admin';

let initialized = false;

function getApp(): admin.app.App {
  if (!initialized) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      // FCM konfiqurasiya edilməyibsə, dev mühitdə xəbərdarlıq ver, crash etmə
      console.warn('[FCM] Firebase env vars missing — push notifications disabled');
      return null as unknown as admin.app.App;
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    initialized = true;
  }
  return admin.app();
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends a push notification to a single FCM token.
 * Silently fails if FCM is not configured (dev mode).
 */
export async function sendPush(fcmToken: string, payload: PushPayload): Promise<void> {
  const app = getApp();
  if (!app) return;

  try {
    await admin.messaging(app).send({
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    });
  } catch (err) {
    // Token etibarsız ola bilər (istifadəçi tətbiqi sildi) — log et, crash etmə
    console.error('[FCM] Push failed:', err);
  }
}

/**
 * Sends push to multiple tokens (fan-out).
 */
export async function sendPushMulti(fcmTokens: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(fcmTokens.map((t) => sendPush(t, payload)));
}
