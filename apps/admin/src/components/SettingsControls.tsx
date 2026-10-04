import { Globe, Monitor, Moon, Sun } from "lucide-react";
import {
  useSettings,
  type Language,
  type ThemePreference,
} from "../settings.js";

export function SettingsControls() {
  const { language, setLanguage, themePreference, setThemePreference, t } =
    useSettings();
  const ThemeIcon =
    themePreference === "light"
      ? Sun
      : themePreference === "dark"
        ? Moon
        : Monitor;
  return (
    <div className="settings-controls">
      <label className="language-control">
        <Globe size={20} aria-hidden />
        <select
          aria-label={t("settings.language")}
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
        >
          <option value="zh-CN">中文</option>
          <option value="en">EN</option>
        </select>
      </label>
      <label className="theme-control icon-button" title={t("settings.theme")}>
        <ThemeIcon size={24} aria-hidden />
        <select
          aria-label={t("settings.theme")}
          value={themePreference}
          onChange={(event) =>
            setThemePreference(event.target.value as ThemePreference)
          }
        >
          <option value="system">{t("settings.system")}</option>
          <option value="light">{t("settings.light")}</option>
          <option value="dark">{t("settings.dark")}</option>
        </select>
      </label>
    </div>
  );
}
