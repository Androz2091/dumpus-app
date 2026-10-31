import Link from "next/link";
import { useTranslation } from "~/i18n/client";

export type Props = {
  progress: 0 | 0.33 | 0.66 | 1 | 2 | 2.5 | 3 | null;
  href: null | string;
};

export default function Header({ progress, href }: Props) {
  const { t } = useTranslation();

  if (progress === null)
    return (
      <div className="flex h-12 w-full items-center justify-between px-2 sm:mx-auto sm:max-w-sm" />
    );

  return (
    <div className="flex h-12 w-full items-center justify-between px-2 sm:mx-auto sm:max-w-sm">
      {href ? (
        <Link
          href={href}
          className="inline-flex h-full pressable items-center text-brand-300 [--press-scale:0.94] hover:underline active:text-brand-400"
        >
          {t("onboarding.shared.previous")}
        </Link>
      ) : (
        <div />
      )}
      <div />
    </div>
  );
}
