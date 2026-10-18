import { todayISO } from '@/core/format';
import { downloadFile } from '@/platform';
import { buildSuppliersCsv, suppliersCsvFileName } from './supplierDetails';

/** Export button: browser download of the CSV (like the original page). */
export async function exportSuppliersCsv(suppliers) {
  const csv = buildSuppliersCsv(suppliers);
  downloadFile(suppliersCsvFileName(todayISO()), csv, 'text/csv');
}
