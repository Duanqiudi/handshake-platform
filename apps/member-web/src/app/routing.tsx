import { type MouseEvent, type ReactNode, useEffect, useState } from "react";

export function currentPath(): string {
  const value = window.location.hash.replace(/^#/, "");
  return value === "" ? "/" : (value.split("?")[0] ?? "/");
}

export function navigate(path: string): void {
  if (currentPath() === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = path;
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const update = () => setPath(currentPath());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return path;
}

export function Link({
  to,
  children,
  className,
  ariaCurrent,
  onNavigate,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  ariaCurrent?: "page" | undefined;
  onNavigate?: () => void;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    navigate(to);
    onNavigate?.();
  };
  return (
    <a href={`#${to}`} className={className} aria-current={ariaCurrent} onClick={onClick}>
      {children}
    </a>
  );
}
