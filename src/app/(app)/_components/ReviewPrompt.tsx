"use client";

import { useEffect } from "react";
import { askForReviewLater, canReview } from "~/capacitor/review";
import { useAppStore, useSelectedPackage } from "~/stores";

/** The demo never asks: its stats aren't the user's. */
export default function ReviewPrompt() {
  // Undefined for a render while a reset clears the packages.
  const demo = useSelectedPackage()?.package_id === "demo";
  // Never over a dialog. The recap asks after a share instead.
  const dialogOpen = useAppStore(
    ({ ui }) => ui.showSharePopup || ui.showInAppPurchasesDialog,
  );

  useEffect(() => {
    if (!canReview || demo || dialogOpen) return;
    return askForReviewLater();
  }, [demo, dialogOpen]);

  return null;
}
