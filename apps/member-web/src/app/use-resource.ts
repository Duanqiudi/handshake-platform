import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "../components/feedback";

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload(): void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>): ResourceState<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const requestVersion = version;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loaderRef
      .current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && requestVersion === version) setData(value);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(friendlyError(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);

  return { data, loading, error, reload, setData };
}
