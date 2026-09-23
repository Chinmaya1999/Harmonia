import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from '../lib/api.js';
import { connectSocket, disconnectSocket } from '../lib/socket.js';
import { translator } from '../lib/i18n.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: !!tokenStore.get(), user: null, pro: null, community: null });

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setState({ loading: false, user: null, pro: null, community: null });
      return null;
    }
    try {
      const me = await api.get('/auth/me');
      setState({ loading: false, ...me });
      connectSocket();
      return me;
    } catch {
      tokenStore.set(null);
      setState({ loading: false, user: null, pro: null, community: null });
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    disconnectSocket();
    setState({ loading: false, user: null, pro: null, community: null });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh();
  }, [refresh, logout]);

  const signIn = useCallback(async (token) => {
    tokenStore.set(token);
    return refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    signIn,
    logout,
    role: state.user?.role,
    t: translator(state.user?.language),
  }), [state, refresh, signIn, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const homePathFor = (role) => (role === 'admin' ? '/ops' : role === 'professional' ? '/pro' : '/app');
