import { BarChart3, FileText, Languages, LogOut, Monitor, Moon, Sun, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logout, me, type CurrentUser } from "./api/client.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ItemDetailPage } from "./pages/ItemDetailPage.js";
import { ItemListPage } from "./pages/ItemListPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UploadPage } from "./pages/UploadPage.js";
import { useSettings, type ThemePreference } from "./settings.js";

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

function SettingsControls({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, themePreference, setThemePreference, t } = useSettings();
  const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
    { value: "system", label: t("settings.system"), icon: Monitor },
    { value: "light", label: t("settings.light"), icon: Sun },
    { value: "dark", label: t("settings.dark"), icon: Moon }
  ];

  return (
    <div className={`settings-controls ${compact ? "settings-controls-compact" : ""}`}>
      <div className="segmented-control" aria-label={t("settings.language")}>
        <button
          className={`segment-button ${language === "en" ? "segment-button-active" : ""}`}
          type="button"
          onClick={() => setLanguage("en")}
        >
          <Languages className="h-4 w-4" aria-hidden />
          {t("settings.english")}
        </button>
        <button
          className={`segment-button ${language === "zh-CN" ? "segment-button-active" : ""}`}
          type="button"
          onClick={() => setLanguage("zh-CN")}
        >
          {t("settings.chinese")}
        </button>
      </div>
      <div className="segmented-control" aria-label={t("settings.theme")}>
        {themeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              className={`segment-button ${themePreference === option.value ? "segment-button-active" : ""}`}
              title={option.label}
              type="button"
              onClick={() => setThemePreference(option.value)}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className={compact ? "sr-only" : ""}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function App() {
  const { t } = useSettings();
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
      { route: "dashboard", label: t("nav.dashboard"), icon: BarChart3, path: "/" },
      { route: "upload", label: t("nav.upload"), icon: Upload, path: "/upload" },
      { route: "items", label: t("nav.files"), icon: FileText, path: "/items" }
    ],
    [t]
  );

  if (!user) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">{t("app.loading")}</div>;
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
    <div className="app-shell min-h-screen">
      <aside className="app-sidebar fixed inset-y-0 left-0 hidden w-64 border-r lg:block">
        <div className="app-sidebar-header flex h-16 items-center border-b px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark grid h-9 w-9 shrink-0 place-items-center rounded-md shadow-sm">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-primary">PageVault</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>
        </div>
        <nav className="grid gap-1 p-3" aria-label={t("app.primaryNavigation")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.route;
            return (
              <button
                key={item.route}
                className={`nav-button ${active ? "nav-button-active" : ""}`}
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
        <div className="absolute bottom-4 left-3 right-3 grid gap-3">
          <SettingsControls />
          <button
            className="nav-button"
            type="button"
            onClick={() => {
              void logout().finally(() => setUser({ authenticated: false }));
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {t("app.signOut")}
          </button>
        </div>
      </aside>
      <header className="app-mobile-header sticky top-0 z-10 border-b lg:hidden">
        <div className="flex min-h-16 flex-wrap items-center gap-2 px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.route;
            return (
              <button
                key={item.route}
                className={`mobile-nav-button ${active ? "mobile-nav-button-active" : ""}`}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(item.path)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            );
          })}
          <SettingsControls compact />
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
