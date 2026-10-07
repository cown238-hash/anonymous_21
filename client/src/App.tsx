import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useAuth } from './lib/auth';
import { toReducedMotion, useMotionPref } from './lib/motion-pref';
import { Layout } from './components/Layout';
import { SpinnerPage } from './components/ui';
import { analytics } from './lib/telemetry';
import { useSeo } from './lib/seo';

import { LoginPage, RegisterPage } from './pages/AuthPages';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AccountPages';
import { HomePage } from './pages/HomePage';
import { ExplorePage } from './pages/ExplorePage';
import { MembersPage } from './pages/MembersPage';
import { ProfilePage } from './pages/ProfilePage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditorPage } from './pages/PostEditorPage';
import { ChatPage } from './pages/ChatPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { AdminPage } from './pages/AdminPage';
import { NotFoundPage } from './pages/NotFoundPage';

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <SpinnerPage label="กำลังตรวจสอบสถานะการเข้าสู่ระบบ" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Reports a page view on every route change. */
function RouteAnalytics() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    analytics.pageView(`${pathname}${search}`);
  }, [pathname, search]);
  return null;
}

export default function App() {
  const motionPref = useMotionPref();

  useSeo({
    title: 'WKSL',
    description: 'แพลตฟอร์มชุมชนสำหรับแชร์ความรู้ พูดคุยแบบเรียลไทม์ และสร้างสิ่งที่ดีไปด้วยกัน',
    path: '/',
  });

  return (
    <MotionConfig reducedMotion={toReducedMotion(motionPref)}>
      <RouteAnalytics />
      <Routes>
        <Route
          element={
            <RedirectIfAuthed>
              <Outlet />
            </RedirectIfAuthed>
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Reachable while signed out. */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route
          element={
            <RequireAuth>
              <Layout>
                <Outlet />
              </Layout>
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/posts/:slug" element={<PostDetailPage />} />
          <Route path="/posts/new" element={<PostEditorPage />} />
          <Route path="/posts/:slug/edit" element={<PostEditorPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </MotionConfig>
  );
}