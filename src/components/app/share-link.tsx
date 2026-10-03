import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, copyText } from "@/lib/utils";

/** A public link with copy and open buttons. */
export function ShareLink({
  url,
  muted = false,
  className,
}: {
  url: string;
  /** Visually dims the link (e.g. while the form or bot is paused). */
  muted?: boolean | undefined;
  className?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 p-1.5 ps-3",
        muted && "opacity-60",
        className,
      )}
    >
      <Link2 className="size-4 shrink-0 text-muted-foreground" />
      <span
        dir="ltr"
        className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
        title={url}
      >
        {url}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          if (await copyText(url)) {
            setCopied(true);
            toast.success("تم نسخ الرابط");
            setTimeout(() => setCopied(false), 1500);
          } else {
            toast.error("تعذّر النسخ تلقائيًا — انسخ الرابط يدويًا");
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
        نسخ
      </Button>
      <Button asChild size="icon-sm" variant="ghost">
        <a href={url} target="_blank" rel="noreferrer" aria-label="فتح الرابط" title="فتح الرابط">
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}
