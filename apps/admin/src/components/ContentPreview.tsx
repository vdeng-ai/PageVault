import { fileCapabilityForFilename } from "@pagevault/core";
import { renderMarkdown } from "@pagevault/core/markdown";
import { FileText, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings } from "../settings.js";

const previewPolicy =
  "default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline' https:; font-src https: data:; base-uri 'none'; form-action 'none';";

export function previewDocument(
  source: string,
  kind: "Markdown" | "HTML",
): string {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${previewPolicy}">`;
  if (kind === "HTML")
    return `<!doctype html><html><head>${head}</head><body>${source}</body></html>`;
  return `<!doctype html><html><head>${head}<style>
    :root{color-scheme:light;font-family:Inter,"Noto Sans SC","PingFang SC",system-ui,sans-serif;color:#102538;background:#fff;font-size:20px;line-height:1.5}body{margin:0;padding:40px 44px 24px}h1{font-size:36px;line-height:1.3;margin:4px 0 10px;font-weight:750;letter-spacing:-.02em}h2{font-size:26px;line-height:1.4;margin:20px 0 10px}h3{font-size:21px;margin:24px 0 10px}p{margin:0 0 12px}hr{border:0;border-top:1px solid #d8e2e7;margin:22px 0}a{color:#0f766e}ol,ul{padding-left:28px;margin:10px 0 14px}blockquote{border-left:3px solid #0f766e;margin:20px 0;padding:10px 18px;background:#f4f7f8}blockquote p{margin:0}img{max-width:100%;height:auto}pre{overflow-x:auto;background:#f1f5f9;padding:16px;border-radius:6px}code{font-family:ui-monospace,monospace;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}td,th{border:1px solid #d8e2e7;padding:8px 12px}@media(max-width:500px){body{padding:24px;font-size:16px}h1{font-size:27px}h2{font-size:23px}}
  </style></head><body>${renderMarkdown(source).html}</body></html>`;
}

export function ContentPreview({
  file,
  published = false,
}: {
  file: File | null;
  published?: boolean;
}) {
  const { t } = useSettings();
  const [preview, setPreview] = useState<{
    file: File;
    document?: string;
    image?: string;
    pdf?: string;
    error?: boolean;
  } | null>(null);
  const capability = file ? fileCapabilityForFilename(file.name) : null;
  const kind = capability?.label ?? null;

  useEffect(() => {
    if (!file) return;
    const nextCapability = fileCapabilityForFilename(file.name);
    if (!nextCapability) {
      setPreview({ file, error: true });
      return;
    }
    if (
      nextCapability.preview === "image" ||
      nextCapability.preview === "pdf-native"
    ) {
      const url = URL.createObjectURL(file);
      setPreview(
        nextCapability.preview === "image"
          ? { file, image: url }
          : { file, pdf: url },
      );
      return () => URL.revokeObjectURL(url);
    }

    const reader = new FileReader();
    let cancelled = false;
    reader.onload = () => {
      if (!cancelled) {
        setPreview({
          file,
          document: previewDocument(
            typeof reader.result === "string" ? reader.result : "",
            nextCapability.preview === "markdown" ? "Markdown" : "HTML",
          ),
        });
      }
    };
    reader.onerror = () => {
      if (!cancelled) setPreview({ file, error: true });
    };
    reader.readAsText(file);
    return () => {
      cancelled = true;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  const current = preview?.file === file ? preview : null;
  return (
    <section
      className="upload-preview-column"
      aria-labelledby="content-preview-heading"
    >
      <header className="section-heading">
        <FileText aria-hidden />
        <h2 id="content-preview-heading">{t("upload.preview")}</h2>
        {kind && <small>{kind === "Image" ? t("upload.image") : kind}</small>}
      </header>
      {!file ? (
        <div className="preview-empty">
          <FileText size={44} aria-hidden />
          <p>{t("upload.previewEmpty")}</p>
        </div>
      ) : !current || current.error ? (
        <div className="preview-empty" role="status">
          {current?.error ? t("upload.previewFailed") : t("app.loading")}
        </div>
      ) : (
        <div className="content-preview">
          {current.image ? (
            <img
              className="content-preview-image"
              src={current.image}
              alt={file.name}
            />
          ) : current.pdf ? (
            <iframe
              title={t("upload.preview")}
              referrerPolicy="no-referrer"
              src={current.pdf}
            />
          ) : (
            <iframe
              title={t("upload.preview")}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={current.document}
            />
          )}
        </div>
      )}
      {!published && (
        <p className="preview-caption">
          <Info size={17} aria-hidden />
          {kind === "HTML"
            ? t("upload.htmlPreviewHint")
            : t("upload.previewHint")}
        </p>
      )}
    </section>
  );
}
