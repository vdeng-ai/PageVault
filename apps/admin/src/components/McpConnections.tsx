import { ChevronDown, Plug } from "lucide-react";
import { useState } from "react";
import {
  getMcpSettings,
  revokeMcpConnection,
  type McpConnection,
  type McpSettings,
} from "../api/client.js";
import { useSettings } from "../settings.js";
import { CopyButton } from "./CopyButton.js";
import { ConfirmDialog, useFeedback } from "./Feedback.js";

export function McpConnections() {
  const { language, locale, t } = useSettings();
  const { notify } = useFeedback();
  const zh = language === "zh-CN";
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<McpConnection | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setSettings(await getMcpSettings());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load MCP settings",
      );
    } finally {
      setLoading(false);
    }
  }
  async function revoke() {
    if (!target) return;
    setBusy(true);
    try {
      await revokeMcpConnection(target.id);
      setTarget(null);
      await load();
      notify(zh ? "连接已撤销" : "Connection revoked", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Revoke failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <>
      <details
        className="surface api-usage-guide"
        onToggle={(event) => {
          if (event.currentTarget.open && !settings && !loading) void load();
        }}
      >
        <summary>
          <Plug size={20} aria-hidden />
          <span>
            <strong>ChatGPT / MCP</strong>
            <span className="api-usage-summary">
              {zh
                ? "通过聊天上传 · 管理授权连接"
                : "Upload from chat · Manage connections"}
            </span>
          </span>
          <ChevronDown className="api-usage-chevron" size={18} aria-hidden />
        </summary>
        <div className="api-usage-body">
          {loading ? <p role="status">{t("app.loading")}</p> : null}
          {error ? (
            <p className="alert-error" role="alert">
              {error}
            </p>
          ) : null}
          {settings ? (
            <>
              <div className="api-usage-section">
                <h2>{zh ? "连接入口" : "Connection endpoint"}</h2>
                <p>
                  {settings.enabled
                    ? settings.oauthConfigured
                      ? zh
                        ? "已启用 OAuth。连接后登录 PageVault 并同意上传权限。"
                        : "OAuth enabled. Sign in to PageVault and approve upload access when connecting."
                      : zh
                        ? "MCP 已启用，仅可使用上传 API Key；ChatGPT OAuth 尚未配置。"
                        : "MCP enabled for upload API keys. ChatGPT OAuth is not configured yet."
                    : zh
                      ? "MCP 尚未启用。请按部署文档配置 MCP_ENABLED 与 OAuth 参数。"
                      : "MCP is disabled. Configure MCP_ENABLED and OAuth according to the deployment guide."}
                </p>
                <code className="api-usage-endpoint">{settings.endpoint}</code>
                <CopyButton
                  value={settings.endpoint}
                  label={zh ? "复制 MCP 地址" : "Copy MCP URL"}
                />
                {settings.clientId ? (
                  <p>
                    Client ID: <code>{settings.clientId}</code>
                  </p>
                ) : null}
                {settings.oauthConfigured ? (
                  <p>
                    {zh
                      ? `新连接授权有效 ${settings.grantDays} 天，访问令牌最长 ${settings.accessTokenSeconds / 3600} 小时，可在授权期内自动刷新。已有连接保留原到期时间；重新授权后使用新期限。`
                      : `New connections are authorized for ${settings.grantDays} days. Access tokens last up to ${settings.accessTokenSeconds / 3600} hour and can refresh automatically within that period. Existing connections keep their expiry; authorize again to use the new period.`}
                  </p>
                ) : null}
                <p>
                  {zh
                    ? "上传默认公开，持有链接的人可访问；标准设置为链接有效 15 天、文件保留 30 天。如需私有，请在上传时明确说明。支持现有七类文件；不能读取私有文件、列出资产或删除文件。"
                    : "Public by default: anyone with the link can view the file. Standard settings are a 15-day link and 30-day file retention. Ask for private storage when needed. Supports the existing seven formats, without private reads, asset listing or deletion."}
                </p>
                <a
                  className="api-usage-doc-link"
                  href="/mcp-guide.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  {zh ? "查看连接与上传说明" : "Connection and upload guide"}
                </a>
              </div>
              <div className="api-usage-section">
                <h2>
                  {zh ? "最近的授权连接" : "Recent authorized connections"}
                </h2>
                {settings.connections.length === 0 ? (
                  <p>{zh ? "暂无 OAuth 授权。" : "No OAuth grants yet."}</p>
                ) : (
                  <div
                    className="api-key-mobile-list"
                    style={{ display: "grid" }}
                  >
                    {settings.connections.map((connection) => {
                      const inactive =
                        connection.revokedAt !== null ||
                        Date.parse(connection.expiresAt) <= Date.now();
                      return (
                        <article
                          className="api-key-mobile-card"
                          key={connection.id}
                          data-connection-id={connection.id}
                        >
                          <strong>{connection.clientId}</strong>
                          <p>
                            {date(connection.createdAt)} —{" "}
                            {date(connection.expiresAt)}
                          </p>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={inactive}
                            onClick={() => setTarget(connection)}
                          >
                            {inactive
                              ? zh
                                ? "已失效"
                                : "Inactive"
                              : zh
                                ? "撤销此连接"
                                : "Revoke connection"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            {t("common.refresh")}
          </button>
        </div>
      </details>
      <ConfirmDialog
        open={target !== null}
        title={zh ? "撤销 ChatGPT 连接？" : "Revoke ChatGPT connection?"}
        description={
          zh
            ? "该连接的访问和刷新令牌将立即失效，已上传的文件不受影响。"
            : "Access and refresh tokens for this connection stop working immediately. Uploaded files are unaffected."
        }
        confirmLabel={zh ? "撤销连接" : "Revoke connection"}
        cancelLabel={t("common.cancel")}
        danger
        busy={busy}
        onClose={() => setTarget(null)}
        onConfirm={() => void revoke()}
      />
    </>
  );
}
