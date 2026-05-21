import { useAuth } from "@clerk/clerk-expo";
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
import { ApiError, apiFetch } from "./api";

export type OnboardingState = {
  connectStripe: boolean;
  recordVoice: boolean;
  knowledge: boolean;
};

type Ctx = {
  state: OnboardingState | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const OnboardingStateContext = createContext<Ctx | null>(null);

export function OnboardingStateProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) {
          setState(null);
          return;
        }
        const data = await apiFetch<OnboardingState>("/onboarding/state", {
          token,
        });
        setState(data);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Failed to load onboarding state",
        );
      } finally {
        setIsLoading(false);
      }
    };
    const p = run().finally(() => {
      inflight.current = null;
    });
    inflight.current = p;
    return p;
    // getToken intentionally omitted — Clerk does not memoize it across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      void refetch();
    } else {
      setState(null);
      setIsLoading(false);
      setError(null);
    }
  }, [isSignedIn, refetch]);

  const value = useMemo<Ctx>(
    () => ({ state, isLoading, error, refetch }),
    [state, isLoading, error, refetch],
  );

  return (
    <OnboardingStateContext.Provider value={value}>
      {children}
    </OnboardingStateContext.Provider>
  );
}

export function useOnboardingState(): Ctx {
  const ctx = useContext(OnboardingStateContext);
  if (!ctx) {
    throw new Error(
      "useOnboardingState must be used inside <OnboardingStateProvider>",
    );
  }
  return ctx;
}

export function isOnboardingComplete(
  state: OnboardingState | null,
): boolean {
  return (
    !!state &&
    state.connectStripe === true &&
    state.recordVoice === true &&
    state.knowledge === true
  );
}
