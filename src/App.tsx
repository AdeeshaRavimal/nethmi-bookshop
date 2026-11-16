import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import POS from './pages/POS';

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
      <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700/60 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-gray-200/70 dark:bg-gray-700/40 rounded-2xl" />
        ))}
      </div>
      <div className="flex-1 bg-gray-100/70 dark:bg-gray-800/40 rounded-2xl min-h-[350px]" />
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={
            <ErrorBoundary sectionName="POS">
              <POS />
            </ErrorBoundary>
          } />
          <Route path="inventory" element={
            <ErrorBoundary sectionName="Inventory">
              <Suspense fallback={<PageLoader />}>
                <Inventory />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="grn" element={
            <ErrorBoundary sectionName="GRN">
              <Suspense fallback={<PageLoader />}>
                <GRN />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="invoices" element={
            <ErrorBoundary sectionName="Invoices">
              <Suspense fallback={<PageLoader />}>
                <Invoices />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="cashbook" element={
            <ErrorBoundary sectionName="Cashbook">
              <Suspense fallback={<PageLoader />}>
                <Cashbook />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="credit" element={
            <ErrorBoundary sectionName="Credit Book">
              <Suspense fallback={<PageLoader />}>
                <CreditCustomers />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="assets" element={
            <ErrorBoundary sectionName="Assets">
              <Suspense fallback={<PageLoader />}>
                <Assets />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="bills" element={
            <ErrorBoundary sectionName="Credit GRN Invoices">
              <Suspense fallback={<PageLoader />}>
                <Bills />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="credit-grn-invoices" element={
            <ErrorBoundary sectionName="Credit GRN Invoices">
              <Suspense fallback={<PageLoader />}>
                <Bills />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="suppliers" element={
            <ErrorBoundary sectionName="Suppliers">
              <Suspense fallback={<PageLoader />}>
                <Suppliers />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="marketing" element={
            <ErrorBoundary sectionName="Marketing">
              <Suspense fallback={<PageLoader />}>
                <Marketing />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="reports" element={
            <ErrorBoundary sectionName="Reports">
              <Suspense fallback={<PageLoader />}>
                <Reports />
              </Suspense>
            </ErrorBoundary>
          } />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
