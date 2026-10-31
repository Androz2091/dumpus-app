"use client";

import { OS } from "~/constants";
import { createLogger } from "~/utils/logger";

const logger = createLogger({ tag: "review" });

const APP_STORE_ID = "6450952260";
const STORAGE_KEY = "review-prompt";
/** The prompt waits for this many app opens with the user's own package. */
const PROMPT_FROM_OPEN = 3;
/** Time to look at their stats before being asked. */
const PROMPT_DELAY_MS = 10_000;

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

type PromptState = { opens: number; prompted: boolean };

function readState(): PromptState {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof state?.opens === "number") return state;
  } catch {}
  return { opens: 0, prompted: false };
}

function writeState(state: PromptState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

let countedThisLaunch = false;

/**
 * Counts this launch as an open and, from the third, asks for a review with
 * the system's prompt, once ever. Returns what cancels a prompt still
 * waiting.
 */
export function countOpenForReview() {
  let state = readState();
  if (state.prompted) return;
  if (!countedThisLaunch) {
    countedThisLaunch = true;
    state = { ...state, opens: state.opens + 1 };
    writeState(state);
  }
  if (state.opens < PROMPT_FROM_OPEN) return;

  const timer = setTimeout(async () => {
    if (document.visibilityState !== "visible") return;
    writeState({ ...state, prompted: true });
    try {
      const { AppReview } = await import("@capawesome/capacitor-app-review");
      await AppReview.requestReview();
    } catch (err) {
      logger.error("couldn't ask for a review", err);
    }
  }, PROMPT_DELAY_MS);
  return () => clearTimeout(timer);
}
