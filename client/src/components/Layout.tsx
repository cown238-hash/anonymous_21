import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PenSquare,
  Search,
  Settings,
  Shield,
  Sun,
  TrendingUp,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useSocketEvents } from '../lib/realtime';
import { Avatar } from './ui';
import { LogoMark } from './Logo';
import { motion, pageFade } from './anim';

type IconComponent = React.ComponentType<{ size?: number | string; className?: string }>;

interface NavItem {
  to: string;
  label: string;
  icon: IconComponent;
  auth?: boolean;
  admin?: boolean;
  badge?: 'notifications' | 'messages';
}

/** Inline bookmark glyph so the nav list does not need another import. */
function BookmarksIcon({ size = 17, className }: { size?: number | string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { to: '/', label: 'หน้าแรก', icon: LayoutDashboard },
  { to: '/explore', label: 'สำรวจ', icon: TrendingUp },
  { to: '/members', label: 'สมาชิก', icon: Users },
  { to: '/chat', label: 'แชท', icon: MessageSquare, auth: true, badge: 'messages' },
  { to: '/bookmarks', label: 'บันทึกไว้', icon: BookmarksIcon, auth: true },
  { to: '/notifications', label: 'การแจ้งเตือน', icon: Bell, auth: true, badge: 'notifications' },
  { to: '/admin', label: 'ผู้ดูแล', icon: Shield, admin: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [queryOpen, setQueryOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { data: myStats } = useQuery({
    queryKey: ['stats', 'me'],
    queryFn: () => api.get<{ unreadNotifications: number; unreadMessages: number }>('/stats/me'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const { notifications } = useSocketEvents();

  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
    setQueryOpen(false);
    // A new route starts at the top — the fade below would otherwise land
    // mid-page when arriving from a long scroll.
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('nimbus.theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setQueryOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setQueryOpen(false);
        setProfileOpen(false);
        setMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  useEffect(() => {
    if (queryOpen) searchRef.current?.focus();
  }, [queryOpen]);

  const unreadNotifications = (myStats?.unreadNotifications ?? 0) + notifications;
  const unreadMessages = myStats?.unreadMessages ?? 0;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const value = search.trim();
    if (!value) return;
    navigate(`/?q=${encodeURIComponent(value)}`);
    setQueryOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login');
  };

  const visibleNav = NAV.filter((item) => {
    if (item.auth && !user) return false;
    if (item.admin && !isAdmin) return false;
    return true;
  });

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
      isActive ? 'bg-brand-500/10 text-brand-400' : 'text-ink-500 hover:bg-surface-2 hover:text-ink-900',
    );

  return (
    <div className="min-h-screen">
      {/* ------------- Header ------------- */}
      <header className="glass sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="btn-ghost -ml-2 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="เมนู"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link to="/" className="group flex items-center gap-2.5">
            <span className="animate-float-y animate-halo relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-[#101820] ring-1 ring-white/10">
              <LogoMark size={17} />
              <span
                aria-hidden
                className="animate-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/30 blur-md"
              />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink-900">WKSL</span>
          </Link>

          <form onSubmit={submitSearch} className="relative ml-auto hidden max-w-md flex-1 md:block">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาบทความ แท็ก หรือสมาชิก…"
              className="input py-2 pl-10"
              aria-label="ค้นหา"
            />
          </form>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDark((v) => !v)}
              aria-label="สลับธีม"
              title={dark ? 'โหมดสว่าง' : 'โหมดมืด'}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              type="button"
              className="btn-ghost md:hidden"
              onClick={() => setQueryOpen((v) => !v)}
              aria-label="ค้นหา"
            >
              <Search size={18} />
            </button>

            {user ? (
              <>
                <Link to="/posts/new" className="btn-primary btn-sm hidden sm:inline-flex">
                  <PenSquare size={14} />
                  เขียน
                </Link>

                <Link
                  to="/notifications"
                  className="btn-ghost relative"
                  aria-label={`การแจ้งเตือน${unreadNotifications ? ` (${unreadNotifications} ไม่อ่าน)` : ''}`}
                >
                  <Bell size={18} />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-black">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </Link>

                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-surface-2"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                  >
                    <Avatar name={user.displayName} src={user.avatarUrl} size="sm" online />
                  </button>

                  {profileOpen && (
                    <div
                      role="menu"
                      className="card animate-pop absolute right-0 mt-2 w-60 overflow-hidden border-ink-500/15 p-1.5"
                    >
                      <Link
                        to={`/u/${user.username}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-surface-2"
                        role="menuitem"
                      >
                        <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-900">
                            {user.displayName}
                          </span>
                          <span className="block truncate text-xs text-ink-400">@{user.username}</span>
                        </span>
                      </Link>
                      <div className="rule my-1" />
                      <Link to={`/u/${user.username}`} className="menu-item" role="menuitem">
                        <UserIcon size={16} /> โปรไฟล์ของฉัน
                      </Link>
                      <Link to="/dashboard" className="menu-item" role="menuitem">
                        <LayoutDashboard size={16} /> แดชบอร์ด
                      </Link>
                      <Link to="/settings" className="menu-item" role="menuitem">
                        <Settings size={16} /> ตั้งค่าบัญชี
                      </Link>
                      <Link to="/bookmarks" className="menu-item" role="menuitem">
                        <BookmarksIcon size={16} /> บันทึกไว้
                      </Link>
                      <div className="rule my-1" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="menu-item w-full text-danger hover:bg-danger/10"
                        role="menuitem"
                      >
                        <LogOut size={16} /> ออกจากระบบ
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-ghost btn-sm">
                  เข้าสู่ระบบ
                </Link>
                <Link to="/register" className="btn-primary btn-sm">
                  สมัครสมาชิก
                </Link>
              </div>
            )}
          </div>
        </div>

        {queryOpen && (
          <div className="border-t border-ink-500/10 px-4 py-3 md:hidden">
            <form onSubmit={submitSearch} className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาบทความ แท็ก หรือสมาชิก…"
                className="input py-2 pl-10"
              />
            </form>
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        {/* ------------- Sidebar ------------- */}
        <aside
          className={clsx(
            'fixed inset-x-0 top-16 z-30 border-b border-ink-500/10 bg-surface-1 p-4 lg:static lg:z-auto lg:w-56 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0',
            menuOpen ? 'block' : 'hidden lg:block',
          )}
        >
          <nav className="space-y-1 lg:sticky lg:top-24">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const badge =
                item.badge === 'notifications'
                  ? unreadNotifications
                  : item.badge === 'messages'
                    ? unreadMessages
                    : 0;
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
                  {({ isActive }) => (
                    <>
                      <span
                        className={clsx(
                          'absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500 transition-all',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <Icon size={17} className="shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-black">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}

            <div className="!mt-6 hidden lg:block">
              <p className="eyebrow mb-2 px-3.5">สร้าง</p>
              <Link
                to="/posts/new"
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink-500 transition hover:bg-surface-2 hover:text-ink-900"
              >
                <PenSquare size={17} />
                เขียนบทความ
              </Link>
            </div>

            <div className="!mt-8 hidden lg:block">
              <div className="rounded-2xl border border-ink-500/10 bg-surface-1 p-4">
                <p className="eyebrow">สถานะระบบ</p>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-500">ธีม</dt>
                    <dd className="text-ink-900">{dark ? 'มืด' : 'สว่าง'}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-500">แจ้งเตือน</dt>
                    <dd className="flex items-center gap-1.5 text-ink-900">
                      <span className="pulse-dot" />
                      {unreadNotifications} ใหม่
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </nav>
        </aside>

        {/* ------------- Content ------------- */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            variants={pageFade}
            initial="hidden"
            animate="show"
            exit="exit"
            className="min-w-0 flex-1 pb-20"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      {/* ------------- Mobile bottom bar ------------- */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex items-center justify-around pt-1.5 pb-2 lg:hidden">
        {visibleNav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const badge =
            item.badge === 'notifications'
              ? unreadNotifications
              : item.badge === 'messages'
                ? unreadMessages
                : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition',
                  isActive ? 'text-brand-400' : 'text-ink-400',
                )
              }
            >
              <Icon size={18} />
              {item.label}
              {badge > 0 && (
                <span className="absolute top-0 right-1/2 mr-3 grid h-4 min-w-4 translate-x-1/2 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-black">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
