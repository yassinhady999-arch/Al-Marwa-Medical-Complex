import { initials } from "@/lib/clinic";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-primary/15 text-primary-emphasis",
  "bg-info-soft text-info",
  "bg-success-soft text-success-emphasis",
  "bg-warning-soft text-warning-foreground",
  "bg-highlight-soft text-highlight-emphasis",
  "bg-chat-soft text-chat-emphasis",
];

function hashIndex(seed: string, mod: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function InitialsAvatar({
  name,
  size = "md",
  className,
}: {
  name?: string | null | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
}) {
  const label = name ?? "؟";
  const tone = PALETTE[hashIndex(label, PALETTE.length)];
  const sizeCls =
    size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-12 text-base" : "size-10 text-sm";

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold",
        sizeCls,
        tone,
        className,
      )}
      aria-hidden="true"
    >
      {initials(label)}
    </span>
  );
}
