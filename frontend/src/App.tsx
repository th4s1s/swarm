import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/components/AppShell';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetail';
import { SessionView } from '@/features/sessions/SessionView';
import { McpPage } from '@/features/mcp/McpPage';
import { QuotaPage } from '@/features/quota/QuotaPage';
import { UsagePage } from '@/features/usage/UsagePage';
import { ResourcesPage } from '@/features/resources/ResourcesPage';
import { ConfigPage } from '@/features/config/ConfigPage';

export function App() {
  // Neutralize stray file drops anywhere outside a dropzone so the browser does not navigate
  // to / download the file (which would blow away the SPA). Dropzones keep their own onDrop.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/sessions/:id" element={<SessionView />} />
        <Route path="/mcp" element={<McpPage />} />
        <Route path="/quota" element={<QuotaPage />} />
        <Route path="/usage" element={<UsagePage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/config" element={<ConfigPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
