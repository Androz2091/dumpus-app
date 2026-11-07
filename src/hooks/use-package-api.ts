"use client";

import { DEFAULT_PACKAGE_API_URL } from "~/constants";
import type {
  PackageAPIBlobResponse,
  PackageAPIDataResponse,
  PackageAPIProcessResponse,
  PackageAPIRemoveResponse,
  PackageAPIStatusResponse,
  PackageAPIUserResponse,
} from "~/types/package-api";
import { checkFailedDownload, inStep, StepError } from "~/utils/client-error";
import { decryptPackageBlob } from "~/utils/crypto";
import { lookup } from "~/utils/lookups";

export default function usePackageAPI({
  baseURL = DEFAULT_PACKAGE_API_URL,
}: {
  baseURL?: string;
}) {
  function api({
    path,
    method,
    headers,
    body,
  }: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    headers?: HeadersInit;
    body?: unknown;
  }) {
    return fetch(baseURL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  }

  async function process({
    packageLink,
    reprocess = false,
  }: {
    packageLink: string;
    reprocess?: boolean;
  }) {
    const data = (await api({
      path: "/process",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: { package_link: packageLink, ...(reprocess && { reprocess }) },
    }).then((res) => res.json())) as PackageAPIProcessResponse;
    return data;
  }

  async function status({
    packageID,
    UPNKey,
    reprocess = false,
  }: {
    packageID: string;
    UPNKey: string;
    reprocess?: boolean;
  }) {
    const data = (await api({
      path: `/process/${packageID}/status${reprocess ? "?reprocess=true" : ""}`,
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${UPNKey}`,
      },
    }).then((res) => res.json())) as PackageAPIStatusResponse;
    return data;
  }

  async function data({
    packageID,
    UPNKey,
  }: {
    packageID: string;
    UPNKey: string;
  }): Promise<PackageAPIDataResponse> {
    // /blob returns a presigned S3 URL the client downloads directly,
    // bypassing the API Gateway slow path. The blob is encrypted; we
    // decrypt here using the UPN so the key never reaches the server.
    // Demo packages are unencrypted (iv=null).
    const blobResponse = await inStep("blob", () =>
      api({
        path: `/process/${packageID}/blob`,
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${UPNKey}`,
        },
      }),
    );

    if (blobResponse.status === 401) {
      return { data: null, errorMessageCode: "UNAUTHORIZED" };
    }
    if (blobResponse.status === 404) {
      return { data: null, errorMessageCode: "UNKNOWN_PACKAGE_ID" };
    }
    if (!blobResponse.ok) {
      throw new StepError("blob", { status: blobResponse.status });
    }

    const { url, iv } = await inStep(
      "blob",
      () => blobResponse.json() as Promise<PackageAPIBlobResponse>,
    );

    // S3's access logs keep the referrer, and this page's URL holds the link.
    const downloadStart = performance.now();
    const objectResponse = await inStep("download", () =>
      fetch(url, { referrerPolicy: "no-referrer" }).catch((err) => {
        checkFailedDownload(url, performance.now() - downloadStart);
        throw err;
      }),
    );
    if (!objectResponse.ok) {
      throw new StepError("download", { status: objectResponse.status });
    }
    const downloaded = await inStep("download", () =>
      objectResponse.arrayBuffer(),
    );

    const decrypted = iv
      ? await inStep("decrypt", () =>
          decryptPackageBlob(downloaded, iv, UPNKey),
        )
      : downloaded;

    return { data: decrypted, errorMessageCode: null };
  }

  async function remove({
    packageID,
    UPNKey,
  }: {
    packageID: string;
    UPNKey: string;
  }) {
    const data = (await api({
      path: `/process/${packageID}`,
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${UPNKey}`,
      },
    }).then((res) => res.json())) as PackageAPIRemoveResponse;
    return data;
  }

  async function user({
    packageID,
    UPNKey,
    userID,
  }: {
    packageID: string;
    UPNKey: string;
    userID: string;
  }) {
    // The demo has no key, so the API always refuses its user lookups:
    // answer its 401 here instead of asking.
    const response =
      packageID === "demo"
        ? new Response(null, { status: 401 })
        : await lookup(() =>
            api({
              path: `/process/${packageID}/user/${userID}`,
              method: "GET",
              headers: {
                Accept: "text/plain",
                Authorization: `Bearer ${UPNKey}`,
              },
            }),
          );

    const data: PackageAPIUserResponse =
      response.status === 401
        ? { errorMessageCode: "UNAUTHORIZED" }
        : response.status === 404
          ? { errorMessageCode: "UNKNOWN_USER_ID" }
          : response.status === 429
            ? { errorMessageCode: "RATE_LIMITED" }
            : !response.ok
              ? { errorMessageCode: "FETCH_ERROR" }
              : { ...(await response.json()), errorMessageCode: null };

    return data;
  }

  async function isAlive() {
    try {
      const response = await api({ path: "/health", method: "GET" });
      const { status } = (await response.json()) as { status?: unknown };
      return status === "alive";
    } catch {
      return false;
    }
  }

  return { process, status, data, remove, user, isAlive };
}
