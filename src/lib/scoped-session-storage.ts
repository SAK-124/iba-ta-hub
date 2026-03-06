import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const STORAGE_PREFIX = 'aamd-workspace';

const isBrowser = () => typeof window !== 'undefined';

const normalizeUserKey = (userKey: string | null | undefined) => userKey?.trim().toLowerCase() ?? '';

const buildScopePrefix = (scope: string, userKey: string | null | undefined) => {
  const normalizedUserKey = normalizeUserKey(userKey);
  if (!normalizedUserKey) {
    return null;
  }

  return `${STORAGE_PREFIX}:${scope}:${normalizedUserKey}:`;
};

export const buildScopedSessionStorageKey = (
  scope: string,
  userKey: string | null | undefined,
  key: string,
) => {
  const scopePrefix = buildScopePrefix(scope, userKey);
  if (!scopePrefix) {
    return null;
  }

  return `${scopePrefix}${key}`;
};

export const readScopedSessionStorage = <T>(
  scope: string,
  userKey: string | null | undefined,
  key: string,
  fallbackValue: T,
): T => {
  if (!isBrowser()) {
    return fallbackValue;
  }

  const storageKey = buildScopedSessionStorageKey(scope, userKey, key);
  if (!storageKey) {
    return fallbackValue;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      return fallbackValue;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallbackValue;
  }
};

export const writeScopedSessionStorage = <T>(
  scope: string,
  userKey: string | null | undefined,
  key: string,
  value: T,
) => {
  if (!isBrowser()) {
    return;
  }

  const storageKey = buildScopedSessionStorageKey(scope, userKey, key);
  if (!storageKey) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Best-effort persistence only.
  }
};

export const removeScopedSessionStorage = (
  scope: string,
  userKey: string | null | undefined,
  key: string,
) => {
  if (!isBrowser()) {
    return;
  }

  const storageKey = buildScopedSessionStorageKey(scope, userKey, key);
  if (!storageKey) {
    return;
  }

  window.sessionStorage.removeItem(storageKey);
};

export const clearScopedSessionStorageScope = (
  scope: string,
  userKey: string | null | undefined,
) => {
  if (!isBrowser()) {
    return;
  }

  const scopePrefix = buildScopePrefix(scope, userKey);
  if (!scopePrefix) {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const candidateKey = window.sessionStorage.key(index);
    if (candidateKey?.startsWith(scopePrefix)) {
      keysToRemove.push(candidateKey);
    }
  }

  keysToRemove.forEach((storageKey) => window.sessionStorage.removeItem(storageKey));
};

interface ScopedSessionStorageStateOptions<T> {
  scope: string;
  userKey: string | null | undefined;
  key: string;
  initialValue: T | (() => T);
}

const resolveInitialValue = <T,>(initialValue: T | (() => T)) =>
  typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;

export const useScopedSessionStorageState = <T,>({
  scope,
  userKey,
  key,
  initialValue,
}: ScopedSessionStorageStateOptions<T>): [T, Dispatch<SetStateAction<T>>] => {
  const getFallbackValue = useMemo(
    () => () => resolveInitialValue(initialValue),
    [initialValue],
  );
  const readState = useMemo(
    () => () => readScopedSessionStorage(scope, userKey, key, getFallbackValue()),
    [getFallbackValue, key, scope, userKey],
  );
  const [state, setState] = useState<T>(readState);
  const hydratedStorageKeyRef = useRef<string | null>(buildScopedSessionStorageKey(scope, userKey, key));

  useEffect(() => {
    const storageKey = buildScopedSessionStorageKey(scope, userKey, key);
    hydratedStorageKeyRef.current = storageKey;
    setState(readState());
  }, [key, readState, scope, userKey]);

  useEffect(() => {
    const storageKey = buildScopedSessionStorageKey(scope, userKey, key);
    if (!storageKey || hydratedStorageKeyRef.current !== storageKey) {
      return;
    }

    writeScopedSessionStorage(scope, userKey, key, state);
  }, [key, scope, state, userKey]);

  return [state, setState];
};
