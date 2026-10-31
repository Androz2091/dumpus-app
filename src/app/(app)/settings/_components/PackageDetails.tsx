"use client";

import { useTranslation } from "~/i18n/client";
import { ClipboardDocumentIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "~/components/Button";
import Section from "~/components/Section";
import DetailCard from "~/components/data/DetailCard";
import usePackageAPI from "~/hooks/use-package-api";
import { useAppStore, useSelectedPackage } from "~/stores";
import { formatDate } from "~/utils/format";
import useCopy from "../_hooks/use-copy";

export default function PackageDetails() {
  const { t } = useTranslation();
  const router = useRouter();
  const selectedPackage = useSelectedPackage();
  const deletePackage = useAppStore(({ config }) => config.deletePackage);
  const api = usePackageAPI({ baseURL: selectedPackage?.backendURL });
  const copy = useCopy();
  const [deleting, setDeleting] = useState(false);

  // During reset
  if (!selectedPackage) return null;

  async function onDelete() {
    setDeleting(true);

    const { package_id, UPNKey, id } = selectedPackage;

    if (package_id !== "demo") {
      await api.remove({
        packageID: package_id,
        UPNKey,
      });
    }

    deletePackage({
      id,
      router,
    });
    setDeleting(false);
  }

  return (
    <Section title={t("settings.packageDetails.title")}>
      <div className="grid grid-cols-1 gap-2 px-2 sm:grid-cols-2">
        <DetailCard
          onClick={() => copy(selectedPackage.UPNKey)}
          title={selectedPackage.UPNKey}
          description={t("settings.packageDetails.UPNKey")}
          reverseTexts
          rightIcon={ClipboardDocumentIcon}
        />
        <DetailCard
          onClick={() =>
            copy(
              formatDate(selectedPackage.dateAdded, {
                hour: false,
                minute: false,
              }),
            )
          }
          title={formatDate(selectedPackage.dateAdded, {
            hour: false,
            minute: false,
          })}
          description={t("settings.packageDetails.dateAdded")}
          reverseTexts
          rightIcon={ClipboardDocumentIcon}
        />
        <DetailCard
          onClick={() => copy(selectedPackage.package_id)}
          title={selectedPackage.package_id}
          description={t("settings.packageDetails.packageID")}
          reverseTexts
          rightIcon={ClipboardDocumentIcon}
        />
        <DetailCard
          onClick={() => copy(selectedPackage.package_owner_name)}
          title={selectedPackage.package_owner_name}
          description={t("settings.packageDetails.discordUser")}
          reverseTexts
          rightIcon={ClipboardDocumentIcon}
        />
        <DetailCard
          onClick={() => copy(selectedPackage.backendURL)}
          title={selectedPackage.backendURL}
          description={t("settings.packageDetails.backendURL")}
          reverseTexts
          rightIcon={ClipboardDocumentIcon}
        />
        <Button variant="danger" onClick={onDelete} disabled={deleting}>
          {deleting
            ? t("settings.actions.deleting")
            : t("settings.actions.delete")}
        </Button>
      </div>
    </Section>
  );
}
