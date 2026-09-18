import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { memberApi } from "../api";

interface AuthValue {
  token: string | null;
  signIn(token: string): void;
  signOut(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    window.localStorage.getItem("handshake.ownerToken"),
  );
  const value = useMemo<AuthValue>(
    () => ({
      token,
      signIn(nextToken) {
        window.localStorage.setItem("handshake.ownerToken", nextToken);
        memberApi.setToken(nextToken);
        setToken(nextToken);
      },
      signOut() {
        window.localStorage.removeItem("handshake.ownerToken");
        memberApi.setToken(null);
        setToken(null);
      },
    }),
    [token],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
