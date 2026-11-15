import type { BrowserContext, Route } from "@playwright/test";
import { md5, type Dataset } from "./dataset";

// In-memory stand-in for https://api.dumpus.app, its presigned S3 downloads
// and the Discord CDN. Response shapes follow `api/src/app.py`.

const API_ORIGIN = "https://api.dumpus.app";
const BLOB_ORIGIN = "https://dumpus-packages.s3.eu-west-1.amazonaws.com";
const AWS_ORIGINS = [
  "https://s3.eu-west-1.amazonaws.com",
  "https://s3.us-east-1.amazonaws.com",
  "https://ec2.eu-west-1.amazonaws.com",
];
const CDN_ORIGIN = "https://cdn.discordapp.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const CORS = { "access-control-allow-origin": "*" };
// Every avatar and guild icon, a transparent pixel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export type Package = { dataset: Dataset; blob: Buffer; iv: string | null };

/** The copy of a package the app read from its file, posted to S3. */
export type Upload = {
  packageId: string;
  iv: string;
  body: Buffer;
  /** Once registered: the key the app sent, and the processor's version. */
  key?: string;
  version?: string;
};

type ProcessingStep = "LOCKED" | "DOWNLOADING" | "ANALYZING" | "PROCESSED";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: CORS,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function empty(route: Route, status: number) {
  return route.fulfill({ status, headers: CORS, body: "" });
}

/** `get_base_status_response()` */
function baseStatus() {
  return {
    isDataAvailable: false,
    isUpgraded: false,
    isErrored: false,
    errorMessageCode: null as string | null,
    isProcessing: false,
    processingStep: null as string | null,
    processingQueuePosition: {
      user: 0,
      total: 0,
      userWhenStarted: 0,
      totalWhenStarted: 0,
    },
  };
}

export class FakeApi {
  /** What `/status` reports for every package. */
  step: ProcessingStep = "PROCESSED";
  /** Requests to hosts no mock stands in for, the test fails if any. */
  readonly unexpected: string[] = [];
  /** The version `/status` announces, left out as an older server does. */
  currentVersion: string | null = null;
  /** What `/status?reprocess=true` reports. */
  runStep: ProcessingStep = "PROCESSED";
  /** What a `POST /process` asking for a reprocess is refused with. */
  reprocessError: string | null = null;
  /** The links of the `POST /process` that asked for a reprocess. */
  readonly reprocessLinks: string[] = [];
  /** How many times `/status` was asked outside a run. */
  statusChecks = 0;
  /** The bodies of `POST /client-error`. */
  readonly clientErrors: Record<string, unknown>[] = [];
  /** What the presigned download answers instead of the blob. */
  downloadStatus: number | null = null;
  /** The presigned download gets no answer at all, as under a network block. */
  downloadBlocked = false;
  /** The copies posted to S3, of the packages read from their file. */
  readonly uploads: Upload[] = [];

  private readonly packages: Package[];

  constructor(packages: Package[]) {
    // `finishRun` changes them, and the workers' tests share the originals.
    this.packages = packages.map((pkg) => ({ ...pkg }));
  }

  /** A reprocess ended: `/blob` serves its package from now on. */
  finishRun(
    packageId: string,
    { body, iv }: { body: Buffer; iv: string | null },
  ) {
    const pkg = this.packages.find(
      ({ dataset }) => dataset.packageId === packageId,
    )!;
    pkg.blob = body;
    pkg.iv = iv;
    this.runStep = "PROCESSED";
  }

  async install(context: BrowserContext) {
    // Registered first so every route below takes precedence over it.
    await context.route(
      (url) => !LOCAL_HOSTS.has(url.hostname),
      (route) => {
        this.unexpected.push(
          `${route.request().method()} ${route.request().url()}`,
        );
        return route.abort("blockedbyclient");
      },
    );
    await context.route(`${API_ORIGIN}/**`, (route) => this.api(route));
    await context.route(`${BLOB_ORIGIN}/**`, (route) =>
      route.request().method() === "POST"
        ? this.upload(route)
        : this.blob(route),
    );
    for (const origin of AWS_ORIGINS) {
      await context.route(`${origin}/**`, (route) => empty(route, 403));
    }
    await context.route(`${CDN_ORIGIN}/**`, (route) =>
      route.fulfill({ headers: CORS, contentType: "image/png", body: PNG }),
    );
  }

