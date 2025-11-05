import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Sparkles, Zap, Crown, MessageCircle, Lock, Tag, Gift } from 'lucide-react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { loadStripe } from '@stripe/stripe-js';
import Header from './Header';

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  console.error('Missing VITE_STRIPE_PUBLIC_KEY - payment status checking will be disabled');
}

const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY 
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null;

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  // Check payment status after 3D Secure redirect
  useEffect(() => {
    const checkPaymentStatus = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentIntentClientSecret = urlParams.get('payment_intent_client_secret');
      const paymentIntent = urlParams.get('payment_intent');

      if (paymentIntentClientSecret && paymentIntent) {
        console.log('[PAYMENT STATUS] Checking payment status after redirect:', paymentIntent);
        
        const stripe = await stripePromise;
        if (!stripe) {
          console.error('[PAYMENT STATUS] Stripe not loaded - clearing URL params');
          // Clean up URL even if Stripe failed to load
          window.history.replaceState({}, '', '/dashboard');
          return;
        }

        try {
          const { paymentIntent: retrievedIntent } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);
          
          console.log('[PAYMENT STATUS] Payment intent status:', retrievedIntent?.status);

          if (retrievedIntent?.status === 'succeeded') {
            toast({
              title: "Payment Successful!",
              description: "Your credits or subscription have been activated.",
            });
            await refreshUser();
          } else if (retrievedIntent?.status === 'processing') {
            toast({
              title: "Payment Processing",
              description: "Your payment is being processed. You'll be notified once complete.",
            });
          } else if (retrievedIntent?.status === 'requires_payment_method') {
            toast({
              title: "Payment Failed",
              description: "Your payment method was declined. Please try a different payment method.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Payment Status Unknown",
              description: "Please check your account or contact support if you have questions.",
              variant: "destructive",
            });
          }
        } catch (error: any) {
          console.error('[PAYMENT STATUS] Error checking payment:', error);
          toast({
            title: "Payment Verification Failed",
            description: "Could not verify payment status. Please check your account.",
            variant: "destructive",
          });
        } finally {
          // Always clean up URL, even on error
          window.history.replaceState({}, '', '/dashboard');
        }
      }
    };

    checkPaymentStatus();
  }, [toast, refreshUser]);

  if (!user) return null;

  const handleBuyCredits = () => {
    setLocation('/checkout');
  };

  const handleSubscribe = () => {
    setLocation('/subscribe');
  };

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest('POST', '/api/promo/redeem', { code: code.toUpperCase() });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to redeem code');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Promo Code Redeemed!',
        description: `You received ${data.tier} tier with ${data.credits} credits!`,
      });
      setPromoCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      refreshUser();
    },
    onError: (error: any) => {
      toast({
        title: 'Redemption Failed',
        description: error.message || 'Invalid or expired promo code',
        variant: 'destructive',
      });
    },
  });

  const handleRedeemCode = () => {
    if (!promoCode.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a promo code',
        variant: 'destructive',
      });
      return;
    }
    redeemMutation.mutate(promoCode.trim());
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12 animate-slide-up">
          <h1 className="text-4xl font-bold mb-2">
            Welcome back, <span className="bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">{user.email.split('@')[0]}</span>
          </h1>
          <p className="text-muted-foreground text-lg">Manage your credits and subscription</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8 animate-fade-in">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Available Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-pink-600/20">
                  <Sparkles className="h-6 w-6 text-primary" data-testid="icon-credits"/>
                </div>
                <div>
                  <div className="text-4xl font-bold bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent" data-testid="text-credits">
                    {user.credits}
                  </div>
                  <p className="text-sm text-muted-foreground">Credits remaining</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-pink-500/5 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                <CardTitle className="text-sm font-medium">Have a Promo Code?</CardTitle>
              </div>
              <CardDescription>Redeem codes for credits and tier upgrades</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.trim().toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleRedeemCode()}
                className="uppercase font-mono"
                data-testid="input-promo-code-dashboard"
              />
              <Button
                onClick={handleRedeemCode}
                disabled={redeemMutation.isPending || !promoCode.trim()}
                className="w-full bg-gradient-to-r from-primary to-pink-600"
                data-testid="button-redeem-promo-dashboard"
              >
                {redeemMutation.isPending ? 'Redeeming...' : 'Redeem Code'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-dashed border-primary/30 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">Coming Soon</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-pink-600/20">
                  <MessageCircle className="h-6 w-6 text-primary" data-testid="icon-chat"/>
                </div>
                <div>
                  <div className="text-lg font-bold">Uncensored Chatbot</div>
                  <p className="text-sm text-muted-foreground">For NSFW prompts, captions & chat</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {user.subscription && (
          <div className="mb-8 animate-fade-in">
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-pink-500/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  <CardTitle>Active Subscription</CardTitle>
                </div>
                <CardDescription>
                  {user.subscription.tier} Plan - ${(user.subscription.price / 100).toFixed(2)}/month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                  {user.subscription.credits} credits/month
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-2xl font-bold mb-2">Get More Credits</h2>
            <p className="text-muted-foreground mb-6">View all credit packs and subscription options</p>
          </div>

          <Card className="hover-elevate max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-pink-600/20">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Credit Packs Available</CardTitle>
                  <CardDescription>One-time purchase - credits never expire</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg border border-primary/20 bg-gradient-to-br from-pink-500/5 to-primary/5">
                  <div className="text-xs text-muted-foreground mb-1">Starter</div>
                  <div className="text-2xl font-bold">20</div>
                  <div className="text-xs text-muted-foreground">credits</div>
                  <div className="text-sm font-semibold text-primary mt-1">$9.99</div>
                </div>
                <div className="text-center p-3 rounded-lg border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-primary/5">
                  <div className="text-xs text-muted-foreground mb-1">Pro</div>
                  <div className="text-2xl font-bold">100</div>
                  <div className="text-xs text-muted-foreground">credits</div>
                  <div className="text-sm font-semibold text-yellow-400 mt-1">$39.99</div>
                </div>
                <div className="text-center p-3 rounded-lg border border-green-500/20 bg-gradient-to-br from-green-500/5 to-primary/5">
                  <div className="text-xs text-muted-foreground mb-1">Elite</div>
                  <div className="text-2xl font-bold">300</div>
                  <div className="text-xs text-muted-foreground">credits</div>
                  <div className="text-sm font-semibold text-green-400 mt-1">$99.99</div>
                </div>
                <div className="text-center p-3 rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-primary/5">
                  <div className="text-xs text-muted-foreground mb-1">VIP</div>
                  <div className="text-2xl font-bold">1000</div>
                  <div className="text-xs text-muted-foreground">credits</div>
                  <div className="text-sm font-semibold text-purple-400 mt-1">$299.99</div>
                </div>
              </div>
              <Button
                className="w-full bg-gradient-to-r from-primary to-pink-600"
                onClick={handleSubscribe}
                data-testid="button-view-plans"
              >
                View All Plans & Packs
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
