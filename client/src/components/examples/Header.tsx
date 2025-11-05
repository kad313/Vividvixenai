import { AuthProvider } from '@/lib/auth-context';
import Header from '../Header';
import { useEffect } from 'react';

export default function HeaderExample() {
  useEffect(() => {
    localStorage.setItem('vivid_vixen_user', JSON.stringify({
      email: 'demo@example.com',
      credits: 42,
      subscription: null,
    }));
  }, []);

  return (
    <AuthProvider>
      <Header />
    </AuthProvider>
  );
}
