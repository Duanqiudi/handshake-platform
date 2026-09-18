export type IconName =
  | "home"
  | "spark"
  | "capsule"
  | "intent"
  | "discover"
  | "handshake"
  | "project"
  | "shield"
  | "arrow"
  | "check"
  | "clock"
  | "lock"
  | "plus"
  | "menu"
  | "close";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v10h13V10M9 20v-6h6v6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.4 4.2a5 5 0 0 0 3.2 3.2L21 12l-4.4 1.6a5 5 0 0 0-3.2 3.2L12 21l-1.4-4.2a5 5 0 0 0-3.2-3.2L3 12l4.4-1.6a5 5 0 0 0 3.2-3.2L12 3Z" />
      </>
    ),
    capsule: (
      <>
        <path d="M8.4 18.6 18.6 8.4a4.2 4.2 0 0 0-6-6L2.4 12.6a4.2 4.2 0 0 0 6 6Z" />
        <path d="m8.5 6.5 9 9" />
      </>
    ),
    intent: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M22 12h-2M12 22v-2M2 12h2" />
      </>
    ),
    discover: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4M11 7v8M7 11h8" />
      </>
    ),
    handshake: (
      <>
        <path d="m8 11 2 2a2 2 0 0 0 3 0l2-2" />
        <path d="m3 10 4-4 4 1 2-1 4 4M5 12l5 5a3 3 0 0 0 4 0l5-5" />
        <path d="m3 8-2 3 4 4M21 8l2 3-4 4" />
      </>
    ),
    project: (
      <>
        <path d="M4 5h6l2 2h8v12H4z" />
        <path d="M8 12h8M8 15h5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.5 3 7.5 7.5 9.5 4.5-2 7.5-5 7.5-9.5V6L12 3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
