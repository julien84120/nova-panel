import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { navigation, settingsItem } from "@/layout/navigation"
import { Layout } from "@/layout/Layout"
import { ComingSoon } from "@/pages/ComingSoon"
import { Dashboard } from "@/pages/Dashboard"

const placeholderRoutes = [...navigation.flatMap((s) => s.items), settingsItem].filter((i) => i.to !== "/")

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {placeholderRoutes.map((item) => (
            <Route key={item.to} path={item.to} element={<ComingSoon title={item.label} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
