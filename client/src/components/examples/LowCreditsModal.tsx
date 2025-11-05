import { useState } from 'react';
import LowCreditsModal from '../LowCreditsModal';
import { Button } from '@/components/ui/button';

export default function LowCreditsModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Show Low Credits Modal</Button>
      <LowCreditsModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
