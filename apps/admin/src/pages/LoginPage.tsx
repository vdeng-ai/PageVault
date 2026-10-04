import {
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  Link2,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useState } from "react";
import { login } from "../api/client.js";
import { Brand } from "../components/Brand.js";
import { SettingsControls } from "../components/SettingsControls.js";
import { useSettings } from "../settings.js";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-shell">
      <header className="login-header">
        <Brand />
        <SettingsControls />
      </header>
      <div className="login-layout">
        <section className="login-brand-panel">
          <div className="login-eyebrow">{t("login.eyebrow")}</div>
          <h1>PageVault</h1>
          <p>{t("login.subtitle")}</p>
          <div className="login-document-icon" aria-hidden>
            <FileText />
            <Link2 />
          </div>
        </section>
        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError(null);
            void login(email, password)
              .then(onLogin)
              .catch((nextError: unknown) =>
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : t("common.loginFailed"),
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <div className="login-form-header">
            <p>{t("login.admin")}</p>
            <h2>{t("login.workspaceTitle")}</h2>
          </div>
          <label className="field-label">
            {t("login.email")}
            <span className="input-icon-wrap">
              <Mail size={22} aria-hidden />
              <input
                className="control"
                type="email"
                placeholder="name@example.com"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
          <label className="field-label">
            {t("login.password")}
            <span className="input-icon-wrap password-wrap">
              <LockKeyhole size={22} aria-hidden />
              <input
                className="control"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="icon-button"
                type="button"
                aria-label={t(
                  showPassword ? "login.hidePassword" : "login.showPassword",
                )}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? (
                  <EyeOff size={21} aria-hidden />
                ) : (
                  <Eye size={21} aria-hidden />
                )}
              </button>
            </span>
          </label>
          {error && (
            <div className="alert-error mb-5" role="alert">
              {error}
            </div>
          )}
          <button
            className="btn btn-primary btn-lg login-submit"
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? <span className="spinner" aria-hidden /> : null}
            {busy ? t("login.signingIn") : t("login.signIn")}
            {!busy && <ArrowRight aria-hidden />}
          </button>
          <p className="login-restricted">{t("login.restricted")}</p>
        </form>
      </div>
      <footer className="login-footer">
        PageVault · {t("app.publishing")}
      </footer>
    </main>
  );
}
