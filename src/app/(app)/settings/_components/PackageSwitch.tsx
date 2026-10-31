"use client";

import { ChevronRightIcon, XCircleIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import Button from "~/components/Button";
import Section from "~/components/Section";
import { afterNextPaint } from "~/components/after-paint";
import DetailCard from "~/components/data/DetailCard";
import useSQLInit from "~/hooks/use-sql-init";
import useToast from "~/hooks/use-toast";
import { useTranslation } from "~/i18n/client";
import { useAppStore } from "~/stores";
import { formatDate } from "~/utils/format";
import { queryClient } from "~/utils/react-query";

export default function PackageSwitch() {
  const { t } = useTranslation();
  // The package being opened, and the one selected when it was tapped: the
  // list keeps its rows, so the tapped one stays in place, spinning.
  const [switching, setSwitching] = useState<{
    id: string;
    from: string | null;
  } | null>(null);
  const router = useRouter();
  const { init } = useSQLInit();
  const toast = useToast();
  const [setSelectedID, selectedID, packages] = useAppStore(
    useShallow(({ config }) => [
      config.setSelectedID,
      config.selectedID,
      config.packages,
    ]),
  );
  const getUnselectedPackages = useAppStore(
    ({ config }) => config.getUnselectedPackages,
  );
  const unselectedPackages = getUnselectedPackages(
    packages,
    switching ? switching.from : selectedID,
  );

  // During reset
  if (packages.length === 0) return null;

  return (
    <Section title={t("settings.packageSwitch.title")}>
      <div className="grid grid-cols-1 gap-2 px-2 sm:grid-cols-2">
        {unselectedPackages
          .map((e, i) => ({ ...e, rank: i + 1 }))
          .map(({ id, rank, package_owner_name, dateAdded }) => (
            <DetailCard.WithRank
              key={rank}
              rank={rank}
              title={package_owner_name}
              description={t("settings.packageSwitch.description", {
                date: formatDate(dateAdded, {
                  hour: false,
                  minute: false,
                }),
              })}
              reverseTexts
              onClick={() => {
                if (switching) return;
                const from = selectedID;
                setSwitching({ id, from });
                // Reading the package holds the main thread: the pending row
                // is painted first.
                afterNextPaint(() => {
                  setSelectedID(id);
                  init({ id })
                    .then(() => {
                      router.push("/overview/");
                    })
                    .catch(() => {
                      // The open database is still the previous package's.
                      setSelectedID(from);
                      setSwitching(null);
                      toast({
                        variant: "danger",
                        title: t("error.error"),
                        description: t("onboarding.loading.unknownError"),
                        icon: XCircleIcon,
                      });
                    });
                });
              }}
              rightIcon={ChevronRightIcon}
              pending={switching?.id === id}
              disabled={switching !== null && switching.id !== id}
            />
          ))}
        <Button asChild variant="brand">
          <Link onClick={() => queryClient.clear()} href="/onboarding/access">
            {t("settings.actions.addPackage")}
          </Link>
        </Button>
      </div>
    </Section>
  );
}
