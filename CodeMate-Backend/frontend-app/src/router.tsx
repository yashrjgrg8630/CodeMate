import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ApiError } from "./services/client";
import { routeTree } from "./routeTree.gen";

function notifyRequestError(error: unknown) {
  if (error instanceof ApiError && error.status === 400) {
    toast.error(`Please check your input. ${error.message}`);
    return;
  }
  if (error instanceof ApiError && error.status === 401) {
    toast.error("Your session has expired. Please sign in again.");
    return;
  }
  toast.error(error instanceof Error ? error.message : "The request could not be completed.");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: notifyRequestError }),
    mutationCache: new MutationCache({ onError: notifyRequestError }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
