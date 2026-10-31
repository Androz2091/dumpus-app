"use client";

import clsx from "clsx";

export type Props<T extends string> = {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  pending?: T | null;
  className?: string;
  itemClassName?: string;
};

export default function Tabs<T extends string>({
  items,
  value,
  onChange,
  pending,
  className,
  itemClassName,
}: Props<T>) {
  return (
    <div className={clsx("flex items-center", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={item.value === value}
          data-pending={item.value === pending ? "" : undefined}
          onClick={() => {
            if (item.value !== value) onChange(item.value);
          }}
          className={clsx(
            "pressable rounded-lg py-1 [--press-scale:0.94]",
            itemClassName,
            item.value === value
              ? "bg-gray-800 text-brand-300"
              : "text-gray-400 hover:bg-gray-800 active:bg-gray-800",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
