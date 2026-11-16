import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import POS from './pages/POS';
import { SecurityProvider } from './context/SecurityContext';
import SecurityPinModal from './components/SecurityPinModal';
import ProtectedRoute from './components/ProtectedRoute';

// Code-split secondary views with dynamic imports for faster initial POS launch
const Inventory = lazy(() => import('./pages/Inventory'));
const Assets = lazy(() => import('./pages/Assets'));
const Bills = lazy(() => import('./pages/Bills'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Marketing = lazy(() => import('./pages/Marketing'));
const Reports = lazy(() => import('./pages/Reports'));
const Invoices = lazy(() => import('./pages/Invoices'));
const GRN = lazy(() => import('./pages/GRN'));
const Cashbook = lazy(() => import('./pages/Cashbook'));
const CreditCustomers = lazy(() => import('./pages/CreditCustomers'));

function PageLoader() {
  return (
    <div className="p-8 h-full flex flex-col space-y-4 animate-pulse">
      <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700/60 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-slate-200/70 dark:bg-slate-700/40 rounded-2xl" />
        ))}
      </div>
      <div className="flex-1 bg-slate-100/70 dark:bg-slate-800/40 rounded-2xl min-h-[350px]" />
    </div>
  );
}

function App() {
  return (
    <SecurityProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route
              index
              element={
                <ErrorBoundary sectionName="POS">
                  <POS />
                </ErrorBoundary>
              }
            />

            <Route
              path="inventory"
              element={
                <ErrorBoundary sectionName="Inventory">
                  <ProtectedRoute
                    permission="requireForInventory"
                    title="Inventory & Stock Protection"
                    description="Access to product pricing, stock adjustments, barcode catalogues, and inventory edits is restricted to store management."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Inventory />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="grn"
              element={
                <ErrorBoundary sectionName="GRN">
                  <ProtectedRoute
                    permission="requireForGRN"
                    title="GRN (Stock In Deliveries)"
                    description="Recording incoming goods, supplier delivery notes, and purchase costs requires Manager authorization."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <GRN />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="invoices"
              element={
                <ErrorBoundary sectionName="Invoices">
                  <Suspense fallback={<PageLoader />}>
                    <Invoices />
                  </Suspense>
                </ErrorBoundary>
              }
            />

            <Route
              path="cashbook"
              element={
                <ErrorBoundary sectionName="Cashbook">
                  <ProtectedRoute
                    permission="requireForCashbook"
                    title="Cashbook & Drawer Reconciliations"
                    description="Viewing daily cash reconciliations, owner capital in/out, and shift drawer totals requires Manager authorization."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Cashbook />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="credit"
              element={
                <ErrorBoundary sectionName="Credit Book">
                  <Suspense fallback={<PageLoader />}>
                    <CreditCustomers />
                  </Suspense>
                </ErrorBoundary>
              }
            />

            <Route
              path="assets"
              element={
                <ErrorBoundary sectionName="Assets">
                  <ProtectedRoute
                    permission="requireForAssets"
                    title="Fixed Assets Management"
                    description="Shop fixtures, computing hardware, and equipment valuations are restricted to management."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Assets />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="bills"
              element={
                <ErrorBoundary sectionName="Credit GRN Invoices">
                  <ProtectedRoute
                    permission="requireForBills"
                    title="Supplier Credit Payables"
                    description="Viewing credit bills and approving distributor payables requires Manager authorization."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Bills />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="credit-grn-invoices"
              element={
                <ErrorBoundary sectionName="Credit GRN Invoices">
                  <ProtectedRoute
                    permission="requireForBills"
                    title="Supplier Credit Payables"
                    description="Viewing credit bills and approving distributor payables requires Manager authorization."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Bills />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="suppliers"
              element={
                <ErrorBoundary sectionName="Suppliers">
                  <ProtectedRoute
                    permission="requireForSuppliers"
                    title="Supplier Accounts & Cheques"
                    description="Managing supplier debt records, distributor ledgers, and bank cheques requires Manager authorization."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Suppliers />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="marketing"
              element={
                <ErrorBoundary sectionName="Marketing">
                  <ProtectedRoute
                    permission="requireForMarketing"
                    title="Deadstock & Product Velocity"
                    description="Sales velocity analytics and promotion adjustments require Manager authorization."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Marketing />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />

            <Route
              path="reports"
              element={
                <ErrorBoundary sectionName="Reports">
                  <ProtectedRoute
                    permission="requireForReports"
                    title="Financial Reports & Profit Analytics"
                    description="Store gross revenue, net profit margins, and sales intelligence are restricted to management."
                  >
                    <Suspense fallback={<PageLoader />}>
                      <Reports />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />
          </Route>
        </Routes>
      </HashRouter>
      <SecurityPinModal />
    </SecurityProvider>
  );
}

export default App;
