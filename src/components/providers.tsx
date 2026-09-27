'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { useState, useMemo, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes fresh
            gcTime: 1000 * 60 * 60 * 24, // 24 hours in cache
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
          },
        },
      })
  );

  const persister = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      return createAsyncStoragePersister({
        storage: {
          getItem: async (key: string) => {
            try {
              return (await get(key)) ?? null;
            } catch {
              return null;
            }
          },
          setItem: async (key: string, value: string) => {
            try {
              await set(key, value);
            } catch {
              // Ignore quota errors in private browsing
            }
          },
          removeItem: async (key: string) => {
            try {
              await del(key);
            } catch {
              // Ignore
            }
          },
        },
        key: 'FITNESS_APP_QUERY_CACHE_V1',
        throttleTime: 1000,
      });
    } catch {
      return undefined;
    }
  }, []);

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return query.state.status === 'success';
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
