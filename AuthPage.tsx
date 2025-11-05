import { AuthProvider } from '@/lib/auth-context';
import AuthPage from '../AuthPage';

export default function AuthPageExample() {
  return (
    <AuthProvider>
      <AuthPage />
    </AuthProvider>
  );
}
