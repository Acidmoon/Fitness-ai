import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/layouts/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RecordDetailPage } from "@/pages/RecordDetailPage";
import { RecordsPage } from "@/pages/RecordsPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { StatsPage } from "@/pages/StatsPage";
import { VideoCenterPage } from "@/pages/VideoCenterPage";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/",
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: "dashboard",
            element: <DashboardPage />,
          },
          {
            path: "records",
            element: <RecordsPage />,
          },
          {
            path: "records/:recordId",
            element: <RecordDetailPage />,
          },
          {
            path: "stats",
            element: <StatsPage />,
          },
          {
            path: "videos",
            element: <VideoCenterPage />,
          },
          {
            path: "profile",
            element: <ProfilePage />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
