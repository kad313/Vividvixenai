import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface LowCreditsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LowCreditsModal({ open, onClose }: LowCreditsModalProps) {
  const [, setLocation] = useLocation();

  const handleGetCredits = () => {
    onClose();
    setLocation('/dashboard');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-low-credits">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-2xl">Need More Credits</DialogTitle>
          <DialogDescription className="text-center">
            You don't have enough credits to generate content. Purchase more credits or subscribe to continue creating.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            onClick={handleGetCredits}
            className="w-full bg-gradient-to-r from-primary to-pink-600"
            data-testid="button-get-credits"
          >
            Get Credits
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
