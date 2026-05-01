import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="centered-page">
      <p className="eyebrow">404</p>
      <h1>页面不存在</h1>
      <p>当前路由还没有对应页面。</p>
      <Link className="button-primary" to="/dashboard">
        返回首页
      </Link>
    </div>
  );
}
