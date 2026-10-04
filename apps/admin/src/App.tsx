import {
  BarChart3,
  FolderOpen,
  KeyRound,
  LogOut,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logout, me, type CurrentUser } from "./api/client.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ApiKeysPage } from "./pages/ApiKeysPage.js";
import { ItemDetailPage } from "./pages/ItemDetailPage.js";
import { ItemListPage } from "./pages/ItemListPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UploadPage } from "./pages/UploadPage.js";
import { useSettings } from "./settings.js";
import { SettingsControls } from "./components/SettingsControls.js";
import { Brand } from "./components/Brand.js";
import { GlassNav } from "./components/Glass.js";

export type Route =
  | { name: "upload" }
  | { name: "items" }
  | { name: "dashboard" }
  | { name: "apiKeys" }
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
  if (route === "api-keys") {
    return { name: "apiKeys" };
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
      {
        route: "items",
        label: t("nav.files"),
        icon: FolderOpen,
        path: "/items",
      },
      {
        route: "dashboard",
        label: t("nav.dashboard"),
        icon: BarChart3,
        path: "/dashboard",
      },
      {
        route: "apiKeys",
        label: t("nav.apiKeys"),
        icon: KeyRound,
        path: "/api-keys",
      },
    ],
    [t],
  );
  const activeNavRoute = route.name === "detail" ? "items" : route.name;
  const activeNavIndex = navItems.findIndex(
    (item) => item.route === activeNavRoute,
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
      <header
        className="app-header glass-surface glass-standard"
        data-glass="standard"
      >
        <div className="app-header-inner">
          <Brand />

          <GlassNav
            material="standard"
            className="desktop-top-nav"
            aria-label={t("app.primaryNavigation")}
            data-active-index={activeNavIndex}
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
                  data-glass={active ? "optical" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.path)}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </GlassNav>

          <div className="app-header-actions">
            <SettingsControls />
            <details className="account-menu">
              <summary
                className="header-account-avatar"
                aria-label={t("app.workspace")}
                title={user.email}
              >
                {user.email?.slice(0, 1).toUpperCase() || "A"}
              </summary>
              <div className="account-popover">
                <span>{t("login.admin")}</span>
                <strong>{user.email}</strong>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    void logout().finally(() =>
                      setUser({ authenticated: false }),
                    );
                  }}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  {t("app.signOut")}
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="app-main">
        {route.name === "upload" && (
          <UploadPage
            onViewItem={(id) => navigate(`/items/${id}`)}
            onBack={() => navigate("/items")}
          />
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
        {route.name === "apiKeys" && <ApiKeysPage />}
        {route.name === "detail" && (
          <ItemDetailPage id={route.id} onBack={() => navigate("/items")} />
        )}
      </main>

      <GlassNav
        material="standard"
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
      </GlassNav>
    </div>
  );
}
