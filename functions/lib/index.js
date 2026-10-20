"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyMidnightMaintenance = exports.stripeWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const auth = admin.auth();
// Define secrets stored in Cloud Secret Manager
const stripeSecretKey = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
const stripeWebhookSecret = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
/**
 * Stripe Webhook Handler (Firebase Cloud Functions v2)
 *
 * Verifies Stripe cryptographic signature using rawBody and handles:
 * - checkout.session.completed: Grant Pro status & Pro custom claim
 * - customer.subscription.updated: Update subscription active status
 * - customer.subscription.deleted: Revoke Pro status & Pro custom claim
 */
exports.stripeWebhook = (0, https_1.onRequest)({
    secrets: [stripeSecretKey, stripeWebhookSecret],
    cors: false,
}, async (req, res) => {
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
    const stripe = new stripe_1.default(secretKey, {
        apiVersion: "2025-02-24.acacia",
    });
    let event;
    try {
        // req.rawBody is provided by Cloud Functions (v2) https onRequest
        const rawBody = req.rawBody;
        if (!rawBody) {
            throw new Error("Missing rawBody on request. Signature verification requires raw bytes.");
        }
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    }
    catch (err) {
        logger.error(`Webhook signature verification failed: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    logger.info(`Received verified Stripe event: ${event.type} [${event.id}]`);
    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const uid = session.client_reference_id;
                const customerId = typeof session.customer === "string"
                    ? session.customer
                    : session.customer?.id || null;
                const subscriptionId = typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription?.id || null;
                if (!uid) {
                    logger.warn(`checkout.session.completed received without client_reference_id (Session: ${session.id})`);
                    break;
                }
                logger.info(`Upgrading user ${uid} to Pro (Customer: ${customerId}, Sub: ${subscriptionId})`);
                // 1. Update /users/{uid} document in Firestore
                await db.collection("users").doc(uid).set({
                    isPro: true,
                    role: "pro",
                    stripeCustomerId: customerId,
                    subscriptionId: subscriptionId,
                    subscriptionStatus: "active",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                // 2. Set Firebase Auth custom claims: { pro: true }
                try {
                    const userRecord = await auth.getUser(uid);
                    const currentClaims = userRecord.customClaims || {};
                    await auth.setCustomUserClaims(uid, {
                        ...currentClaims,
                        pro: true,
                    });
                    logger.info(`Custom claim { pro: true } successfully assigned to user ${uid}`);
                }
                catch (authErr) {
                    logger.error(`Error updating custom claims for user ${uid}: ${authErr.message}`);
                }
                break;
            }
            case "customer.subscription.updated": {
                const subscription = event.data.object;
                const customerId = typeof subscription.customer === "string"
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
                }
                catch (authErr) {
                    logger.error(`Error syncing custom claim on subscription update for ${uid}: ${authErr.message}`);
                }
                break;
            }
            case "customer.subscription.deleted": {
                const subscription = event.data.object;
                const customerId = typeof subscription.customer === "string"
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
                    const { pro: _omitted, ...updatedClaims } = currentClaims;
                    await auth.setCustomUserClaims(uid, {
                        ...updatedClaims,
                        pro: false,
                    });
                    logger.info(`Revoked Pro claim for user ${uid}`);
                }
                catch (authErr) {
                    logger.error(`Error revoking custom claims for user ${uid}: ${authErr.message}`);
                }
                break;
            }
            default:
                logger.info(`Unhandled event type: ${event.type}`);
        }
        res.status(200).json({ received: true });
    }
    catch (handlerErr) {
        logger.error(`Error processing Stripe event ${event.id}: ${handlerErr.message}`, handlerErr);
        res.status(500).send(`Webhook handler error: ${handlerErr.message}`);
    }
});
/**
 * Daily Midnight Maintenance (Firebase Cloud Functions v2 Scheduler)
 *
 * Runs automatically every night at 00:00 Europe/London (midnight UK time).
 * - Snapshots the day's top leaderboard students into /daily_snapshots/{YYYY-MM-DD}
 * - Calculates and logs daily cohort statistics (active players, average score)
 * - Safe and non-destructive: does not modify or delete student progress
 */
exports.dailyMidnightMaintenance = (0, scheduler_1.onSchedule)({
    schedule: "0 0 * * *",
    timeZone: "Europe/London",
}, async (event) => {
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
        const eligibleStudents = [];
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
                const sumRounds = Object.values(rounds).reduce((a, b) => (a || 0) + (b || 0), 0);
                totalRoundsPlayedYesterday += sumRounds;
            }
        }
        // Sort by score descending, then best streak
        eligibleStudents.sort((a, b) => {
            if (b.totalScore !== a.totalScore)
                return b.totalScore - a.totalScore;
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
        logger.info(`Daily snapshot archived for ${dateKey}: Champion is ${champion?.name || "None"} (${champion?.totalScore || 0} pts), ${eligibleStudents.length} total students recorded.`);
    }
    catch (err) {
        logger.error(`Error during daily midnight maintenance: ${err.message}`, err);
    }
});
//# sourceMappingURL=index.js.map