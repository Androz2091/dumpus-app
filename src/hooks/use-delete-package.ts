"use client";

import { XCircleIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import useSQLInit from "~/hooks/use-sql-init";
import useToast from "~/hooks/use-toast";
import { useTranslation } from "~/i18n/client";
import { useAppStore } from "~/stores";
import { reportClientError } from "~/utils/client-error";

/**
 * Deletes package `id`. The package that is left opens first, so that the
 * app never shows it with the deleted package's database, and so that
 * nothing is deleted when it can't be opened; `removeFromServer` runs after
 * it. Resolves to whether the package was deleted: a failure puts the
 * database back and says so in a toast.
 */
export default function useDeletePackage() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [packages, deletePackage, setDB] = useAppStore(
    useShallow(({ config, database }) => [
      config.packages,
      config.deletePackage,
      database.setDB,
    ]),
  );
  // Not `init`, which opens once per component: a screen can delete twice.
  const { open } = useSQLInit();

  return async (id: string, removeFromServer?: () => Promise<unknown>) => {
    const next = packages.find((pkg) => pkg.id !== id);
    const previous = useAppStore.getState().database.db;
    try {
      if (next) {
        await open({ id: next.id }).catch((err: unknown) => {
          reportClientError({ error: err, step: "switch" });
          throw err;
        });
      }
      await removeFromServer?.();
    } catch {
      setDB(previous);
      toast({
        variant: "danger",
        title: t("error.error"),
        description: t("onboarding.loading.unknownError"),
        icon: XCircleIcon,
      });
      return false;
    }
    deletePackage({ id, router });
    return true;
  };
}
