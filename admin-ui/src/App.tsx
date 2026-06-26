import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { Agents } from "./pages/Agents";
import { TenantAgents } from "./pages/TenantAgents";
import { Tenants } from "./pages/Tenants";
import { Customers } from "./pages/Customers";
import { Calls } from "./pages/Calls";
import { Appointments } from "./pages/Appointments";
import { Playground } from "./pages/Playground";
import { Profile } from "./pages/Profile";
import { Users } from "./pages/Users";
import { Login } from "./pages/Login";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="my-agents" element={<TenantAgents />} />
          <Route path="agents" element={<Agents />} />
          <Route path="customers" element={<Customers />} />
          <Route path="calls" element={<Calls />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="playground" element={<Playground />} />
          <Route path="profile" element={<Profile />} />
          <Route path="users" element={<Users />} />
        </Route>
      </Route>
    </Routes>
  );
}