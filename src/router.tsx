import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { clearAiCache } from "@/services/gemini";

export const getRouter = () => {
  // যেকোনো এন্ট্রি সেভ হলে (চালান, জমা, খরচ, হাজিরা…) পুরো সাইটের হিসাব
  // চুপচাপ পেছনে আবার আনা হয়। স্ক্রিনে আগের সংখ্যা থাকে, নতুন এলে শুধু
  // সংখ্যাটা বদলে যায় — কোনো লোডিং বা রিফ্রেশ দেখা যায় না।
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: () => {
        clearAiCache();
        void queryClient.invalidateQueries();
      },
    }),
    defaultOptions: {
      queries: {
        // ৩০ সেকেন্ড পুরোনো হলে পাতায় ঢোকার সময় পেছনে নতুন করে আনে
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        // অন্য অ্যাপ থেকে ফিরে আসলে পেছনে চুপচাপ মিলিয়ে নেয় (পাতা বদলায় না)
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // পেছনে গেলে আগের পাতার ঠিক আগের জায়গায় (স্ক্রল সহ) ফিরে যায়
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
