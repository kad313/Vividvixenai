import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Crown } from 'lucide-react';
import { TermsOfServiceModal } from '@/components/TermsOfServiceModal';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const { login, signup, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    if (isLogin) {
      const success = await login(email, password);
      if (success) {
        toast({
          title: 'Welcome back!',
          description: 'Successfully logged in',
        });
        setLocation('/dashboard');
      } else {
        toast({
          title: 'Error',
          description: 'Invalid email or password',
          variant: 'destructive',
        });
      }
    } else {
      // Show terms of service modal before signup
      setShowTermsModal(true);
    }
  };

  const handleTermsAccept = async () => {
    setShowTermsModal(false);
    
    // Proceed with signup after terms accepted
    const success = await signup(email, password);
    if (success) {
      // If user entered a promo code, try to redeem it
      if (promoCode.trim()) {
        try {
          const res = await fetch('/api/promo/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
            credentials: 'include',
          });
          
          const data = await res.json();
          
          if (res.ok) {
            // Refresh user data to get updated credits
            await refreshUser();
            
            toast({
              title: isFoundingMember ? 'Welcome back, Founding Member! 👑' : 'Promo Code Redeemed!',
              description: isFoundingMember 
                ? 'Your exclusive access has been activated'
                : `You received ${data.tier} tier with ${data.credits} credits!`,
            });
          } else {
            // Show signup success but promo failed
            toast({
              title: 'Account Created',
              description: `Welcome! Your promo code was invalid. Get started with your account.`,
            });
          }
        } catch (error) {
          // Promo failed but signup succeeded
          toast({
            title: 'Welcome to Vivid Vixen!',
            description: 'Account created successfully!',
          });
        }
      } else {
        // No promo code
        if (isFoundingMember) {
          toast({
            title: 'Welcome back, Founding Member! 👑',
            description: 'Your exclusive access has been activated',
          });
        } else {
          toast({
            title: 'Welcome to Vivid Vixen!',
            description: 'Account created successfully!',
          });
        }
      }
      setLocation('/dashboard');
    } else {
      toast({
        title: 'Error',
        description: 'Email already exists or not found on founding member list',
        variant: 'destructive',
      });
    }
  };

  const handleTermsDecline = () => {
    setShowTermsModal(false);
    toast({
      title: 'Account creation cancelled',
      description: 'You must accept the Terms of Service to create an account',
      variant: 'destructive',
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-600 mb-4">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent mb-2">
            Vivid Vixen
          </h1>
          <p className="text-muted-foreground">AI Content Generation Platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {isLogin ? 'Welcome back' : isFoundingMember ? '👑 Founding Member Access' : 'Create account'}
            </CardTitle>
            <CardDescription>
              {isLogin 
                ? 'Sign in to your account' 
                : isFoundingMember 
                ? 'Enter your email to activate your exclusive access' 
                : 'Get started with 10 free credits'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-password"
                />
              </div>

              {!isLogin && !isFoundingMember && (
                <div className="space-y-2">
                  <Label htmlFor="promoCode" className="text-muted-foreground">
                    Promo Code (Optional)
                  </Label>
                  <Input
                    id="promoCode"
                    type="text"
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.trim().toUpperCase())}
                    className="uppercase font-mono"
                    data-testid="input-promo-code-signup"
                  />
                  <p className="text-xs text-muted-foreground">
                    Have a promo code? Enter it here to unlock extra credits!
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className={`w-full ${
                  isFoundingMember 
                    ? 'bg-gradient-to-r from-amber-500 via-primary to-pink-600' 
                    : 'bg-gradient-to-r from-primary to-pink-600'
                } hover:opacity-90`}
                data-testid="button-submit"
              >
                {isLogin ? 'Sign in' : isFoundingMember ? '✨ Activate Founding Member Access' : 'Create account'}
              </Button>

              {!isLogin && !isFoundingMember && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-primary/50 hover:bg-primary/10"
                  onClick={() => {
                    setIsFoundingMember(true);
                    setEmail('');
                    setPassword('');
                    setPromoCode('');
                  }}
                  data-testid="button-founding-member"
                >
                  <Crown className="mr-2 h-4 w-4 text-primary" />
                  Girl, I'm a Founding Member 👀
                </Button>
              )}

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setIsFoundingMember(false);
                    setEmail('');
                    setPassword('');
                    setPromoCode('');
                  }}
                  className="text-primary hover:underline"
                  data-testid="button-toggle-auth"
                >
                  {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
              </div>

              {isFoundingMember && !isLogin && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFoundingMember(false);
                      setEmail('');
                      setPassword('');
                      setPromoCode('');
                    }}
                    className="text-sm text-muted-foreground hover:text-primary"
                    data-testid="button-regular-signup"
                  >
                    ← Back to regular signup
                  </button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <TermsOfServiceModal
        open={showTermsModal}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />
    </div>
  );
}
