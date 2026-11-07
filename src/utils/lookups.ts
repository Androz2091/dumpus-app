/**
 * How many profile and server lookups run at once. Opening a package asks for
 * about 40, and each runs an API Lambda: all at once, one person takes a large
 * part of the API's cap.
 */
const MAX_AT_ONCE = 6;

let running = 0;
const waiting: (() => void)[] = [];

export async function lookup<T>(run: () => Promise<T>) {
  if (running < MAX_AT_ONCE) {
    running++;
  } else {
    // The one that finishes hands over its place.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}
