import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AgeVerificationGate } from "@/components/AgeVerificationGate";
import Auth from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import GeneratePage from "@/pages/generate";
import GalleryPage from "@/pages/gallery";
import AnnouncementsPage from "@/pages/announcements";
import CheckoutPage from "@/pages/checkout";
import SubscribePage from "@/pages/subscribe";
import AdminPage from "@/pages/admin";
import AccountPage from "@/pages/account";
import RedeemPage from "@/pages/redeem";
import PaymentSuccessPage from "@/pages/payment-success";
import PaymentCancelPage from "@/pages/payment-cancel";
import ContentPolicyPage from "@/pages/content-policy";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element | null }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  if (!user) {
    return <Redirect to="/" />;
  }
  
  return <Component />;
}

function Router() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/">
        {user ? <Redirect to="/dashboard" /> : <Auth />}
      </Route>
      <Route path="/auth">
        {user ? <Redirect to="/dashboard" /> : <Auth />}
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/generate">
        <ProtectedRoute component={GeneratePage} />
      </Route>
      <Route path="/gallery">
        <ProtectedRoute component={GalleryPage} />
      </Route>
      <Route path="/announcements">
        <ProtectedRoute component={AnnouncementsPage} />
      </Route>
      <Route path="/checkout">
        <ProtectedRoute component={CheckoutPage} />
      </Route>
      <Route path="/subscribe">
        <ProtectedRoute component={SubscribePage} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminPage} />
      </Route>
      <Route path="/account">
        <ProtectedRoute component={AccountPage} />
      </Route>
      <Route path="/redeem" component={RedeemPage} />
      <Route path="/payment-success">
        <ProtectedRoute component={PaymentSuccessPage} />
      </Route>
      <Route path="/payment-cancel">
        <ProtectedRoute component={PaymentCancelPage} />
      </Route>
      <Route path="/content-policy" component={ContentPolicyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AgeVerificationGate>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </AgeVerificationGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
