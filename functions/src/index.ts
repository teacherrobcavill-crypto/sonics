import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

// Define secrets stored in Cloud Secret Manager
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

/**
 * Stripe Webhook Handler (Firebase Cloud Functions v2)
 *
 * Verifies Stripe cryptographic signature using rawBody and handles:
 * - checkout.session.completed: Grant Pro status & Pro custom claim
 * - customer.subscription.updated: Update subscription active status
 * - customer.subscription.deleted: Revoke Pro status & Pro custom claim
 */
export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
    cors: false,
  },
  async (req, res): Promise<void> => {
    // Only accept POST requests
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).send("Method Not Allowed");
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      logger.error("Missing stripe-signature header");
      res.status(400).send("Webhook Error: Missing Stripe signature");
      return;
    }

    const secretKey = stripeSecretKey.value();
    const webhookSecret = stripeWebhookSecret.value();

    if (!secretKey || !webhookSecret) {
      logger.error("Stripe secrets not configured in Secret Manager");
      res.status(500).send("Webhook Error: Server configuration missing secrets");
      return;
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
    });

    let event: Stripe.Event;

    try {
      // req.rawBody is provided by Cloud Functions (v2) https onRequest
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        throw new Error("Missing rawBody on request. Signature verification requires raw bytes.");
      }
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      logger.error(`Webhook signature verification failed: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    logger.info(`Received verified Stripe event: ${event.type} [${event.id}]`);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.client_reference_id;
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id || null;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id || null;

          if (!uid) {
            logger.warn(`checkout.session.completed received without client_reference_id (Session: ${session.id})`);
            break;
          }

          logger.info(`Upgrading user ${uid} to Pro (Customer: ${customerId}, Sub: ${subscriptionId})`);

          // 1. Update /users/{uid} document in Firestore
          await db.collection("users").doc(uid).set(
            {
              isPro: true,
              role: "pro",
              stripeCustomerId: customerId,
              subscriptionId: subscriptionId,
              subscriptionStatus: "active",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // 2. Set Firebase Auth custom claims: { pro: true }
          try {
            const userRecord = await auth.getUser(uid);
            const currentClaims = userRecord.customClaims || {};
            await auth.setCustomUserClaims(uid, {
              ...currentClaims,
              pro: true,
            });
            logger.info(`Custom claim { pro: true } successfully assigned to user ${uid}`);
          } catch (authErr: any) {
            logger.error(`Error updating custom claims for user ${uid}: ${authErr.message}`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id;
          const status = subscription.status; // 'active', 'past_due', 'canceled', etc.
          const isActive = status === "active" || status === "trialing";

          logger.info(`Subscription updated: ${subscription.id} (Customer: ${customerId}, Status: ${status})`);

          // Find user by stripeCustomerId or subscriptionId
          let userQuerySnap = await db
            .collection("users")
            .where("subscriptionId", "==", subscription.id)
            .limit(1)
            .get();

          if (userQuerySnap.empty && customerId) {
            userQuerySnap = await db
              .collection("users")
              .where("stripeCustomerId", "==", customerId)
              .limit(1)
              .get();
          }

          if (userQuerySnap.empty) {
            logger.warn(`No user document found for subscription ${subscription.id} (Customer: ${customerId})`);
            break;
          }

          const userDoc = userQuerySnap.docs[0];
          const uid = userDoc.id;

          await userDoc.ref.update({
            isPro: isActive,
            subscriptionStatus: status,
            role: isActive ? "pro" : "free",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Sync custom claims with updated status
          try {
            const userRecord = await auth.getUser(uid);
            const currentClaims = userRecord.customClaims || {};
            await auth.setCustomUserClaims(uid, {
              ...currentClaims,
              pro: isActive,
            });
            logger.info(`Updated custom claim { pro: ${isActive} } for user ${uid}`);
          } catch (authErr: any) {
            logger.error(`Error syncing custom claim on subscription update for ${uid}: ${authErr.message}`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id;

          logger.info(`Subscription canceled/deleted: ${subscription.id} (Customer: ${customerId})`);

          let userQuerySnap = await db
            .collection("users")
            .where("subscriptionId", "==", subscription.id)
            .limit(1)
            .get();

          if (userQuerySnap.empty && customerId) {
            userQuerySnap = await db
              .collection("users")
              .where("stripeCustomerId", "==", customerId)
              .limit(1)
              .get();
          }

          if (userQuerySnap.empty) {
            logger.warn(`No user document found for canceled subscription ${subscription.id}`);
            break;
          }

          const userDoc = userQuerySnap.docs[0];
          const uid = userDoc.id;

          // Revoke Pro status in Firestore
          await userDoc.ref.update({
            isPro: false,
            role: "free",
            subscriptionStatus: "canceled",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Revoke pro custom claim in Firebase Auth
          try {
            const userRecord = await auth.getUser(uid);
            const currentClaims = userRecord.customClaims || {};
            const { pro: _omitted, ...updatedClaims } = currentClaims as Record<string, any>;
            await auth.setCustomUserClaims(uid, {
              ...updatedClaims,
              pro: false,
            });
            logger.info(`Revoked Pro claim for user ${uid}`);
          } catch (authErr: any) {
            logger.error(`Error revoking custom claims for user ${uid}: ${authErr.message}`);
          }
          break;
        }

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (handlerErr: any) {
      logger.error(`Error processing Stripe event ${event.id}: ${handlerErr.message}`, handlerErr);
      res.status(500).send(`Webhook handler error: ${handlerErr.message}`);
    }
  }
);

/**
 * Daily Midnight Maintenance (Firebase Cloud Functions v2 Scheduler)
 *
 * Runs automatically every night at 00:00 Europe/London (midnight UK time).
 * - Snapshots the day's top leaderboard students into /daily_snapshots/{YYYY-MM-DD}
 * - Calculates and logs daily cohort statistics (active players, average score)
 * - Safe and non-destructive: does not modify or delete student progress
 */
export const dailyMidnightMaintenance = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Europe/London",
  },
  async (event) => {
    logger.info(`Starting daily midnight maintenance for ${event.scheduleTime}...`);

    try {
      // 1. Determine yesterday's date string (e.g. 2026-10-20)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const dateKey = yesterday.toISOString().split("T")[0];

      // 2. Fetch all real students
      const studentsSnap = await db.collection("students").get();

      if (studentsSnap.empty) {
        logger.info("No student accounts found in database. Exiting maintenance.");
        return;
      }

      const eligibleStudents: any[] = [];
      let totalRoundsPlayedYesterday = 0;

      for (const docSnap of studentsSnap.docs) {
        const student = docSnap.data();

        // Skip admin and test accounts
        if (student.isAdmin || student.id === "rob" || student.id === "rob_c") {
          continue;
        }

        const stats = student.stats || {};
        eligibleStudents.push({
          id: docSnap.id,
          name: student.name || "Anonymous",
          totalScore: stats.totalScore || 0,
          bestStreak: stats.bestStreak || 0,
          roundsPlayed: stats.roundsPlayed || 0,
          cohortYear: student.cohortYear || "Class of 2026",
          rankTitle: stats.rankTitle || "Listener",
        });

        // Check if student played yesterday
        if (student.dailyUsage?.date === dateKey) {
          const rounds = student.dailyUsage.rounds || {};
          const sumRounds = Object.values(rounds).reduce((a: any, b: any) => (a || 0) + (b || 0), 0) as number;
          totalRoundsPlayedYesterday += sumRounds;
        }
      }

      // Sort by score descending, then best streak
      eligibleStudents.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.bestStreak - a.bestStreak;
      });

      const top10 = eligibleStudents.slice(0, 10);
      const champion = top10.length > 0 ? top10[0] : null;

      // 3. Save permanent daily snapshot into /daily_snapshots/{dateKey}
      const snapshotRef = db.collection("daily_snapshots").doc(dateKey);
      await snapshotRef.set({
        date: dateKey,
        capturedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalStudentsCount: eligibleStudents.length,
        totalRoundsPlayedYesterday,
        dailyChampion: champion
          ? {
              id: champion.id,
              name: champion.name,
              totalScore: champion.totalScore,
              cohortYear: champion.cohortYear,
            }
          : null,
        top10: top10.map((s, index) => ({
          rank: index + 1,
          id: s.id,
          name: s.name,
          totalScore: s.totalScore,
          bestStreak: s.bestStreak,
          cohortYear: s.cohortYear,
        })),
      });

      logger.info(
        `Daily snapshot archived for ${dateKey}: Champion is ${champion?.name || "None"} (${champion?.totalScore || 0} pts), ${eligibleStudents.length} total students recorded.`
      );
    } catch (err: any) {
      logger.error(`Error during daily midnight maintenance: ${err.message}`, err);
    }
  }
);