  private api(route: Route) {
    const request = route.request();
    const method = request.method();
    const { pathname, searchParams } = new URL(request.url());
    const authorization = request.headers()["authorization"];

    const [resource, id, ...rest] = pathname.split("/").filter(Boolean);
    const action = rest.join("/");

    if (method === "POST" && pathname === "/process") {
      const { package_link: link, reprocess } = request.postDataJSON();
      const pkg = this.packages.find(
        ({ dataset }) =>
          dataset.upn !== null &&
          link === `https://click.discord.com/ls/click?upn=${dataset.upn}`,
      );
      if (reprocess) {
        this.reprocessLinks.push(link);
        if (this.reprocessError) {
          return json(route, {
            isAccepted: false,
            packageId: pkg?.dataset.packageId,
            errorMessageCode: this.reprocessError,
          });
        }
      }
      return json(
        route,
        pkg
          ? {
              isAccepted: true,
              packageId: pkg.dataset.packageId,
              errorMessageCode: null,
            }
          : {
              isAccepted: false,
              packageId: null,
              errorMessageCode: "INVALID_LINK",
            },
      );
    }

    if (method === "POST" && pathname === "/client-error") {
      this.clientErrors.push(request.postDataJSON());
      return empty(route, 204);
    }

    if (method === "GET" && pathname === "/health") {
      return json(route, { status: "alive" });
    }

    if (method === "GET" && resource === "widget" && id && !action) {
      for (const { dataset } of this.packages) {
        const widget = dataset.widgets.get(id);
        if (widget) return json(route, widget);
      }
      return json(route, { error: "guild not found or bot lacks access" }, 404);
    }

    // Same rule as `check_authorization_bearer()`: the bearer is the UPN, or a
    // file's key, whose md5 is the package id.
    const key = authorization?.split(" ")[1];
    const authorized = !!key && md5(key) === id;
    if (
      resource === "process" &&
      method === "POST" &&
      action === "upload-url"
    ) {
      if (!authorized) return empty(route, 401);
      const { iv } = request.postDataJSON();
      return json(route, {
        url: `${BLOB_ORIGIN}/`,
        fields: { key: `packages/${id}.${iv}.bin`, policy: "e2e" },
      });
    }
    if (resource === "process" && method === "POST" && action === "upload") {
      if (!authorized) return empty(route, 401);
      const { iv, packageVersion } = request.postDataJSON();
      const upload = this.uploads.find(
        (upload) => upload.packageId === id && upload.iv === iv,
      );
      if (!upload) return empty(route, 409);
      Object.assign(upload, { key, version: packageVersion });
      return json(route, { isAccepted: true });
    }
    // A registered copy's users, as Discord would answer for them.
    const registered = this.uploads.some(
      (upload) => upload.packageId === id && upload.version,
    );
    if (
      resource === "process" &&
      registered &&
      method === "GET" &&
      rest[0] === "user" &&
      rest.length === 2
    ) {
      if (!authorized) return empty(route, 401);
      return json(route, {
        user_id: rest[1],
        display_name: null,
        avatar_url: `${CDN_ORIGIN}/embed/avatars/0.png`,
        username: `user_${rest[1].slice(-4)}`,
      });
    }

    const pkg = this.packages.find(({ dataset }) => dataset.packageId === id);
    if (resource === "process" && pkg) {
      if (method === "GET" && action === "blob" && id === "demo") {
        return json(route, this.blobBody(pkg));
      }

      if (!authorized) {
        return action === "status"
          ? json(
              route,
              { ...baseStatus(), errorMessageCode: "UNAUTHORIZED" },
              401,
            )
          : empty(route, 401);
      }

      if (method === "GET" && action === "status") {
        if (searchParams.get("reprocess") === "true") {
          return json(route, this.statusBody(this.runStep));
        }
        this.statusChecks++;
        return json(route, this.statusBody(this.step));
      }
      if (method === "GET" && action === "blob") {
        return json(route, this.blobBody(pkg));
      }
      if (method === "GET" && rest[0] === "user" && rest.length === 2) {
        const user = pkg.dataset.apiUsers.get(rest[1]);
        return user ? json(route, user) : empty(route, 500);
      }
    }

    // Flask's 404 handler.
    return json(route, { error: "Route not found." }, 404);
  }

  private blobBody({ dataset, iv }: Package) {
    return {
      url: `${BLOB_ORIGIN}/${dataset.packageId}?X-Amz-Expires=300`,
      iv,
      ttl: 300,
    };
  }

  private statusBody(step: ProcessingStep) {
    const base = {
      ...baseStatus(),
      processingStep: step,
      ...(this.currentVersion && {
        currentVersion: this.currentVersion,
        canReprocess: true,
      }),
    };
    if (step === "PROCESSED") return { ...base, isDataAvailable: true };
    return {
      ...base,
      isProcessing: true,
      processingQueuePosition: {
        ...base.processingQueuePosition,
        premiumQueueTotal: 0,
        standardQueueTotal: 12,
        premiumQueueUser: 0,
        standardQueueUser: 3,
        standardWhenJoined: 12,
        premiumWhenJoined: 0,
      },
    };
  }

  /** S3's answer to a presigned POST: the form's `key` names the blob. */
  private async upload(route: Route) {
    const request = route.request();
    const form = await new Response(
      new Uint8Array(request.postDataBuffer() ?? []),
      {
        headers: { "content-type": request.headers()["content-type"] },
      },
    ).formData();
    const [, packageId, iv] =
      /^packages\/([0-9a-f]{32})\.([0-9a-f]{32})\.bin$/.exec(
        String(form.get("key")),
      ) ?? [];
    const file = form.get("file");
    if (!packageId || !(file instanceof Blob)) {
      this.unexpected.push(`POST ${request.url()} with a malformed form`);
      return empty(route, 400);
    }
    this.uploads.push({
      packageId,
      iv,
      body: Buffer.from(await file.arrayBuffer()),
    });
    return empty(route, 204);
  }

  private blob(route: Route) {
    if (this.downloadBlocked) return route.abort("connectionrefused");
    if (this.downloadStatus) return empty(route, this.downloadStatus);
    const id = new URL(route.request().url()).pathname.slice(1);
    const pkg = this.packages.find(({ dataset }) => dataset.packageId === id);
    if (!pkg) {
      this.unexpected.push(`GET ${route.request().url()}`);
      return empty(route, 403);
    }
    return route.fulfill({
      headers: CORS,
      contentType: "binary/octet-stream",
      body: pkg.blob,
    });
  }
}
