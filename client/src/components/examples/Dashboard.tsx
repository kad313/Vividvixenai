import { AuthProvider } from '@/lib/auth-context';
import Dashboard from '../Dashboard';
import { useEffect } from 'react';

export default function DashboardExample() {
  useEffect(() => {
    localStorage.setItem('vivid_vixen_user', JSON.stringify({
      email: 'demo@example.com',
      credits: 42,
      subscription: null,
    }));
  }, []);

  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}
