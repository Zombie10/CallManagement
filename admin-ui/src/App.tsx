import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { Agents } from "./pages/Agents";
import { Customers } from "./pages/Customers";
import { Calls } from "./pages/Calls";
import { Appointments } from "./pages/Appointments";
import { Playground } from "./pages/Playground";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="agents" element={<Agents />} />
        <Route path="customers" element={<Customers />} />
        <Route path="calls" element={<Calls />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="playground" element={<Playground />} />
      </Route>
    </Routes>
  );
}