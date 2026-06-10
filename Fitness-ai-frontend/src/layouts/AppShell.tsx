import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { clearAuth } from "@/services/auth-storage";

const navItems = [
  {
    to: "/dashboard",
    label: "仪表盘",
    description: "查看训练总览、近期趋势和分类表现。",
  },
  {
    to: "/records",
    label: "训练记录",
    description: "维护日常训练记录、筛选条件和历史表现。",
  },
  {
    to: "/stats",
    label: "统计分析",
    description: "聚焦趋势、结构和个人最佳表现。",
  },
  {
    to: "/videos",
    label: "视频中心",
    description: "统一管理训练视频与 AI 分析入口。",
  },
  {
    to: "/profile",
    label: "个人中心",
    description: "维护资料、安全设置和账户操作。",
  },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentNavItem =
    navItems.find((item) => location.pathname === item.to) ??
    (location.pathname.startsWith("/records/")
      ? {
          to: location.pathname,
          label: "记录详情",
          description: "查看单条训练记录、视频状态和 AI 预留区。",
        }
      : {
          to: location.pathname,
          label: "训练驾驶舱",
          description: "围绕记录、趋势与视频构建前端基础版。",
        });

  function handleLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-mark">Fitness AI</p>
          <h1>训练驾驶舱</h1>
          <p className="brand-copy">围绕记录、趋势与视频构建前端基础版。</p>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <div className="content-inner">
          <div className="topbar">
            <div className="topbar-copy">
              <p className="eyebrow">Current View</p>
              <h2>{currentNavItem.label}</h2>
              <p>{currentNavItem.description}</p>
            </div>
            <div className="topbar-actions">
              <span className="topbar-chip">Campus Fitness System</span>
              <button
                className="button-secondary"
                type="button"
                onClick={handleLogout}
              >
                退出登录
              </button>
            </div>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
