import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { createElement, type ReactElement, type ReactNode } from "react";
import { vi } from "vitest";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const { route = "/", queryClient = createTestQueryClient(), ...rest } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [route] }, children),
    );
  }

  return Object.assign(render(ui, { wrapper: Wrapper, ...rest }), { queryClient });
}

export function queryWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

export interface MockAuthState {
  session?: unknown;
  user?: { id: string; email?: string } | null;
  profile?: Record<string, unknown> | null;
  loading?: boolean;
  signOut?: ReturnType<typeof vi.fn>;
  refreshProfile?: ReturnType<typeof vi.fn>;
}

export function buildAuthState(overrides: MockAuthState = {}) {
  return {
    session: overrides.session ?? null,
    user: overrides.user ?? null,
    profile: overrides.profile ?? null,
    loading: overrides.loading ?? false,
    signOut: overrides.signOut ?? vi.fn(),
    refreshProfile: overrides.refreshProfile ?? vi.fn(),
  };
}

export interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

type ChainStep = Record<string, unknown>;

export function createQueryChain<T>(result: SupabaseQueryResult<T>): ChainStep {
  const terminal = vi.fn().mockResolvedValue(result);
  const chain: ChainStep = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    single: terminal,
    maybeSingle: terminal,
    then: (resolve: (value: SupabaseQueryResult<T>) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
