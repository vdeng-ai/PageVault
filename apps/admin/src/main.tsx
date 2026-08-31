import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { FeedbackProvider } from "./components/Feedback.js";
import { LiquidGlassDefs } from "./components/Glass.js";
import { SettingsProvider } from "./settings.js";
import "./styles.css";
import "./liquid-system.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <SettingsProvider>
      <FeedbackProvider>
        <LiquidGlassDefs>
          <App />
        </LiquidGlassDefs>
      </FeedbackProvider>
    </SettingsProvider>
  </StrictMode>,
);
