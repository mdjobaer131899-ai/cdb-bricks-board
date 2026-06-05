import { useEffect, useState } from "react";
import type { Role } from "./mock-data";

const KEY = "cdb-auth";

export interface AuthUser {
  name: string;
  role: Role;
}

const DEFAULT: AuthUser = { name: "মোহাম্মদ আলী", role: "admin" };

function read(): AuthUser {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser>(DEFAULT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setUser(read());
    setReady(true);
  }, []);
  const update = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem(KEY, JSON.stringify(u));
  };
  const logout = () => {
    localStorage.removeItem(KEY);
    setUser(DEFAULT);
  };
  const switchRole = (role: Role) => update({ ...user, role });
  return { user, ready, update, logout, switchRole };
}
