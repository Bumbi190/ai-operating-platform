"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { AtlasConversationController } from "./controller";
const Context = createContext<AtlasConversationController | null>(null);
export function AtlasConversationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const ref = useRef<AtlasConversationController | null>(null);
  ref.current ??= new AtlasConversationController();
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") ref.current?.clearOnSignout();
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return <Context.Provider value={ref.current}>{children}</Context.Provider>;
}
/** A local fallback supports isolated component fixtures; the authenticated shell supplies the shared instance. */
export function useAtlasConversationController() {
  const context = useContext(Context),
    local = useRef<AtlasConversationController | null>(null);
  if (!context) local.current ??= new AtlasConversationController();
  return context ?? local.current!;
}
export function useAtlasConversation() {
  const controller = useAtlasConversationController();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  return { controller, snapshot };
}
