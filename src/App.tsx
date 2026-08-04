import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewTransfer from './pages/NewTransfer'
import TransferHistory from './pages/TransferHistory'
import Products from './pages/Products'
import Users from './pages/Users'
import Reports from './pages/Reports'
import Search from './pages/Search'
import TransferImport from './pages/TransferImport'
import VarianceReview from './pages/VarianceReview'
import PalletLabelPrinting from './pages/PalletLabelPrinting'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transfers/new"
        element={
          <ProtectedRoute allowedRoles={['warehouse_staff']}>
            <NewTransfer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transfers"
        element={
          <ProtectedRoute allowedRoles={['warehouse_staff']}>
            <TransferHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute adminOnly>
            <Products />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute adminOnly>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={['warehouse_officer']}>
            <Reports />
          </ProtectedRoute>
        }
      />

      {/* Transfer Barcode Receiving feature */}
      <Route
        path="/transfer-management"
        element={
          <ProtectedRoute allowedRoles={['production']}>
            <TransferImport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/variance-review"
        element={
          <ProtectedRoute allowedRoles={['warehouse_officer']}>
            <VarianceReview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/label-printing"
        element={
          <ProtectedRoute allowedRoles={['warehouse_officer', 'production']}>
            <PalletLabelPrinting />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
