"use client";

import { useState } from "react";
import Button from "~/components/Button";
import Section from "~/components/Section";
import { useTranslation } from "~/i18n/client";
import { useAppStore } from "~/stores";

export default function Actions() {
  const { t } = useTranslation();
  const restorePurchases = useAppStore(
    ({ purchases }) => purchases.restorePurchases,
  );

  const [loading, setLoading] = useState(false);

  if (process.env.NEXT_PUBLIC_DEPLOY_ENV !== "mobile") return null;

  return (
    <Section title={t("settings.actions.title")}>
      <div className="grid grid-cols-1 gap-2 px-2 sm:grid-cols-2">
        <Button
          variant="premium"
          onClick={async () => {
            setLoading(true);
            await restorePurchases();
            setLoading(false);
          }}
          disabled={loading}
        >
          {loading
            ? t("settings.actions.restoring")
            : t("settings.actions.restorePurchases")}
        </Button>
      </div>
    </Section>
  );
}
