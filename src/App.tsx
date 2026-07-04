import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/common";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { CreateCase } from "./pages/CreateCase";
import { CaseDetail } from "./pages/CaseDetail";
import { SubmitVersion } from "./pages/SubmitVersion";
import { PublicArchive } from "./pages/PublicArchive";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/cases" element={<Dashboard />} />
        <Route path="/create" element={<CreateCase />} />
        <Route path="/cases/:caseId" element={<CaseDetail />} />
        <Route path="/cases/:caseId/submit" element={<SubmitVersion />} />
        <Route path="/archive/:caseId" element={<PublicArchive />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
