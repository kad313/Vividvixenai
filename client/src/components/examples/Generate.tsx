import { AuthProvider } from '@/lib/auth-context';
import Generate from '../Generate';
import { useEffect } from 'react';

export default function GenerateExample() {
  useEffect(() => {
    localStorage.setItem('vivid_vixen_user', JSON.stringify({
      email: 'demo@example.com',
      credits: 5,
      subscription: null,
    }));
  }, []);

  return (
    <AuthProvider>
      <Generate />
    </AuthProvider>
  );
}
