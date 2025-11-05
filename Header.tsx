import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Sparkles, MessageSquare, Megaphone } from 'lucide-react';
import BugReportModal from './BugReportModal';

export default function Header() {
  const { user, logout } = useAuth();
  const [showBugReportModal, setShowBugReportModal] = useState(false);

  // Fetch announcement count for badge
  const { data: announcementData } = useQuery<{ count: number }>({
    queryKey: ['/api/announcements/count'],
    refetchInterval: 60000, // Refetch every minute
  });

  const announcementCount = announcementData?.count || 0;

  if (!user) return null;

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-6">
          <Link href="/dashboard" className="hover-elevate active-elevate-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-pink-600">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">
                Vivid Vixen
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" data-testid="link-dashboard">
                Dashboard
              </Button>
            </Link>
            <Link href="/generate">
              <Button variant="ghost" data-testid="link-generate">
                Generate
              </Button>
            </Link>
            <Link href="/gallery">
              <Button variant="ghost" data-testid="link-gallery">
                Gallery
              </Button>
            </Link>
            <Link href="/announcements">
              <Button variant="ghost" data-testid="link-announcements" className="relative">
                <Megaphone className="h-4 w-4 mr-2" />
                Announcements
                {announcementCount > 0 && (
                  <Badge 
                    variant="default" 
                    className="ml-2 h-5 min-w-5 px-1 bg-primary text-primary-foreground text-xs"
                    data-testid="badge-announcement-count"
                  >
                    {announcementCount}
                  </Badge>
                )}
              </Button>
            </Link>
            <Link href="/account">
              <Button variant="ghost" data-testid="link-account">
                Account
              </Button>
            </Link>
            
            <Badge 
              variant="secondary" 
              className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-primary/20 to-pink-500/20 border-primary/30"
              data-testid="badge-credits"
            >
              {user.credits} Credits
            </Badge>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBugReportModal(true)}
              data-testid="button-bug-report"
            >
              <MessageSquare className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </nav>
        </div>
      </header>
      
      <BugReportModal 
        open={showBugReportModal} 
        onClose={() => setShowBugReportModal(false)} 
      />
    </>
  );
}
