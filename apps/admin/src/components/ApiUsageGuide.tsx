import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";
import uploadGuide from "../../public/upload-api.md?raw";
import { useSettings } from "../settings.js";
import { CopyButton } from "./CopyButton.js";

export function ApiUsageGuide() {
  const { t } = useSettings();
  const guide = uploadGuide.replaceAll(
    "https://YOUR_ADMIN_HOST",
    window.location.origin,
  );
  const example = /```bash\n([\s\S]*?)\n```/.exec(guide)?.[1] ?? "";

  return (
    <details className="surface api-usage-guide">
      <summary>
        <BookOpen size={20} aria-hidden />
        <span>
          <strong>{t("apiKeys.usageTitle")}</strong>
          <span className="api-usage-summary">
            {t("apiKeys.usageSubtitle")}
          </span>
        </span>
        <ChevronDown className="api-usage-chevron" size={18} aria-hidden />
      </summary>
      <div className="api-usage-body">
        <div className="api-usage-section">
          <h2>{t("apiKeys.quickStart")}</h2>
          <p>{t("apiKeys.quickStartHint")}</p>
          <code className="api-usage-endpoint">
            POST {window.location.origin}/api/admin/items
          </code>
          <pre tabIndex={0} aria-label={t("apiKeys.curlExample")}>
            <code>{example}</code>
          </pre>
          <CopyButton
            value={example}
            label={t("apiKeys.copyExample")}
            errorLabel={t("apiKeys.guideCopyFailed")}
            copiedLabel={t("apiKeys.exampleCopied")}
          />
        </div>
        <div className="api-usage-section">
          <h2>{t("apiKeys.uploadParameters")}</h2>
          <dl className="api-usage-parameters">
            <div>
              <dt>file</dt>
              <dd>{t("apiKeys.fileParameter")}</dd>
            </div>
            <div>
              <dt>visibility</dt>
              <dd>{t("apiKeys.visibilityParameter")}</dd>
            </div>
            <div>
              <dt>urlExpireDays</dt>
              <dd>{t("apiKeys.urlExpiryParameter")}</dd>
            </div>
            <div>
              <dt>fileExpireDays</dt>
              <dd>{t("apiKeys.fileExpiryParameter")}</dd>
            </div>
          </dl>
          <p>{t("apiKeys.uploadLimitHint")}</p>
          <p>{t("apiKeys.resultHint")}</p>
        </div>
        <div className="api-usage-section">
          <h2>{t("apiKeys.forAi")}</h2>
          <p>{t("apiKeys.forAiHint")}</p>
          <div className="api-usage-actions">
            <CopyButton
              value={guide}
              label={t("apiKeys.copyAiGuide")}
              errorLabel={t("apiKeys.guideCopyFailed")}
              copiedLabel={t("apiKeys.aiGuideCopied")}
            />
            <a
              className="btn btn-secondary"
              href="/llms.txt"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={18} aria-hidden />
              {t("apiKeys.openLlms")}
            </a>
            <a
              className="api-usage-doc-link"
              href="/upload-api.md"
              target="_blank"
              rel="noreferrer"
            >
              {t("apiKeys.fullGuide")}
              <ExternalLink size={15} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </details>
  );
}
