"use client";

import i18next from "i18next";
import { CSSProperties } from "react";
import { useCapacitor } from "~/capacitor/hooks";
import { useScrollTop } from "~/hooks/use-layout";
import useStoreInit from "~/hooks/use-store-init";
import { useAppStore } from "~/stores";
import { monoFamily, sansFamily } from "../_fonts";
import SafeArea from "./SafeArea";
import Scripts from "./Scripts";
import Toaster from "./Toaster";

export default function PageStructure({
  children,
}: {
  children: React.ReactNode;
}) {
  const { language: locale = "en", dir = () => "ltr" } = i18next;

  useCapacitor();
  const init = useStoreInit();
  const theme = useAppStore(({ config }) => config.theme);
  useScrollTop();

  return (
    <html
      lang={locale}
      dir={dir(locale)}
      data-theme={theme}
      className="h-full bg-gray-950 text-gray-400"
      style={
        {
          fontFamily: sansFamily,
          "--font-mono": monoFamily,
        } as CSSProperties
      }
    >
      <body className="flex min-h-full flex-col">
        <SafeArea>{init ? children : null}</SafeArea>
        <Toaster />
      </body>
      <Scripts />
    </html>
  );
}
