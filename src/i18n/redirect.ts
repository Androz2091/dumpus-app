"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

function useRedirect(to: string) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);
}

export function Redirect({ to }: { to: string }) {
  useRedirect(to);
  return null;
}
