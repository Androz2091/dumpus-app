import { XCircleIcon } from "@heroicons/react/24/solid";
import Button from "~/components/Button";
import EmptyState from "~/components/EmptyState";
import FailureCode from "~/components/FailureCode";
import { useTranslation } from "~/i18n/client";

export default function ReprocessError({
  error,
  failure,
}: {
  error: string;
  failure?: string | null;
}) {
  const { t } = useTranslation();

  return (
    <>
      <EmptyState
        icon={XCircleIcon}
        title={t("reprocess.errors.title")}
        description={
          error === "EXPIRED_LINK"
            ? t("reprocess.errors.expired")
            : error === "STORAGE_FULL"
              ? t("settings.actions.notEnoughStorage.description")
              : t("reprocess.errors.failed")
        }
      />
      <FailureCode code={failure} />
      {/* Through the app's start: a page reloaded here hasn't opened the
          package, which the stats need. */}
      <Button className="mx-auto" onClick={() => window.location.replace("/")}>
        {t("reprocess.errors.back")}
      </Button>
    </>
  );
}
