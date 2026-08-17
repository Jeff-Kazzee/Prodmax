/**
 * Session store: bootstraps GET /api/auth/me, exposes login/signup/logout
 * and the active-workspace context (ux-spec §2 conventions — workspace
 * comes from the session bootstrap, `?wsId=` only for switch/pickers).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, apiGet, apiPost } from "./api";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarSeed: string;
}

export interface WorkspaceMembership {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: string;
  joinedAt: number;
}

type SessionStatus = "loading" | "authed" | "anon" | "error";

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  workspaces: WorkspaceMembership[];
  activeWorkspace: WorkspaceMembership | null;
  /** Increments whenever the active workspace changes → data hooks refetch. */
  wsEpoch: number;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (wsId: string) => void;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface MeResponse {
  user: SessionUser;
  workspaces: WorkspaceMembership[];
}

function initialWsId(list: WorkspaceMembership[]): string | null {
  if (list.length === 0) return null;
  const fromUrl = new URLSearchParams(window.location.search).get("wsId");
  if (fromUrl && list.some((ws) => ws.id === fromUrl)) return fromUrl;
  return list[0]?.id ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [wsEpoch, setWsEpoch] = useState(0);
  const bootstrapping = useRef(false);

  const bootstrap = useCallback(async () => {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    try {
      const me = await apiGet<MeResponse>("/api/auth/me");
      setUser(me.user);
      setWorkspaces(me.workspaces);
      setActiveWsId(initialWsId(me.workspaces));
      setStatus("authed");
    } catch (err) {
      setUser(null);
      setWorkspaces([]);
      setActiveWsId(null);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setStatus("anon");
      } else {
        // Network/server failure — distinguishable from "logged out" so the
        // guard does not bounce a signed-in user to /login (AT-006).
        setStatus("error");
      }
    } finally {
      bootstrapping.current = false;
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email: string, password: string) => {
      await apiPost("/api/auth/login", { email, password });
      await bootstrap();
    },
    [bootstrap],
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      await apiPost("/api/auth/signup", { name, email, password });
      await bootstrap();
    },
    [bootstrap],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      setUser(null);
      setWorkspaces([]);
      setActiveWsId(null);
      setStatus("anon");
    }
  }, []);

  const switchWorkspace = useCallback(
    (wsId: string) => {
      if (!workspaces.some((ws) => ws.id === wsId)) return;
      setActiveWsId(wsId);
      setWsEpoch((n) => n + 1);
      // Set ?wsId= silently (SB-01): replaceState avoids a router re-render;
      // the server resolves workspace context from this param.
      const url = new URL(window.location.href);
      url.searchParams.set("wsId", wsId);
      window.history.replaceState(window.history.state, "", url);
    },
    [workspaces],
  );

  const value = useMemo<SessionContextValue>(() => {
    const activeWorkspace = workspaces.find((ws) => ws.id === activeWsId) ?? null;
    return {
      status,
      user,
      workspaces,
      activeWorkspace,
      wsEpoch,
      login,
      signup,
      logout,
      switchWorkspace,
      refresh: bootstrap,
    };
  }, [status, user, workspaces, activeWsId, wsEpoch, login, signup, logout, switchWorkspace, bootstrap]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
