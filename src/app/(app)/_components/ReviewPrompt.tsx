"use client";

import { useEffect } from "react";
import { canReview, countOpenForReview } from "~/capacitor/review";
import { useSelectedPackage } from "~/stores";

/** Opens with the demo don't count: its stats aren't the user's. */
export default function ReviewPrompt() {
  // Undefined for a render while a reset clears the packages.
  const demo = useSelectedPackage()?.package_id === "demo";

  useEffect(() => {
    if (!canReview || demo) return;
    return countOpenForReview();
  }, [demo]);

  return null;
}
