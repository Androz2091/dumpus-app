"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DEFAULT_PACKAGE_API_URL } from "~/constants";
import usePackageAPI from "~/hooks/use-package-api";
import useSQLInit, { loadErrorCode } from "~/hooks/use-sql-init";
import { useAppStore } from "~/stores";

type API = ReturnType<typeof usePackageAPI>;

function useURLParams() {
  const searchParams = useSearchParams();

  const packageLink = searchParams?.get("packageLink") || undefined;
  const backendURL = searchParams?.get("backendURL") || undefined;
  const UPNKey = packageLink
    ? new URL(packageLink).searchParams.get("upn") || undefined
    : undefined;
  // The processor major.minor offered, when the banner asked to read again a
  // package the app already has. It's in the queries' keys: a package imported
  // earlier in the session has answers cached under the same link and id.
  const reprocess = searchParams?.get("reprocess") || undefined;

  return { packageLink, backendURL, UPNKey, reprocess };
}

function useProcess({
  api,
  packageLink,
  reprocess,
  enabled,
}: {
  api: API;
  packageLink: string;
  reprocess?: string;
  enabled: boolean;
}) {
  const { data, status } = useQuery({
    queryKey: ["package-api", "process", packageLink, reprocess],
    queryFn: () => api.process({ packageLink, reprocess: !!reprocess }),
    enabled,
    staleTime: Infinity,
  });

  return { data, status };
}

function useStatus({
  api,
  packageID,
  UPNKey,
  reprocess,
  enabled,
}: {
  api: API;
  packageID: string;
  UPNKey: string;
  reprocess?: string;
  enabled: boolean;
}) {
  const [erroredStatus, setErroredStatus] = useState(false);

  const { data, status } = useQuery({
    queryKey: ["package-api", "status", packageID, reprocess],
    queryFn: () =>
      api.status({
        packageID,
        UPNKey,
        reprocess: !!reprocess,
      }),
    enabled: enabled && !erroredStatus,
    refetchInterval: 1000, // 1s
  });

  useEffect(() => {
    setErroredStatus(!!data?.isErrored);
  }, [data]);

  return { data, status };
}

function useData({
  api,
  packageID,
  UPNKey,
  reprocess,
  enabled,
}: {
  api: API;
  packageID: string;
  UPNKey: string;
  reprocess?: string;
  enabled: boolean;
}) {
  const { data, status } = useQuery({
    queryKey: ["package-api", "data", packageID, reprocess],
    queryFn: () => api.data({ packageID, UPNKey }),
    enabled,
    staleTime: Infinity,
  });

  return { data, status };
}

function useRedirect({
  packageID,
  initialData,
  packageLink,
  UPNKey,
  backendURL,
  reprocess,
  afterInit,
}: {
  packageID: string;
  initialData?: ArrayBuffer;
  packageLink: string;
  UPNKey: string;
  backendURL?: string;
  reprocess?: string;
  afterInit: () => void;
}) {
  const router = useRouter();
  const { init } = useSQLInit();
  const [selectedID, getNextID] = useAppStore(
    useShallow(({ config, database }) => [
      config.selectedID,
      database.getNextID,
    ]),
  );

  const nextID = getNextID(selectedID);

  const { error } = useQuery({
    queryKey: ["package-loading", "redirect", packageID, reprocess],
    queryFn: async () => {
      await init({
        id: nextID,
        initData: {
          initialData: initialData!,
          packageLink,
          UPNKey,
          backendURL: backendURL || DEFAULT_PACKAGE_API_URL,
        },
      });
      afterInit();
      router.replace("/overview");
      return null;
    },
    enabled: !!initialData,
    staleTime: Infinity,
    // A package the device couldn't keep won't fit on a second try either.
    retry: false,
  });

  return error ? loadErrorCode(error) : null;
}

export default function useLogic() {
  const { packageLink, backendURL, UPNKey, reprocess } = useURLParams();
  const api = usePackageAPI({ baseURL: backendURL });
  const [setLoadingData, setPackage, selectedID] = useAppStore(
    useShallow(({ config }) => [
      config.setLoadingData,
      config.setPackage,
      config.selectedID,
    ]),
  );

  const process = useProcess({
    api,
    packageLink: packageLink || "",
    reprocess,
    enabled: !!packageLink,
  });

  const processValid = !!process.data?.isAccepted;
  const packageID = process.data?.packageId;

  // Keyed by what was submitted, so a second link in the same session is
  // saved too, and a reload comes back to its loading page.
  useQuery({
    queryKey: ["package-api", "save-state", packageLink, backendURL, reprocess],
    queryFn: () => {
      setLoadingData({ packageLink: packageLink!, backendURL, reprocess });
      return null;
    },
    staleTime: Infinity,
    enabled: processValid,
  });

  const status = useStatus({
    api,
    packageID: packageID || "",
    UPNKey: UPNKey || "",
    reprocess,
    enabled: processValid,
  });

  const data = useData({
    api,
    packageID: packageID || "",
    UPNKey: UPNKey || "",
    reprocess,
    enabled: status.data?.processingStep === "PROCESSED",
  });

  const importError = useRedirect({
    packageID: packageID || "",
    initialData: data.data?.data || undefined,
    packageLink: packageLink || "",
    UPNKey: UPNKey || "",
    backendURL,
    reprocess,
    afterInit: () => {
      setLoadingData(undefined);
    },
  });

  const error =
    process.data?.errorMessageCode ||
    // The link couldn't be sent, or the answer wasn't JSON.
    (process.status === "error" ? "UNKNOWN_ERROR" : null) ||
    status.data?.errorMessageCode ||
    data.data?.errorMessageCode ||
    // The download or its decryption failed.
    (data.status === "error" ? "UNKNOWN_ERROR" : null) ||
    importError ||
    null;

  useEffect(() => {
    if (error) {
      setLoadingData(undefined);
    }
    // That link won't work again, so the banner stops offering this version.
    if (error === "EXPIRED_LINK" && reprocess && selectedID) {
      setPackage(selectedID, { reprocessDismissedVersion: reprocess });
    }
  }, [error, setLoadingData, reprocess, selectedID, setPackage]);

  return { process, status, data, error, reprocess };
}
