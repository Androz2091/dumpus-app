"use client";

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { useShallow } from "zustand/react/shallow";
import Deferred from "~/components/Deferred";
import { useTranslation } from "~/i18n/client";
import { useAppStore } from "~/stores";

// The cards, their data and the renderer run only while the sheet is open,
// never on a page load or a time range change.
const loadShareSheet = () => import("~/components/share/ShareSheet");
const ShareSheet = lazy(loadShareSheet);

// A lazy component suspends on its first render even when its code is
// there, and React then reveals what it waited for no sooner than 300 ms
// after showing the fallback.
let loadedShareSheet: ComponentType | null = null;
function preloadShareSheet() {
  loadShareSheet().then(
    (module) => {
      loadedShareSheet = module.default;
    },
    // Opening the sheet loads it again through `ShareSheet`.
    () => {},
  );
}

const skeleton = (
  <div className="h-[60vh] max-h-[540px] animate-pulse rounded-xl bg-gray-800 motion-reduce:animate-none" />
);

function SheetContent() {
  // Read once, when the sheet opens, so a load ending while it's open
  // doesn't remount it.
  const [Loaded] = useState(() => loadedShareSheet);
  if (Loaded) {
    return (
      <Deferred fallback={skeleton}>
        <Loaded />
      </Deferred>
    );
  }
  return (
    <Suspense fallback={skeleton}>
      <ShareSheet />
    </Suspense>
  );
}

export default function SharePopup() {
  const { t } = useTranslation();
  const [open, setOpen] = useAppStore(
    useShallow(({ ui }) => [ui.showSharePopup, ui.setShowSharePopup]),
  );

  useEffect(() => {
    // A timer where `requestIdleCallback` is missing, as in Safari.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preloadShareSheet, {
        timeout: 5_000,
      });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preloadShareSheet, 2_000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <Transition show={open}>
      <Dialog className="relative z-30" onClose={setOpen}>
        <TransitionChild
          enter="ease-out duration-300 motion-reduce:transition-none"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200 motion-reduce:transition-none"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-950/80 transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 bottom-safe-area-bottom-inset z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              enter="ease-out duration-300 motion-reduce:transition-none"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200 motion-reduce:transition-none"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative w-full transform rounded-2xl border border-gray-800 bg-gray-900 p-4 text-left shadow-xl transition-all sm:my-8 sm:max-w-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <DialogTitle
                      as="h3"
                      className="text-lg font-bold text-white sm:text-2xl"
                    >
                      {t("share.recap")}
                    </DialogTitle>
                    <p className="mt-1 text-sm text-gray-400">
                      {t("share.recapDescription")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t("share.close")}
                    className="-m-1 shrink-0 rounded-full p-1 text-gray-400 hover:text-white"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="mt-4">
                  <SheetContent />
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
