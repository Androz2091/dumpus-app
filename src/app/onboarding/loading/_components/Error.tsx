import { useTranslation } from "~/i18n/client";
import { XCircleIcon } from "@heroicons/react/24/solid";
import EmptyState from "~/components/EmptyState";
import FailureCode from "~/components/FailureCode";
import Retry from "./Retry";

export default function Error({
  error,
  url,
  failure,
}: {
  error: string;
  url: string;
  failure?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      <EmptyState
        icon={XCircleIcon}
        title={t("onboarding.loading.error")}
        description={error}
      />
      <FailureCode code={failure} />
      <Retry show={true} url={url} />
    </>
  );
}
