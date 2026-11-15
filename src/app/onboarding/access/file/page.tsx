"use client";

import { XCircleIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import Button from "~/components/Button";
import EmptyState from "~/components/EmptyState";
import RenderMarkdown from "~/components/RenderMarkdown";
import { DEFAULT_PACKAGE_API_URL } from "~/constants";
import useSQLInit from "~/hooks/use-sql-init";
import { useTranslation } from "~/i18n/client";
import {
  PackageReadError,
  isZip,
  readPackageFile,
} from "~/processor/read-file";
import { useAppStore } from "~/stores";
import { createLogger } from "~/utils/logger";

const logger = createLogger({ tag: "package file" });

type State =
  { step: "idle" } | { step: "reading" } | { step: "error"; message: string };

export default function Page() {
  const { t } = useTranslation();
  const router = useRouter();
  const { init } = useSQLInit();
  const [selectedID, getNextID, packages, setShowSharePopup] = useAppStore(
    useShallow(({ config, database, ui }) => [
      config.selectedID,
      database.getNextID,
      config.packages,
      ui.setShowSharePopup,
    ]),
  );
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: "idle" });

  async function read(file: File) {
    if (!(await isZip(file))) {
      setState({
        step: "error",
        message: t("onboarding.access.methods.file.errors.notZip"),
      });
      return;
    }
    setState({ step: "reading" });
    // Read before `init` adds this one.
    const firstPackage = packages.every(
      ({ package_id }) => package_id === "demo",
    );
    try {
      const pkg = await readPackageFile(file);
      await init({
        id: getNextID(selectedID),
        initData: {
          initialData: new Uint8Array(pkg.gzipped).buffer,
          packageLink: "",
          UPNKey: pkg.key,
          backendURL: DEFAULT_PACKAGE_API_URL,
          source: "file",
        },
      });
      router.replace("/overview");
      // The first package opens on its recap, as one read from a link does.
      if (firstPackage) setShowSharePopup(true);
    } catch (err) {
      logger.error("couldn't read the package file", err);
      setState({
        step: "error",
        message:
          err instanceof PackageReadError && err.code === "MISSING_USER_DATA"
            ? t("onboarding.loading.missingUserData")
            : t("onboarding.access.methods.file.errors.unknown"),
      });
    }
  }

  const choose = (
    <Button
      className="w-full"
      disabled={state.step === "reading"}
      onClick={() => input.current?.click()}
    >
      {state.step === "error"
        ? t("onboarding.access.methods.file.errors.tryAgain")
        : t("onboarding.access.methods.file.choose")}
    </Button>
  );

  return (
    <div className="flex flex-col items-center space-y-4">
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same file chosen again after an error is a change too.
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      {state.step === "reading" ? (
        <div className="max-w-xs text-center" aria-live="polite">
          <h1 className="text-xl font-bold text-white">
            {t("onboarding.access.methods.file.reading")}
          </h1>
          <p className="mt-2 text-gray-400">
            {t("onboarding.access.methods.file.readingHint")}
          </p>
          <div className="mt-4 h-1 w-full animate-pulse rounded-full bg-brand-300 motion-reduce:animate-none" />
        </div>
      ) : state.step === "error" ? (
        <>
          <EmptyState
            icon={XCircleIcon}
            title={t("onboarding.loading.error")}
            description={state.message}
          />
          {choose}
        </>
      ) : (
        <>
          <div className="max-w-xs text-center">
            <h1 className="text-xl font-bold text-white">
              {t("onboarding.access.methods.file.title")}
            </h1>
            <p className="mt-2 text-gray-400">
              <RenderMarkdown
                content={t("onboarding.access.methods.file.description")}
              />
            </p>
          </div>
          <div className="max-w-xs text-center">
            <p className="text-gray-400 transition [&>a]:text-brand-300 [&>a]:underline [&>a]:hover:text-brand-400">
              <RenderMarkdown
                content={t("onboarding.access.methods.link.notice")}
              />
            </p>
          </div>
          {choose}
        </>
      )}
    </div>
  );
}
