import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
      <p className="text-gold-gradient font-display text-6xl font-extrabold">404</p>
      <h1 className="font-display text-xl font-bold text-brand-800">Page not found</h1>
      <p className="text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Button variant="neutral" icon={ArrowLeft} onClick={() => navigate('/')} className="mt-2">
        Back to dashboard
      </Button>
    </div>
  );
}
