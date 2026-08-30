import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { FeedbackProvider } from "./components/Feedback.js";
import { LiquidMotionLayer } from "./components/LiquidMotionLayer.js";
import { SettingsProvider } from "./settings.js";
import "./styles.css";
import "./precision.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <SettingsProvider>
      <FeedbackProvider>
        <LiquidMotionLayer />
        <App />
      </FeedbackProvider>
    </SettingsProvider>
  </StrictMode>,
);
