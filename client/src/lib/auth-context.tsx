import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from './queryClient';

/**
 * Backend-powered authentication system with real API integration.
 * Now uses secure backend authentication with:
 * - Password hashing (bcrypt)
 * - Session-based authentication
 * - PostgreSQL database storage
 * - Stripe payment integration
 */

interface User {
  id: string;
  email: string;
  credits: number;
  subscription: {
    tier: string | null;
    price: number;
    credits: number;
  } | null;
  lifetime: {
    tier: string;
    monthlyRefill: number;
    lastRefill: string;
  } | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  deductCredit: () => Promise<boolean>;
  addCredits: (amount: number) => Promise<void>;
  subscribe: (tier: string, price: number, credits: number) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateCredits: (newCredits: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const refreshUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const updateCredits = (newCredits: number) => {
    if (user) {
      setUser({ ...user, credits: newCredits });
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await apiRequest('POST', '/api/auth/login', { email, password });
      const data = await response.json();
      setUser(data);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const signup = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await apiRequest('POST', '/api/auth/signup', { email, password });
      const data = await response.json();
      setUser(data);
      return true;
    } catch (error) {
      console.error('Signup failed:', error);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const deductCredit = async (): Promise<boolean> => {
    if (!user || user.credits < 1) {
      return false;
    }

    try {
      const response = await apiRequest('POST', '/api/credits/deduct');
      const data = await response.json();
      setUser(prev => prev ? { ...prev, credits: data.credits } : null);
      return true;
    } catch (error) {
      console.error('Failed to deduct credit:', error);
      return false;
    }
  };

  const addCredits = async (amount: number): Promise<void> => {
    try {
      const response = await apiRequest('POST', '/api/credits/add', { amount });
      const data = await response.json();
      setUser(prev => prev ? { ...prev, credits: data.credits } : null);
    } catch (error) {
      console.error('Failed to add credits:', error);
    }
  };

  const subscribe = async (tier: string, price: number, credits: number): Promise<void> => {
    if (!user) return;

    setUser({
      ...user,
      credits: user.credits + credits,
      subscription: { tier, price, credits },
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        deductCredit,
        addCredits,
        subscribe,
        refreshUser,
        updateCredits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
