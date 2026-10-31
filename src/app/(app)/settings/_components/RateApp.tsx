"use client";

import { ArrowTopRightOnSquareIcon, StarIcon } from "@heroicons/react/24/solid";
import DetailCard from "~/components/data/DetailCard";
import { canReview, openStoreReview } from "~/capacitor/review";
import { OS } from "~/constants";
import { useTranslation } from "~/i18n/client";

export default function RateApp() {
  const { t } = useTranslation();

  if (!canReview) return null;

  return (
    <DetailCard
      title={OS === "ios" ? "App Store" : "Google Play"}
      description={t("settings.about.rate")}
      onClick={() => openStoreReview()}
      reverseTexts
      leftSlot={<StarIcon className="h-8 w-8" />}
      rightIcon={ArrowTopRightOnSquareIcon}
    />
  );
}
