import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface GenerationErrorModalProps {
  open: boolean;
  onClose: () => void;
}

export default function GenerationErrorModal({ open, onClose }: GenerationErrorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-generation-error">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-2xl">Service Temporarily Unavailable</DialogTitle>
          <DialogDescription className="text-center">
            We're experiencing high traffic on our AI generation servers right now. 
            <br /><br />
            Our team is working to restore full service. Please check back soon or try again later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            variant="default"
            onClick={onClose}
            className="w-full bg-gradient-to-r from-primary to-pink-600"
            data-testid="button-close-error"
          >
            Okay, I'll Try Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
