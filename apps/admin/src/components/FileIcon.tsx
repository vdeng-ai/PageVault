import { FileCode2, FileDown, FileImage, FileText } from "lucide-react";

export function fileKind(
  filename: string,
): "Markdown" | "HTML" | "PDF" | "Image" {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "md" || extension === "markdown") return "Markdown";
  if (extension === "html" || extension === "htm") return "HTML";
  if (extension === "pdf") return "PDF";
  return "Image";
}

export function FileIcon({ filename }: { filename: string }) {
  const kind = fileKind(filename);
  const Icon =
    kind === "Markdown"
      ? FileDown
      : kind === "HTML"
        ? FileCode2
        : kind === "PDF"
          ? FileText
          : FileImage;
  return <Icon className={`file-kind-${kind.toLowerCase()}`} aria-hidden />;
}
