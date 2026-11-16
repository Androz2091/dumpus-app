"use client";

import { useState } from "react";
import Button from "~/components/Button";
import useDeletePackage from "~/hooks/use-delete-package";
import { useSelectedPackage } from "~/stores";
import { useTranslation } from "~/i18n/client";

export default function ExitDemoBanner() {
  const { t } = useTranslation();
  const deletePackage = useDeletePackage();
  const { package_id, id } = useSelectedPackage();

  const [loading, setLoading] = useState(false);
  const demo = package_id === "demo";

  async function handler() {
    setLoading(true);
    if (!(await deletePackage(id))) setLoading(false);
  }

  if (!demo) return null;

  return (
    <Button
      onClick={(e) => handler()}
      disabled={loading}
      size="sm"
      className="rounded-none [--press-scale:0.99]"
    >
      {loading ? t("exitingDemo") : t("exitDemo")}
    </Button>
  );
}
