"use client";

import { SparklesIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "~/components/Button";
import { fromVersion } from "~/hooks/data/_availability";
import usePackageAPI from "~/hooks/use-package-api";
import useSQL from "~/hooks/use-sql";
import { useTranslation } from "~/i18n/client";
import { useAppStore, useSelectedPackage } from "~/stores";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default function ReprocessBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const sql = useSQL();
  const selectedPackage = useSelectedPackage();
  const setPackage = useAppStore(({ config }) => config.setPackage);
  const api = usePackageAPI({ baseURL: selectedPackage?.backendURL });
  // `setPackage` keeps the list, so the store doesn't render this again.
  const [dismissed, setDismissed] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const { data } = useQuery({
    queryKey: ["package-api", "version-check", selectedPackage?.package_id],
    queryFn: () =>
      api.status({
        packageID: selectedPackage.package_id,
        UPNKey: selectedPackage.UPNKey,
      }),
    // A package added over 30 days ago was submitted before that, so the API's
    // answer is already known. The demo has no key to ask with.
    enabled:
      selectedPackage?.package_id !== "demo" &&
      openedAt - Date.parse(selectedPackage?.dateAdded) < THIRTY_DAYS,
    // Each call is a Lambda and a database connection: once per app start,
    // however many times the overview opens and even when the call fails.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Major.minor: a patch doesn't read more of a package, so it doesn't prompt,
  // and doesn't bring the banner back once dismissed.
  const offered = data?.currentVersion?.split(".").slice(0, 2).join(".");

  if (
    !data?.canReprocess ||
    !offered ||
    dismissed ||
    selectedPackage.reprocessDismissedVersion === offered ||
    fromVersion(sql, offered)
  ) {
    return null;
  }

  const packageLink = `https://click.discord.com/ls/click?upn=${selectedPackage.UPNKey}`;

  return (
    <div className="desktop-container px-2 pt-4 sm:pt-8">
      <div className="space-y-2 rounded-lg bg-gray-900 p-2">
        <div className="flex space-x-2">
          <SparklesIcon className="h-8 w-8 shrink-0 text-brand-300" />
          <div>
            <div className="font-semibold text-white">
              {t("reprocess.title")}
            </div>
            <div className="text-sm text-gray-400">
              {t("reprocess.description")}
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <Button
            size="sm"
            variant="gray"
            onClick={() => {
              setDismissed(true);
              setPackage(selectedPackage.id, {
                reprocessDismissedVersion: offered,
              });
            }}
          >
            {t("reprocess.notNow")}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              router.push(
                `/onboarding/loading/?packageLink=${encodeURIComponent(
                  packageLink,
                )}&backendURL=${encodeURIComponent(
                  selectedPackage.backendURL || "",
                )}&reprocess=${encodeURIComponent(offered)}`,
              )
            }
          >
            {t("reprocess.update")}
          </Button>
        </div>
      </div>
    </div>
  );
}
