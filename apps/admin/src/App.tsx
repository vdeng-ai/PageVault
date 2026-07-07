import { BarChart3, FileText, LogOut, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logout, me, type CurrentUser } from "./api/client.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ItemDetailPage } from "./pages/ItemDetailPage.js";
import { ItemListPage } from "./pages/ItemListPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UploadPage } from "./pages/UploadPage.js";

type Route =
  | { name: "dashboard" }
  | { name: "upload" }
  | { name: "items" }
  | { name: "detail"; id: string };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "upload") {
    return { name: "upload" };
  }
  if (hash === "items" || hash.length === 0) {
    return hash.length === 0 ? { name: "dashboard" } : { name: "items" };
  }
  const detail = /^items\/(.+)$/.exec(hash);
  if (detail?.[1]) {
    return { name: "detail", id: detail[1] };
  }
  return { name: "dashboard" };
}

function navigate(path: string): void {
  window.location.hash = path;
}

export function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    void me().then(setUser).catch(() => setUser({ authenticated: false }));
    const listener = () => setRoute(parseRoute());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  const navItems = useMemo(
    () => [
      { route: "dashboard", label: "Dashboard", icon: BarChart3, path: "/" },
      { route: "upload", label: "Upload", icon: Upload, path: "/upload" },
      { route: "items", label: "Files", icon: FileText, path: "/items" }
    ],
    []
  );

  if (!user) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading</div>;
  }

  if (!user.authenticated) {
    return (
      <LoginPage
        onLogin={() => {
          void me()
            .then(setUser)
            .then(() => navigate("/"));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white/95 lg:block">
        <div className="flex h-16 items-center border-b border-slate-200 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-700 text-white shadow-sm">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-950">HTMLBed</div>
              <div className="truncate text-xs text-slate-500">{user.email}</div>
            </div>
          </div>
        </div>
        <nav className="grid gap-1 p-3" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.route;
            return (
              <button
                key={item.route}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-teal-50 text-teal-800 shadow-[inset_3px_0_0_#0f766e]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(item.path)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>
        <button
          className="absolute bottom-4 left-3 right-3 flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          type="button"
          onClick={() => {
            void logout().finally(() => setUser({ authenticated: false }));
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </aside>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 lg:hidden">
        <div className="flex min-h-16 flex-wrap items-center gap-2 px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.route;
            return (
              <button
                key={item.route}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                  active
                    ? "border-teal-200 bg-teal-50 text-teal-800"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(item.path)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] p-4 lg:ml-64 lg:w-auto lg:p-8">
        {route.name === "dashboard" && <DashboardPage />}
        {route.name === "upload" && <UploadPage />}
        {route.name === "items" && <ItemListPage onEdit={(id) => navigate(`/items/${id}`)} />}
        {route.name === "detail" && <ItemDetailPage id={route.id} onBack={() => navigate("/items")} />}
      </main>
    </div>
  );
}
