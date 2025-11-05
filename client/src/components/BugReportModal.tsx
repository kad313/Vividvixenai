import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/lib/auth-context';
import { Bug, Lightbulb, AlertTriangle } from 'lucide-react';

interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function BugReportModal({ open, onClose }: BugReportModalProps) {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [type, setType] = useState<string>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide details about your report',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest('POST', '/api/bug-report', { type, message });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit report');
      }

      const data = await response.json();

      toast({
        title: 'Report submitted!',
        description: data.message,
      });

      // Refresh user data to show new credit balance
      await refreshUser();

      // Reset form and close
      setMessage('');
      setType('bug');
      onClose();
    } catch (error: any) {
      toast({
        title: 'Submission failed',
        description: error.message || 'Failed to submit report',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'bug':
        return <Bug className="h-6 w-6 text-primary" />;
      case 'feature':
        return <Lightbulb className="h-6 w-6 text-primary" />;
      case 'outage':
        return <AlertTriangle className="h-6 w-6 text-primary" />;
      default:
        return <Bug className="h-6 w-6 text-primary" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-bug-report">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              {getIcon()}
            </div>
          </div>
          <DialogTitle className="text-center text-2xl">Submit Feedback</DialogTitle>
          <DialogDescription className="text-center">
            Report a bug, request a feature, or notify us of an outage. Your first report each day earns 2 credits! (Limit: 3 reports per day)
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="report-type" data-testid="select-report-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug" data-testid="option-bug">Bug Report</SelectItem>
                <SelectItem value="feature" data-testid="option-feature">Feature Request</SelectItem>
                <SelectItem value="outage" data-testid="option-outage">Service Outage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="report-message">Details</Label>
            <Textarea
              id="report-message"
              placeholder="Please describe your issue, suggestion, or the problem you're experiencing..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              data-testid="input-report-message"
            />
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-primary to-pink-600"
              data-testid="button-submit-report"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="button-cancel-report"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
