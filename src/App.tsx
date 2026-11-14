import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Assets from './pages/Assets';
import Bills from './pages/Bills';
import Suppliers from './pages/Suppliers';
import Marketing from './pages/Marketing';
import Reports from './pages/Reports';
import Invoices from './pages/Invoices';
import GRN from './pages/GRN';
import Cashbook from './pages/Cashbook';

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
              <Inventory />
            </ErrorBoundary>
          } />
          <Route path="grn" element={
            <ErrorBoundary sectionName="GRN">
              <GRN />
            </ErrorBoundary>
          } />
          <Route path="invoices" element={
            <ErrorBoundary sectionName="Invoices">
              <Invoices />
            </ErrorBoundary>
          } />
          <Route path="cashbook" element={
            <ErrorBoundary sectionName="Cashbook">
              <Cashbook />
            </ErrorBoundary>
          } />
          <Route path="assets" element={
            <ErrorBoundary sectionName="Assets">
              <Assets />
            </ErrorBoundary>
          } />
          <Route path="bills" element={
            <ErrorBoundary sectionName="Credit GRN Invoices">
              <Bills />
            </ErrorBoundary>
          } />
          <Route path="credit-grn-invoices" element={
            <ErrorBoundary sectionName="Credit GRN Invoices">
              <Bills />
            </ErrorBoundary>
          } />
          <Route path="suppliers" element={
            <ErrorBoundary sectionName="Suppliers">
              <Suppliers />
            </ErrorBoundary>
          } />
          <Route path="marketing" element={
            <ErrorBoundary sectionName="Marketing">
              <Marketing />
            </ErrorBoundary>
          } />
          <Route path="reports" element={
            <ErrorBoundary sectionName="Reports">
              <Reports />
            </ErrorBoundary>
          } />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
