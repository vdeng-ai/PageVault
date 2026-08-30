import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { login } from "../api/client.js";
import { useSettings } from "../settings.js";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <div className="brand-mark brand-mark-xl">
          <ShieldCheck className="h-8 w-8" aria-hidden />
        </div>
        <div className="login-brand-copy">
          <div className="page-eyebrow page-eyebrow-on-dark">
            <LockKeyhole className="h-4 w-4" aria-hidden />
            {t("login.eyebrow")}
          </div>
          <h1>PageVault</h1>
          <p>{t("login.subtitle")}</p>
        </div>
        <div className="login-liquid-visual" aria-hidden>
          <img
            src="/assets/pagevault-login-liquid.png"
            alt=""
            width="1024"
            height="1024"
          />
        </div>
      </section>

      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void login(email, password)
            .then(onLogin)
            .catch((nextError: unknown) => {
              setError(
                nextError instanceof Error
                  ? nextError.message
                  : t("common.loginFailed"),
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="mb-7">
          <div className="text-xs font-bold uppercase text-accent">
            {t("login.admin")}
          </div>
          <h2 className="mt-2 text-2xl font-bold text-primary">
            {t("login.signIn")}
          </h2>
        </div>
        <label className="field-label mb-4">
          {t("login.email")}
          <input
            className="control px-3"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field-label mb-5">
          {t("login.password")}
          <input
            className="control px-3"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <div className="alert-error mb-5" role="alert">
            {error}
          </div>
        )}
        <button
          className="btn btn-primary btn-lg w-full"
          type="submit"
          disabled={busy}
        >
          {busy && <span className="spinner" aria-hidden />}
          {busy ? t("login.signingIn") : t("login.signIn")}
          {!busy && <ArrowRight className="ml-auto h-5 w-5" aria-hidden />}
        </button>
      </form>
    </main>
  );
}
