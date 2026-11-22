import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
};

export const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  session: null,
});

export function useAuth() {
  return useContext(AuthContext);
}
