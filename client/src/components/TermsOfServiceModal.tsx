import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Shield, Ban, Eye } from "lucide-react";

interface TermsOfServiceModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TermsOfServiceModal({ open, onAccept, onDecline }: TermsOfServiceModalProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

  const canAccept = agreedToTerms && agreedToPolicy;

  const handleAccept = () => {
    if (canAccept) {
      onAccept();
      // Reset state for next time
      setAgreedToTerms(false);
      setAgreedToPolicy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="modal-terms">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Terms of Service & Content Policy
          </DialogTitle>
          <DialogDescription>
            Please read and accept our terms before creating your account
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 text-sm">
            <section className="space-y-3">
              <div className="flex items-start gap-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="font-semibold text-destructive">NSFW Adult Content Warning</h3>
                  <p className="text-sm">
                    Vivid Vixen is an uncensored adult content generation platform. By using this service, you acknowledge that:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>You are at least 18 years of age</li>
                    <li>You are legally permitted to view adult content in your jurisdiction</li>
                    <li>All generated content is AI-created and not real</li>
                    <li>You will not share generated content with minors</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-start gap-2">
                <Ban className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-2">Prohibited Content</h3>
                  <p className="mb-2">You may NOT generate content depicting or suggesting:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                    <li>Minors or individuals appearing to be minors</li>
                    <li>Non-consensual acts or violence</li>
                    <li>Illegal activities as defined by US federal law</li>
                    <li>Identifiable real persons without consent</li>
                    <li>Copyrighted characters or trademarked entities</li>
                    <li>Content that violates third-party rights</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-start gap-2">
                <Eye className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-2">Monitoring & Enforcement</h3>
                  <p className="text-muted-foreground">
                    All generations are logged with user ID, prompt, and timestamp for abuse monitoring. 
                    We reserve the right to:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-2 text-muted-foreground">
                    <li>Review generations for policy violations</li>
                    <li>Suspend or terminate accounts for prohibited content</li>
                    <li>Report illegal activity to authorities</li>
                    <li>Refuse service without refund for violations</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">User Responsibilities</h3>
              <p className="text-muted-foreground">You agree to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                <li>Use the service only for legal purposes</li>
                <li>Not attempt to bypass content restrictions</li>
                <li>Not share your account with others</li>
                <li>Comply with all applicable laws in your jurisdiction</li>
                <li>Accept full responsibility for content you generate</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">Service Terms</h3>
              <p className="text-muted-foreground">
                Credits are non-refundable once used. Subscriptions renew monthly. 
                We may modify pricing or features with 30 days notice. Service is provided "as-is" 
                without warranties. We are not liable for generated content or its use.
              </p>
            </section>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Last updated: November 3, 2025
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-2">
            <Checkbox 
              data-testid="checkbox-agree-terms"
              id="terms" 
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
            />
            <label htmlFor="terms" className="text-sm cursor-pointer">
              I have read and agree to the Terms of Service
            </label>
          </div>
          
          <div className="flex items-start gap-2">
            <Checkbox 
              data-testid="checkbox-agree-policy"
              id="policy" 
              checked={agreedToPolicy}
              onCheckedChange={(checked) => setAgreedToPolicy(checked === true)}
            />
            <label htmlFor="policy" className="text-sm cursor-pointer">
              I understand the Content Policy and will not generate prohibited content
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            data-testid="button-decline-terms"
            variant="outline"
            onClick={onDecline}
          >
            Decline
          </Button>
          <Button
            data-testid="button-accept-terms"
            onClick={handleAccept}
            disabled={!canAccept}
          >
            Accept & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
