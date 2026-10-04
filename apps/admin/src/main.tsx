import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { FeedbackProvider } from "./components/Feedback.js";
import { SettingsProvider } from "./settings.js";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <SettingsProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </SettingsProvider>
  </StrictMode>,
);
