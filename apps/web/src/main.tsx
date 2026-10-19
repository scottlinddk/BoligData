import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n/i18n";
import { ThemeProvider } from "@/theme/theme";
import { Header } from "@/components/header";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { ToastProvider } from "@/components/toast";
import { RecommendationAlerts } from "@/components/recommendation-alerts";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AuthGuard } from "@/components/auth-guard";
import { RoleGuard } from "@/components/role-guard";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { SearchPage } from "@/routes/search";
import { PropertyDetailPage } from "@/routes/property/[id]";
import { ResearchPage } from "@/routes/research";
import { DashboardPage } from "@/routes/dashboard";
import { ComparePage } from "@/routes/compare";
import { PropertyEstimatePage } from "@/routes/property/estimate";
import { AddressLookupPage } from "@/routes/address/index";
import { AddressReportPage } from "@/routes/address/[husnummerId]";
import { RecommendationsPage } from "@/routes/recommendations";
import { AdminDashboardPage } from "@/routes/admin/dashboard";
import { AdminInvitationsPage } from "@/routes/admin/invitations";
import { AdminUsersPage } from "@/routes/admin/users";
import { AdminAdvisorConnectionsPage } from "@/routes/admin/advisor-connections";
import { AdvisorPage } from "@/routes/advisor/index";
import { AgentPage } from "@/routes/agent/index";
import { AccountNotificationsPage } from "@/routes/account/notifications";
import { AccountMessagesPage } from "@/routes/account/messages";
import { AccountProfilePage } from "@/routes/account/profile";
import { AccountSettingsPage } from "@/routes/account/settings";
import { SignInPage } from "@/routes/auth/signin";
import { SignUpPage } from "@/routes/auth/signup";
import { ResetPasswordPage } from "@/routes/auth/reset-password";
import { UpdatePasswordPage } from "@/routes/auth/update-password";
import "./index.css";

function RootLayout() {
  const { pathname } = useLocation();
  const isWorkspace = ["/research", "/dashboard", "/recommendations"].includes(pathname.replace(/\/$/, ""));
  const { user } = useAuth();
  const hasTabBar = Boolean(user) && !pathname.startsWith("/property/") && !pathname.startsWith("/auth/");
  return (
    <div className="min-h-full overflow-x-clip font-sans text-ink">
      <Header />
      <main className={`${pathname === "/" || pathname.startsWith("/property/") || isWorkspace ? "w-full" : "mx-auto max-w-6xl"} ${hasTabBar ? "pb-[4.5rem] xl:pb-0" : ""}`}>
        <Outlet />
      </main>
      <MobileTabBar />
      {pathname.replace(/\/$/, "") !== "/recommendations" && <RecommendationAlerts />}
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/", element: <SearchPage /> },
      { path: "/research", element: <AuthGuard><ResearchPage /></AuthGuard> },
      {
        path: "/property/:id",
        element: (
          <AuthGuard>
            <PropertyDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: "/property/:id/value",
        element: (
          <AuthGuard>
            <PropertyEstimatePage />
          </AuthGuard>
        ),
      },
      {
        path: "/address",
        element: (
          <AuthGuard>
            <AddressLookupPage />
          </AuthGuard>
        ),
      },
      {
        path: "/address/:husnummerId",
        element: (
          <AuthGuard>
            <AddressReportPage />
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
        path: "/compare",
        element: (
          <AuthGuard>
            <ComparePage />
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
      {
        path: "/account/notifications",
        element: (
          <AuthGuard>
            <AccountNotificationsPage />
          </AuthGuard>
        ),
      },
      {
        path: "/account/messages",
        element: (
          <AuthGuard>
            <AccountMessagesPage />
          </AuthGuard>
        ),
      },
      {
        path: "/account/profile",
        element: (
          <AuthGuard>
            <AccountProfilePage />
          </AuthGuard>
        ),
      },
      {
        path: "/account/settings",
        element: (
          <AuthGuard>
            <AccountSettingsPage />
          </AuthGuard>
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

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Installability is a progressive enhancement; the app works without it. */
    });
  });
}
