"use client";

import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import useSQLInit from "~/hooks/use-sql-init";
import { useAppStore } from "~/stores";

/**
 * Deletes package `id`. The package that is left opens first, so that the
 * app never shows it with the deleted package's database.
 */
export default function useDeletePackage() {
  const router = useRouter();
  const [packages, deletePackage] = useAppStore(
    useShallow(({ config }) => [config.packages, config.deletePackage]),
  );
  const { init } = useSQLInit();

  return async (id: string) => {
    const next = packages.find((pkg) => pkg.id !== id);
    if (next) await init({ id: next.id });
    deletePackage({ id, router });
  };
}
