import type { ButtonHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md";
};

export function Btn({ variant = "default", size = "md", className = "", ...p }: BtnProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg font-sans text-[13px] transition-colors cursor-pointer border";
  const sizes = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5";
  const variants =
    variant === "primary"
      ? "border-sky-600 bg-sky-600 text-white hover:bg-sky-500 hover:border-sky-500"
      : variant === "ghost"
        ? "border-transparent bg-transparent text-zinc-300 hover:bg-zinc-800"
        : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800";
  return <button type="button" className={`${base} ${sizes} ${variants} ${className}`} {...p} />;
}

type BadgeProps = { children: ReactNode; tone?: "success" | "info" | "warn" | "gray" | "danger" };

export function Badge({ children, tone = "gray" }: BadgeProps) {
  const map = {
    success: "bg-emerald-500/15 text-emerald-400",
    info: "bg-sky-500/15 text-sky-400",
    warn: "bg-amber-500/15 text-amber-300",
    gray: "bg-zinc-800 text-zinc-400",
    danger: "bg-red-500/15 text-red-400",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-sm font-medium tracking-tight text-zinc-100">{title}</h3>
      {right}
    </div>
  );
}
