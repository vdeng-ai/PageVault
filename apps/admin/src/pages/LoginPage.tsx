import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { login } from "../api/client.js";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void login(email, password)
            .then(onLogin)
            .catch((nextError: unknown) => {
              setError(nextError instanceof Error ? nextError.message : "Login failed");
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-600 text-white">
            <LockKeyhole className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-950">HTMLBed</h1>
            <p className="text-sm text-zinc-500">Admin</p>
          </div>
        </div>
        <label className="mb-3 grid gap-1 text-sm font-medium text-zinc-700">
          Email
          <input
            className="h-10 rounded-md border border-zinc-300 px-3"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="mb-4 grid gap-1 text-sm font-medium text-zinc-700">
          Password
          <input
            className="h-10 rounded-md border border-zinc-300 px-3"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <button
          className="h-10 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          type="submit"
          disabled={busy}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
