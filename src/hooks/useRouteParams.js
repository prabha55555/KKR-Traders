import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

/**
 * Path params + query string merged into one object, plus `setParams` to change the query string in place
 * (pass `undefined` to remove a key). Replaces the mobile router's useLocalSearchParams / navigation.setParams.
 */
export function useRouteParams() {
  const pathParams = useParams();
  const [search, setSearch] = useSearchParams();
  const params = useMemo(
    () => ({ ...Object.fromEntries(search.entries()), ...pathParams }),
    [search, pathParams],
  );
  const setParams = useCallback(
    (patch) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) =>
            v === undefined || v === null ? next.delete(k) : next.set(k, String(v)),
          );
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );
  return { params, setParams };
}

/** Imperative navigation: nav.push(path) · nav.replace(path) · nav.back(). */
export function useAppNavigate() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (to) => navigate(to),
      replace: (to) => navigate(to, { replace: true }),
      back: () => (window.history.length > 1 ? navigate(-1) : navigate('/')),
      canGoBack: () => window.history.length > 1,
    }),
    [navigate],
  );
}
