import { ShieldCheck } from "lucide-react";

export function Brand() {
  return (
    <div className="app-brand">
      <span className="brand-mark">
        <ShieldCheck size={28} aria-hidden />
      </span>
      <span className="app-brand-name">PageVault</span>
    </div>
  );
}
