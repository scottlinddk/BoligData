import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { AuthGuard } from "@/components/auth-guard";
import { SearchPage } from "@/routes/search";
import { PropertyDetailPage } from "@/routes/property/[id]";
import { DashboardPage } from "@/routes/dashboard";
import { SignInPage } from "@/routes/auth/signin";
import { SignUpPage } from "@/routes/auth/signup";
import { ResetPasswordPage } from "@/routes/auth/reset-password";
import "./index.css";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50">
      <Header />
      <main>{children}</main>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <Layout><SearchPage /></Layout> },
  { path: "/property/:id", element: <Layout><PropertyDetailPage /></Layout> },
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
  { path: "/auth/signin", element: <Layout><SignInPage /></Layout> },
  { path: "/auth/signup", element: <Layout><SignUpPage /></Layout> },
  { path: "/auth/reset-password", element: <Layout><ResetPasswordPage /></Layout> },
]);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
