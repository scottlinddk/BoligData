import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n/i18n";
import { ThemeProvider } from "@/theme/theme";
import { Header } from "@/components/header";
import { ToastProvider } from "@/components/toast";
import { AuthGuard } from "@/components/auth-guard";
import { RoleGuard } from "@/components/role-guard";
import { SearchPage } from "@/routes/search";
import { PropertyDetailPage } from "@/routes/property/[id]";
import { DashboardPage } from "@/routes/dashboard";
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

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-paper font-sans text-ink">
      <Header />
      <main>{children}</main>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <Layout><SearchPage /></Layout> },
  {
    path: "/property/:id",
    element: (
      <Layout>
        <AuthGuard>
          <PropertyDetailPage />
        </AuthGuard>
      </Layout>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <Layout>
        <AuthGuard>
          <DashboardPage />
        </AuthGuard>
      </Layout>
    ),
  },
  {
    path: "/admin",
    element: (
      <Layout>
        <RoleGuard allowed={["admin"]}>
          <AdminDashboardPage />
        </RoleGuard>
      </Layout>
    ),
  },
  {
    path: "/admin/invitations",
    element: (
      <Layout>
        <RoleGuard allowed={["admin"]}>
          <AdminInvitationsPage />
        </RoleGuard>
      </Layout>
    ),
  },
  {
    path: "/admin/users",
    element: (
      <Layout>
        <RoleGuard allowed={["admin"]}>
          <AdminUsersPage />
        </RoleGuard>
      </Layout>
    ),
  },
  {
    path: "/admin/advisor-connections",
    element: (
      <Layout>
        <RoleGuard allowed={["admin"]}>
          <AdminAdvisorConnectionsPage />
        </RoleGuard>
      </Layout>
    ),
  },
  {
    path: "/advisor",
    element: (
      <Layout>
        <RoleGuard allowed={["advisor"]}>
          <AdvisorPage />
        </RoleGuard>
      </Layout>
    ),
  },
  {
    path: "/agent",
    element: (
      <Layout>
        <RoleGuard allowed={["agent"]}>
          <AgentPage />
        </RoleGuard>
      </Layout>
    ),
  },
  { path: "/auth/signin", element: <Layout><SignInPage /></Layout> },
  { path: "/auth/signup", element: <Layout><SignUpPage /></Layout> },
  { path: "/auth/reset-password", element: <Layout><ResetPasswordPage /></Layout> },
  { path: "/auth/update-password", element: <Layout><UpdatePasswordPage /></Layout> },
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
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
