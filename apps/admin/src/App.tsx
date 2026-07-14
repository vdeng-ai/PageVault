import {
  BarChart3,
  FileText,
  Languages,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logout, me, type CurrentUser } from "./api/client.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ItemDetailPage } from "./pages/ItemDetailPage.js";
import { ItemListPage } from "./pages/ItemListPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UploadPage } from "./pages/UploadPage.js";
import { useSettings, type ThemePreference } from "./settings.js";

export type Route =
  | { name: "upload" }
  | { name: "items" }
  | { name: "dashboard" }
  | { name: "detail"; id: string };

export function parseRouteHash(hash: string): Route {
  const route = hash.replace(/^#\/?/, "");
  if (route.length === 0 || route === "upload") {
    return { name: "upload" };
  }
  if (route === "items") {
    return { name: "items" };
  }
  if (route === "dashboard") {
    return { name: "dashboard" };
  }
  const detail = /^items\/(.+)$/.exec(route);
  if (detail?.[1]) {
    return { name: "detail", id: detail[1] };
  }
  return { name: "upload" };
}

function parseRoute(): Route {
  return parseRouteHash(window.location.hash);
}

function navigate(path: string): void {
  window.location.hash = path;
}

function SettingsControls({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, themePreference, setThemePreference, t } =
    useSettings();
  const themeOptions: Array<{
    value: ThemePreference;
    label: string;
    icon: typeof Monitor;
  }> = [
    { value: "system", label: t("settings.system"), icon: Monitor },
    { value: "light", label: t("settings.light"), icon: Sun },
    { value: "dark", label: t("settings.dark"), icon: Moon },
  ];

  return (
    <div
      className={`settings-controls ${compact ? "settings-controls-compact" : ""}`}
    >
      <div className="segmented-control" aria-label={t("settings.language")}>
        <button
          className={`segment-button ${language === "en" ? "segment-button-active" : ""}`}
          type="button"
          title={t("settings.english")}
          onClick={() => setLanguage("en")}
        >
          <Languages className="h-4 w-4" aria-hidden />
          <span className={compact ? "sr-only" : ""}>
            {t("settings.english")}
          </span>
        </button>
        <button
          className={`segment-button ${language === "zh-CN" ? "segment-button-active" : ""}`}
          type="button"
          title={t("settings.chinese")}
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
    void me()
      .then(setUser)
      .catch(() => setUser({ authenticated: false }));
    const listener = () => setRoute(parseRoute());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  const navItems = useMemo(
    () => [
      { route: "upload", label: t("nav.upload"), icon: UploadCloud, path: "/" },
      { route: "items", label: t("nav.files"), icon: FileText, path: "/items" },
      {
        route: "dashboard",
        label: t("nav.dashboard"),
        icon: BarChart3,
        path: "/dashboard",
      },
    ],
    [t],
  );

  if (!user) {
    return (
      <div className="loading-screen" role="status">
        <div className="brand-mark brand-mark-lg">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </div>
        <span>{t("app.loading")}</span>
      </div>
    );
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
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <div className="brand-mark app-brand-mark">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
            <div className="app-brand-copy">
              <div className="app-brand-name">PageVault</div>
              <div className="app-brand-subtitle">
                <span className="app-brand-tagline">
                  {t("app.controlCenter")}
                </span>
                <span className="app-brand-email">{user.email}</span>
              </div>
            </div>
          </div>

          <nav
            className="desktop-top-nav"
            aria-label={t("app.primaryNavigation")}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                route.name === item.route ||
                (item.route === "items" && route.name === "detail");
              return (
                <button
                  key={item.route}
                  className={`top-nav-button ${active ? "top-nav-button-active" : ""}`}
                  type="button"
                  data-route={item.route}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.path)}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="app-header-actions">
            <SettingsControls compact />
            <div className="header-account">
              <div className="header-account-avatar">
                {user.email?.slice(0, 1).toUpperCase()}
              </div>
              <div className="header-account-copy">
                <div>{t("login.admin")}</div>
                <strong>{user.email}</strong>
              </div>
            </div>
            <button
              className="icon-button header-sign-out"
              type="button"
              title={t("app.signOut")}
              aria-label={t("app.signOut")}
              onClick={() => {
                void logout().finally(() => setUser({ authenticated: false }));
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {route.name === "upload" && (
          <UploadPage onViewItem={(id) => navigate(`/items/${id}`)} />
        )}
        {route.name === "items" && (
          <ItemListPage
            onEdit={(id) => navigate(`/items/${id}`)}
            onUpload={() => navigate("/")}
          />
        )}
        {route.name === "dashboard" && (
          <DashboardPage onUpload={() => navigate("/")} />
        )}
        {route.name === "detail" && (
          <ItemDetailPage id={route.id} onBack={() => navigate("/items")} />
        )}
      </main>

      <nav
        className="mobile-bottom-nav"
        aria-label={t("app.primaryNavigation")}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            route.name === item.route ||
            (item.route === "items" && route.name === "detail");
          return (
            <button
              key={item.route}
              className={`mobile-bottom-button ${active ? "mobile-bottom-button-active" : ""}`}
              type="button"
              data-route={item.route}
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(item.path)}
            >
              <span className="mobile-bottom-icon">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
