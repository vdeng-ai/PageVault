import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { copyText } from "../clipboard.js";
import { useSettings } from "../settings.js";
import { useFeedback } from "./Feedback.js";

export function CopyButton({
  value,
  label,
  className = "btn btn-secondary",
  iconOnly = false,
}: {
  value: string;
  label: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const { t } = useSettings();
  const { notify } = useFeedback();
  const [copiedValue, setCopiedValue] = useState<{ value: string } | null>(
    null,
  );
  const copied = copiedValue?.value === value;
  useEffect(() => {
    if (copiedValue === null) return;
    const timer = window.setTimeout(() => setCopiedValue(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedValue]);
  const text = copied ? t("common.copied") : label;
  return (
    <button
      className={className}
      type="button"
      aria-label={iconOnly ? text : undefined}
      title={text}
      data-copied={copied}
      onClick={() => {
        void copyText(value)
          .then(() => {
            setCopiedValue({ value });
            notify(t("common.copied"), "success");
          })
          .catch(() => {
            setCopiedValue(null);
            notify(t("common.copyFailed"), "error");
          });
      }}
    >
      {copied ? (
        <Check size={18} aria-hidden />
      ) : (
        <Copy size={18} aria-hidden />
      )}
      {!iconOnly && <span>{text}</span>}
    </button>
  );
}
