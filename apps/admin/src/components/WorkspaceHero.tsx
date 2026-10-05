import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface WorkspaceHeroProps {
  icon: LucideIcon;
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}

export function WorkspaceHero({
  title,
  subtitle,
  meta,
  actions,
  badge,
}: WorkspaceHeroProps) {
  return (
    <header className="page-header page-header-hero workspace-hero">
      <div className="workspace-hero-copy">
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle !== undefined && <p className="page-subtitle">{subtitle}</p>}
        {meta !== undefined && (
          <div className="workspace-hero-meta">{meta}</div>
        )}
      </div>
      {actions !== undefined && (
        <div className="workspace-hero-actions">{actions}</div>
      )}
    </header>
  );
}
