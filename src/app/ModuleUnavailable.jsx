import { ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { VENDOR } from '@/core/branding';
import { MODULE_TITLES, modulePlan } from '@/core/modules';
import { useBusiness } from '@/hooks/useBusiness';
import { Button } from '@/ui';

/** Shown instead of a module that is not in the client's plan (an old link, a bookmark or a typed address). */
export function ModuleUnavailable({ moduleId }) {
  const navigate = useNavigate();
  const business = useBusiness();
  const plan = modulePlan(business.modulePlan);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
        <Lock className="size-8" aria-hidden />
      </span>
      <h1 className="font-display text-xl font-bold text-brand-800">
        {MODULE_TITLES[moduleId] ?? 'This module'} is not part of your plan
      </h1>
      <p className="text-sm text-slate-600">
        Your plan: <strong>{plan.title}</strong>. To add {MODULE_TITLES[moduleId] ?? 'this module'}, please
        contact {VENDOR.name} ({VENDOR.phoneDisplay}).
      </p>
      <Button variant="neutral" icon={ArrowLeft} onClick={() => navigate('/')} className="mt-2">
        Back to dashboard
      </Button>
    </div>
  );
}
