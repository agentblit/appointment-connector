"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { APPOINTMENT_TIMEZONES } from "@/lib/appointment/constants";
import { authClient } from "@/lib/auth-client";
import {
  browserTimezone,
  type ApiKeyMeta,
  type EntityRow,
  type WorkspaceRole,
} from "@/lib/dashboard/types";

type WorkspaceContextValue = {
  email: string;
  loading: boolean;
  ready: boolean;
  error: string;
  notice: string;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  entities: EntityRow[];
  setEntities: React.Dispatch<React.SetStateAction<EntityRow[]>>;
  entityLabel: string;
  setEntityLabel: React.Dispatch<React.SetStateAction<string>>;
  timezone: string;
  setTimezone: React.Dispatch<React.SetStateAction<string>>;
  slotDurationMinutes: number;
  setSlotDurationMinutes: React.Dispatch<React.SetStateAction<number>>;
  roles: WorkspaceRole[];
  setRoles: React.Dispatch<React.SetStateAction<WorkspaceRole[]>>;
  apiKeys: ApiKeyMeta[];
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeyMeta[]>>;
  googleOAuthConfigured: boolean;
  timezoneOptions: string[];
  setTimezoneOptions: React.Dispatch<React.SetStateAction<string[]>>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNoticeState] = useState("");
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNotice = useCallback((message: string) => {
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
    setNoticeState(message);
    if (!message.trim()) return;
    noticeTimeoutRef.current = setTimeout(() => {
      setNoticeState("");
      noticeTimeoutRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  const [ready, setReady] = useState(false);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entityLabel, setEntityLabel] = useState("Entity");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyMeta[]>([]);
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState(false);
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(() => {
    const tz = browserTimezone();
    return APPOINTMENT_TIMEZONES.includes(
      tz as (typeof APPOINTMENT_TIMEZONES)[number],
    )
      ? [...APPOINTMENT_TIMEZONES]
      : [tz, ...APPOINTMENT_TIMEZONES];
  });

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const preferredTimezone = browserTimezone();
      const url = new URL("/api/workspace", window.location.origin);
      if (preferredTimezone) {
        url.searchParams.set("timezone", preferredTimezone);
      }
      const res = await fetch(url.pathname + url.search, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        googleOAuthConfigured?: boolean;
        workspace?: {
          id: string;
          entityLabel: string;
          timezone: string;
          slotDurationMinutes: number;
          roles?: WorkspaceRole[];
          entities: EntityRow[];
          apiKeys?: ApiKeyMeta[];
        };
      };
      if (!res.ok || !data.ok || !data.workspace) {
        throw new Error(data.error ?? "Failed to load workspace");
      }
      const ws = data.workspace;
      setGoogleOAuthConfigured(Boolean(data.googleOAuthConfigured));
      setEntityLabel(ws.entityLabel);
      setTimezone(ws.timezone);
      setSlotDurationMinutes(ws.slotDurationMinutes);
      setRoles(ws.roles ?? []);
      setEntities(ws.entities);
      setApiKeys(ws.apiKeys ?? []);
      setReady(true);
      setTimezoneOptions((current) => {
        const next = new Set(current);
        next.add(preferredTimezone);
        next.add(ws.timezone);
        return [...next];
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load workspace",
      );
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    if (!isAuthenticated) {
      router.replace("/login?next=" + encodeURIComponent("/entities"));
      return;
    }
    queueMicrotask(() => {
      void loadWorkspace();
    });
  }, [sessionPending, isAuthenticated, loadWorkspace, router]);

  useEffect(() => {
    const googleStatus = searchParams.get("google");
    if (!googleStatus) return;

    const email = searchParams.get("email");
    const message = searchParams.get("message") ?? "Google connection failed";
    const params = new URLSearchParams(searchParams.toString());
    params.delete("google");
    params.delete("email");
    params.delete("message");
    const query = params.toString();

    queueMicrotask(() => {
      if (googleStatus === "connected") {
        setNotice(
          email
            ? `Google connected as ${email}. Online bookings can create Meet links.`
            : "Google connected. Online bookings can create Meet links.",
        );
        void loadWorkspace();
      } else if (googleStatus === "error") {
        setError(`Google connection failed: ${message}`);
      }
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }, [searchParams, pathname, router, loadWorkspace]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    router.replace("/login");
  }, [router]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      email: session?.user?.email ?? "",
      loading: loading || sessionPending,
      ready,
      error,
      notice,
      setError,
      setNotice,
      entities,
      setEntities,
      entityLabel,
      setEntityLabel,
      timezone,
      setTimezone,
      slotDurationMinutes,
      setSlotDurationMinutes,
      roles,
      setRoles,
      apiKeys,
      setApiKeys,
      googleOAuthConfigured,
      timezoneOptions,
      setTimezoneOptions,
      reload: loadWorkspace,
      signOut,
    }),
    [
      session?.user?.email,
      loading,
      sessionPending,
      ready,
      error,
      notice,
      setNotice,
      entities,
      entityLabel,
      timezone,
      slotDurationMinutes,
      roles,
      apiKeys,
      googleOAuthConfigured,
      timezoneOptions,
      loadWorkspace,
      signOut,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
