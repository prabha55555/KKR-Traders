import { AlertTriangle, FilePlus2 } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Badge, Button, Card, SectionHeader, statusTone } from '@/ui';

/** "Restock Alerts": products at or below their minimum stock, each with a "Generate PO" shortcut to a purchase bill. */
export default function RestockDashboard({ rows }) {
  const navigate = useNavigate();

  // products with a minimum level: out of stock / oversold (nothing left, red) vs low (some left, at or under the minimum, amber)
  const tracked = rows.filter((r) => r.minStockLevel > 0 && r.available <= r.minStockLevel);
  const outItems = tracked.filter((r) => r.available <= 0);
  const lowItems = tracked.filter((r) => r.available > 0);
  const alertItems = [...outItems, ...lowItems];

  const handleCreatePO = (item) => {
    // Generate a Purchase Order for the missing quantity
    const missingQty = Math.max(1, item.minStockLevel - item.available || 1);
    navigate(`/purchase/bill?product=${encodeURIComponent(item.description)}&qty=${missingQty}`);
  };

  return (
    <Card className="mb-5">
      <SectionHeader
        title="Restock Alerts"
        icon={AlertTriangle}
        right={
          alertItems.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {outItems.length > 0 ? (
                <Badge tone={statusTone('Out of stock')}>{outItems.length} out</Badge>
              ) : null}
              {lowItems.length > 0 ? (
                <Badge tone={statusTone('Low stock')}>{lowItems.length} low</Badge>
              ) : null}
            </span>
          ) : null
        }
      />
      {alertItems.length === 0 ? (
        <p className="text-sm text-emerald-700">
          All inventory levels are healthy! No items are currently below their minimum thresholds.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {alertItems.map((item) => {
            const out = item.available <= 0;
            return (
              <div
                key={item.description}
                className={`flex min-w-0 flex-col justify-between gap-3 rounded-xl border p-3 ${
                  out ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="min-w-0">
                  <h4 className="truncate font-bold text-brand-800" title={item.description}>
                    {item.description}
                  </h4>
                  <p className="mt-1 text-xs text-slate-600 tabular-nums">
                    Available:{' '}
                    <span className={`font-bold ${out ? 'text-red-600' : 'text-amber-700'}`}>
                      {item.available}
                    </span>{' '}
                    / Min: {item.minStockLevel}
                    {out ? <span className="ml-1 font-semibold text-red-600">· Out of stock</span> : null}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  icon={FilePlus2}
                  fullWidth
                  onClick={() => handleCreatePO(item)}
                >
                  Generate PO
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
