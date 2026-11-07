import { useTranslation } from "~/i18n/client";

export default function FailureCode({ code }: { code?: string | null }) {
  const { t } = useTranslation();
  if (!code) return null;
  return (
    <>
      <p className="mb-4 text-center font-mono text-xs text-gray-500">{code}</p>
      {/* `fetch` throws a TypeError when the download gets no answer at all. */}
      {code === "download-TypeError" && (
        <p className="mx-auto mb-4 max-w-xs text-center text-sm text-gray-400">
          {t("onboarding.loading.downloadBlocked")}
        </p>
      )}
    </>
  );
}
