/** Sales Recycle Bin — replaces original-app/recycle-bin.html + js/recycle-bin.js (shared screen, sales configuration). */
import RecycleBinScreen from './RecycleBinScreen';

export default function SalesBinPage() {
  return <RecycleBinScreen kind="sales" title="Sales Recycle Bin" />;
}
