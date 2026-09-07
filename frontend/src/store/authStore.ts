/**
 * Auth state management using Zustand.
 * Will store JWT tokens and user info in Sprint 3-4.
 */

import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  user: null;
  setUser: (user: null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  setUser: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
