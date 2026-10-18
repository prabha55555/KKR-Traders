import { AlertTriangle, FilePlus2 } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Badge, Button, Card, SectionHeader, statusTone } from '@/ui';

/** "Restock Alerts": products at or below their minimum stock, each with a "Generate PO" shortcut to a purchase bill. */
export default function RestockDashboard({ rows }) {
  const navigate = useNavigate();

  // Find products that are below min stock level (and min stock level > 0)
  const lowStockItems = rows.filter((r) => r.minStockLevel > 0 && r.available <= r.minStockLevel);

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
          lowStockItems.length > 0 ? (
            <Badge tone={statusTone('Low stock')}>{lowStockItems.length} low</Badge>
          ) : null
        }
      />
      {lowStockItems.length === 0 ? (
        <p className="text-sm text-emerald-700">
          All inventory levels are healthy! No items are currently below their minimum thresholds.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {lowStockItems.map((item) => (
            <div
              key={item.description}
              className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3"
            >
              <div className="min-w-0">
                <h4 className="truncate font-bold text-brand-800" title={item.description}>
                  {item.description}
                </h4>
                <p className="mt-1 text-xs text-slate-600 tabular-nums">
                  Available: <span className="font-bold text-red-600">{item.available}</span> / Min:{' '}
                  {item.minStockLevel}
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
          ))}
        </div>
      )}
    </Card>
  );
}
