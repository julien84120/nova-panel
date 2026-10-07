import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { DashboardProvider } from "./hooks/DashboardProvider"
import { I18nProvider } from "./i18n/I18nProvider"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </I18nProvider>
  </StrictMode>
)
