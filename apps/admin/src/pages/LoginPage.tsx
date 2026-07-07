import { LockKeyhole } from "lucide-react";
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
    <main className="grid min-h-screen place-items-center px-4">
      <form
        className="surface w-full max-w-sm p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void login(email, password)
            .then(onLogin)
            .catch((nextError: unknown) => {
              setError(nextError instanceof Error ? nextError.message : t("common.loginFailed"));
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="brand-mark grid h-10 w-10 place-items-center rounded-md shadow-sm">
            <LockKeyhole className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-primary">PageVault</h1>
            <p className="text-sm font-medium text-muted">{t("login.admin")}</p>
          </div>
        </div>
        <label className="field-label mb-3">
          {t("login.email")}
          <input
            className="control px-3"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field-label mb-4">
          {t("login.password")}
          <input
            className="control px-3"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <div className="alert-error mb-4">{error}</div>}
        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={busy}
        >
          {t("login.signIn")}
        </button>
      </form>
    </main>
  );
}
