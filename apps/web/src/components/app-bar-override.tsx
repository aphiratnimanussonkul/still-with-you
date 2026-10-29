import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';

export type AppBarOverride = {
  title?: string;
  extra?: ReactNode;
};

const AppBarOverrideContext = createContext<(override: AppBarOverride) => void>(() => {});

export function AppBarOverrideProvider({
  value,
  children,
}: {
  value: (override: AppBarOverride) => void;
  children: ReactNode;
}) {
  return <AppBarOverrideContext.Provider value={value}>{children}</AppBarOverrideContext.Provider>;
}

export function useAppBarOverride(override: AppBarOverride) {
  const setOverride = useContext(AppBarOverrideContext);
  const title = override.title;
  const extra = override.extra;
  useLayoutEffect(() => {
    setOverride({ title, extra });
    return () => setOverride({});
  }, [setOverride, title, extra]);
}
