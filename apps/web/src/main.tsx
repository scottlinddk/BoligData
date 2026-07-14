import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n/i18n";
import { ThemeProvider } from "@/theme/theme";
import { Header } from "@/components/header";
import { ToastProvider } from "@/components/toast";
import { RecommendationAlerts } from "@/components/recommendation-alerts";
import { AuthProvider } from "@/hooks/use-auth";
import { AuthGuard } from "@/components/auth-guard";
import { RoleGuard } from "@/components/role-guard";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { SearchPage } from "@/routes/search";
import { PropertyDetailPage } from "@/routes/property/[id]";
import { DashboardPage } from "@/routes/dashboard";
import { RecommendationsPage } from "@/routes/recommendations";
import { AdminDashboardPage } from "@/routes/admin/dashboard";
import { AdminInvitationsPage } from "@/routes/admin/invitations";
import { AdminUsersPage } from "@/routes/admin/users";
import { AdminAdvisorConnectionsPage } from "@/routes/admin/advisor-connections";
import { AdvisorPage } from "@/routes/advisor/index";
import { AgentPage } from "@/routes/agent/index";
import { SignInPage } from "@/routes/auth/signin";
import { SignUpPage } from "@/routes/auth/signup";
import { ResetPasswordPage } from "@/routes/auth/reset-password";
import { UpdatePasswordPage } from "@/routes/auth/update-password";
import "./index.css";

function RootLayout() {
  return (
    <div className="min-h-full overflow-x-hidden font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-6xl">
        <Outlet />
      </main>
      <RecommendationAlerts />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/", element: <SearchPage /> },
      {
        path: "/property/:id",
        element: (
          <AuthGuard>
            <PropertyDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: "/dashboard",
        element: (
          <AuthGuard>
            <DashboardPage />
          </AuthGuard>
        ),
      },
      {
        path: "/recommendations",
        element: (
          <AuthGuard>
            <RecommendationsPage />
          </AuthGuard>
        ),
      },
      {
        path: "/admin",
        element: (
          <RoleGuard allowed={["admin"]}>
            <AdminDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: "/admin/invitations",
        element: (
          <RoleGuard allowed={["admin"]}>
            <AdminInvitationsPage />
          </RoleGuard>
        ),
      },
      {
        path: "/admin/users",
        element: (
          <RoleGuard allowed={["admin"]}>
            <AdminUsersPage />
          </RoleGuard>
        ),
      },
      {
        path: "/admin/advisor-connections",
        element: (
          <RoleGuard allowed={["admin"]}>
            <AdminAdvisorConnectionsPage />
          </RoleGuard>
        ),
      },
      {
        path: "/advisor",
        element: (
          <RoleGuard allowed={["advisor"]}>
            <AdvisorPage />
          </RoleGuard>
        ),
      },
      {
        path: "/agent",
        element: (
          <RoleGuard allowed={["agent"]}>
            <AgentPage />
          </RoleGuard>
        ),
      },
      { path: "/auth/signin", element: <SignInPage /> },
      { path: "/auth/signup", element: <SignUpPage /> },
      { path: "/auth/reset-password", element: <ResetPasswordPage /> },
      { path: "/auth/update-password", element: <UpdatePasswordPage /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Listing data only changes on the daily crawl — no need to refetch
      // aggressively or on every window focus.
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
