import { FileCode2, FileDown, FileImage } from "lucide-react";

export function fileKind(filename: string): "Markdown" | "HTML" | "Image" {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "md" || extension === "markdown") return "Markdown";
  if (extension === "html" || extension === "htm") return "HTML";
  return "Image";
}

export function FileIcon({ filename }: { filename: string }) {
  const kind = fileKind(filename);
  const Icon =
    kind === "Markdown" ? FileDown : kind === "HTML" ? FileCode2 : FileImage;
  return <Icon className={`file-kind-${kind.toLowerCase()}`} aria-hidden />;
}
