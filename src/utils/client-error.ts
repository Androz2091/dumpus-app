import { useEffect } from "react";
import { DEFAULT_PACKAGE_API_URL, OS, VERSION } from "~/constants";

export type FailureStep =
  | "process"
  | "status"
  | "blob"
  | "download"
  | "decrypt"
  | "import"
  | "open"
  | "switch"
  | "crash"
  | "uncaught";

/** The part of a package's download that failed, with its HTTP answer if any. */
export class StepError extends Error {
  readonly step: FailureStep;
  readonly status?: number;

  constructor(
    step: FailureStep,
    { status, cause }: { status?: number; cause?: unknown },
  ) {
    super(step, { cause });
    this.name = "StepError";
    this.step = step;
    this.status = status;
  }
}

export async function inStep<T>(step: FailureStep, run: () => Promise<T>) {
  try {
    return await run();
  } catch (cause) {
    throw new StepError(step, { cause });
  }
}

/**
 * Same as `scrub` in `api/src/app.py`: a message could quote a link, whose UPN
 * is the key of its blob, and that must not leave the device.
 */
function scrub(text: string) {
  return (
    text
      .split(/\s+/)
      .map((word) => (word.includes("://") ? "<url>" : word))
      .join(" ")
      .replace(/[\w+/=.%-]{24,}/g, "<token>")
      .slice(0, 200)
      // Half an emoji, which the API refuses.
      .replace(/[\ud800-\udbff]$/, "")
  );
}

function describe(error: unknown, step: FailureStep) {
  const stepError = error instanceof StepError ? error : null;
  const source = stepError ? stepError.cause : error;
  return {
    step: stepError?.step ?? step,
    status: stepError?.status,
    name: source instanceof Error ? scrub(source.name) : undefined,
    message:
      source instanceof Error
        ? scrub(source.message)
        : source
          ? scrub(String(source))
          : undefined,
  };
}

/** The error screens' small print, so that a screenshot says what failed. */
export function failureCode(error: unknown, step: FailureStep) {
  const { step: failed, status, name } = describe(error, step);
  return [failed, status ?? name].filter(Boolean).join("-");
}

// A screen can fail the same way on each poll or each try.
const reported = new Set<string>();

/** Tells the API what failed here, which it can't see for itself. */
export function reportClientError({
  error,
  step,
  packageID,
  baseURL = DEFAULT_PACKAGE_API_URL,
}: {
  error: unknown;
  step: FailureStep;
  packageID?: string;
  baseURL?: string;
}) {
  // A developer's errors aren't the service's.
  if (process.env.NODE_ENV !== "production") return;

  const failure = describe(error, step);
  const key = JSON.stringify(failure);
  if (reported.has(key)) return;
  reported.add(key);

  fetch(`${baseURL}/client-error`, {
    method: "POST",
    // Plain text runs no preflight, and `keepalive` outlives the page.
    headers: { "Content-Type": "text/plain" },
    keepalive: true,
    body: JSON.stringify({
      ...failure,
      package: packageID,
      version: VERSION,
      platform: OS,
      path: window.location.pathname,
    }),
  }).catch(() => {});
}

export function useFailureReport(
  step: FailureStep,
  error: unknown,
  packageID?: string,
  baseURL?: string,
) {
  useEffect(() => {
    if (error) reportClientError({ error, step, packageID, baseURL });
  }, [step, error, packageID, baseURL]);
}

/** For what no screen catches, which otherwise only shows as a spinner. */
export function useUncaughtErrorReports() {
  useEffect(() => {
    function onError({ error }: ErrorEvent) {
      // Null for a script from another origin, which has nothing to tell.
      if (error) reportClientError({ error, step: "uncaught" });
    }
    function onRejection({ reason }: PromiseRejectionEvent) {
      reportClientError({ error: reason, step: "uncaught" });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}
