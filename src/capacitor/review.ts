"use client";

import { OS } from "~/constants";
import { createLogger } from "~/utils/logger";

const logger = createLogger({ tag: "review" });

const APP_STORE_ID = "6450952260";
const STORAGE_KEY = "review-prompt";
/** Time with their own stats on screen before being asked. */
const ASK_AFTER_MS = 60_000;
/** After a share, time for its sheet to close. */
const ASK_AFTER_SHARE_MS = 1_000;

/** The system's review prompt and the store apps are on iOS and Android only. */
export const canReview = OS !== "web";

// The plugin is never returned from an async function: Capacitor's plugin
// object answers any property, `then` included, so awaiting it hangs.

/**
 * The store's page for Dumpus, to write a review. A button opens it rather
 * than the system's prompt, which iOS and Google Play show a few times a
 * year at most and skip without telling the app.
 */
export async function openStoreReview() {
  try {
    const { AppReview } = await import("@capawesome/capacitor-app-review");
    await AppReview.openAppStore({ appId: APP_STORE_ID });
  } catch (err) {
    logger.error("couldn't open the store", err);
  }
}

function prompted() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return state?.prompted === true;
  } catch {
    return false;
  }
}

function askForReview(delay: number) {
  if (!canReview || prompted()) return;
  const timer = setTimeout(async () => {
    if (document.visibilityState !== "visible" || prompted()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompted: true }));
    } catch {}
    try {
      const { AppReview } = await import("@capawesome/capacitor-app-review");
      await AppReview.requestReview();
    } catch (err) {
      logger.error("couldn't ask for a review", err);
    }
  }, delay);
  return () => clearTimeout(timer);
}

export function askForReviewLater() {
  return askForReview(ASK_AFTER_MS);
}

export function askForReviewAfterShare() {
  askForReview(ASK_AFTER_SHARE_MS);
}
