import { lazy, Suspense, useCallback, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SessionProvider, useOptionalSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "@/pages/auth";

const DashboardPage = lazy(() => import("@/pages/Dashboard"));
const ProjectsPage = lazy(() => import("@/pages/Projects"));
const ProjectDetailPage = lazy(() => import("@/pages/ProjectDetail"));
const TodoPage = lazy(() => import("@/pages/Todo"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const PeoplePage = lazy(() => import("@/pages/People"));
const InboxPage = lazy(() => import("@/pages/Inbox"));
const DocumentsPage = lazy(() => import("@/pages/Documents"));
const HelpPage = lazy(() => import("@/pages/Help"));
const ProfilePage = lazy(() => import("@/pages/Profile"));

function RequireAuth({ children }: { children: ReactNode }) {
  const session = useOptionalSession();
  const location = useLocation();
  if (!session) {
    const next = location.pathname + location.search;
    return <Navigate to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const session = useOptionalSession();
  const [params] = useSearchParams();
  if (session) {
    const next = params.get("next");
    // Only follow same-site relative targets.
    return <Navigate to={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} replace />;
  }
  return <>{children}</>;
}

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();
  const onSignedOut = useCallback(() => navigate("/login", { replace: true }), [navigate]);

  return (
    <SessionProvider onSignedOut={onSignedOut}>
      <Suspense fallback={<div className="p-6"><PageFallback /></div>}>
        <Routes>
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="todo" element={<TodoPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </SessionProvider>
  );
}
