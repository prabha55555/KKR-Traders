import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';

import { LoadingState } from '@/ui';
import { useAuth } from './AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { ModuleLayout } from './ModuleLayout';

// Every page is code-split: the phone only downloads the screen it opens (all of it is precached by the PWA anyway).
const LoginPage = lazy(() => import('./LoginPage'));
const DashboardPage = lazy(() => import('./DashboardPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

const SalesBillPage = lazy(() => import('@/features/salesBill/SalesBillPage'));
const SalesHistoryPage = lazy(() => import('@/features/history/sales/SalesHistoryPage'));
const AddCustomerPage = lazy(() => import('@/features/customerForm/AddCustomerPage'));
const CustomerDetailsPage = lazy(() => import('@/features/customerDetails/CustomerDetailsPage'));
const SalesBinPage = lazy(() => import('@/features/recycleBin/SalesBinPage'));

const PurchaseBillPage = lazy(() => import('@/features/purchase/pages/PurchaseBillPage'));
const PurchaseEditPage = lazy(() => import('@/features/purchase/pages/PurchaseEditPage'));
const PurchaseHistoryPage = lazy(() => import('@/features/history/purchase/PurchaseHistoryPage'));
const AddSupplierPage = lazy(() => import('@/features/purchase/pages/AddSupplierPage'));
const SupplierDetailsPage = lazy(() => import('@/features/purchase/pages/SupplierDetailsPage'));
const PurchaseBinPage = lazy(() => import('@/features/recycleBin/PurchaseBinPage'));
const ProcessingLotsPage = lazy(() => import('@/features/processing/ProcessingLotsPage'));
const CompletedLotsPage = lazy(() => import('@/features/processing/CompletedLotsPage'));
const UnitsPage = lazy(() => import('@/features/processing/UnitsPage'));
const OldBatchesPage = lazy(() => import('@/features/processing/OldBatchesPage'));

const RevenuePage = lazy(() => import('@/features/overview/revenue/RevenuePage'));
const StatisticsPage = lazy(() => import('@/features/overview/revenue/StatisticsPage'));
const StocksPage = lazy(() => import('@/features/overview/stocks/StocksPage'));
const ExpensesPage = lazy(() => import('@/features/overview/expenses/ExpensesPage'));
const ShortcutsPage = lazy(() => import('@/features/overview/shortcuts/ShortcutsPage'));

const FinanceRecordsPage = lazy(() => import('@/features/finance/FinanceRecordsPage'));
const FinanceSettledRecordsPage = lazy(() => import('@/features/finance/FinanceSettledRecordsPage'));
const FinanceLendersPage = lazy(() => import('@/features/finance/FinanceLendersPage'));
const BankAccountsPage = lazy(() => import('@/features/finance/BankAccountsPage'));

function RequireAuth() {
  const { signedIn } = useAuth();
  const location = useLocation();
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState className="min-h-dvh" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route index element={<DashboardPage />} />

            <Route path="purchase" element={<ModuleLayout module="purchase" />}>
              <Route index element={<Navigate to="bill" replace />} />
              <Route path="bill" element={<PurchaseBillPage />} />
              <Route path="history" element={<PurchaseHistoryPage />} />
              <Route path="add-supplier" element={<AddSupplierPage />} />
              <Route path="suppliers" element={<SupplierDetailsPage />} />
              <Route path="dyeing" element={<Navigate to="/processing/lots" replace />} />
              <Route path="bin" element={<PurchaseBinPage />} />
              <Route path="edit/:invoiceNo" element={<PurchaseEditPage />} />
            </Route>

            {/* In-house processing: Issue (my DC) -> Dyeing -> Combing -> Received, one lot per DC */}
            <Route path="processing" element={<ModuleLayout module="processing" />}>
              <Route index element={<Navigate to="lots" replace />} />
              <Route path="lots" element={<ProcessingLotsPage />} />
              <Route path="completed" element={<CompletedLotsPage />} />
              <Route path="dyeing-units" element={<UnitsPage key="dyeing" kind="dyeing" />} />
              <Route path="combing-units" element={<UnitsPage key="combing" kind="combing" />} />
              <Route path="old" element={<OldBatchesPage />} />
            </Route>

            {/* old addresses of the separate Dyeing / Combing screens (bookmarks, PWA shortcuts) */}
            <Route path="dyeing/details" element={<Navigate to="/processing/dyeing-units" replace />} />
            <Route path="dyeing/add-dyer" element={<Navigate to="/processing/dyeing-units" replace />} />
            <Route path="dyeing/settled" element={<Navigate to="/processing/old" replace />} />
            <Route path="dyeing/*" element={<Navigate to="/processing/lots" replace />} />
            <Route path="combing/details" element={<Navigate to="/processing/combing-units" replace />} />
            <Route path="combing/settled" element={<Navigate to="/processing/old" replace />} />
            <Route path="combing/*" element={<Navigate to="/processing/lots" replace />} />

            <Route path="sales" element={<ModuleLayout module="sales" />}>
              <Route index element={<Navigate to="bill" replace />} />
              <Route path="bill" element={<SalesBillPage />} />
              <Route path="history" element={<SalesHistoryPage />} />
              <Route path="add-customer" element={<AddCustomerPage />} />
              <Route path="customers" element={<CustomerDetailsPage />} />
              <Route path="bin" element={<SalesBinPage />} />
            </Route>

            <Route path="finance" element={<ModuleLayout module="finance" />}>
              <Route index element={<Navigate to="accounts" replace />} />
              <Route path="accounts" element={<BankAccountsPage />} />
              <Route path="records" element={<FinanceRecordsPage />} />
              <Route path="settled" element={<FinanceSettledRecordsPage />} />
              <Route path="lenders" element={<FinanceLendersPage />} />
            </Route>

            <Route path="overview" element={<ModuleLayout module="overview" />}>
              <Route index element={<Navigate to="revenue" replace />} />
              <Route path="revenue" element={<RevenuePage />} />
              <Route path="statistics" element={<StatisticsPage />} />
              <Route path="stocks" element={<StocksPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="shortcuts" element={<ShortcutsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
