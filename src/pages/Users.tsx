import { useEffect, useState } from 'react'
import { UserPlus, Users as UsersIcon } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import type { AppUser, UserRole } from '../lib/types'

export default function Users() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('warehouse_staff')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('users').select('*').order('full_name')
    setUsers((data ?? []) as AppUser[])
    setLoading(false)
  }

  async function handleToggleActive(u: AppUser) {
    await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    await load()
  }

  async function handleRoleChange(u: AppUser, newRole: UserRole) {
    await supabase.from('users').update({ role: newRole }).eq('id', u.id)
    await load()
  }

  async function handleInvite() {
    setInviteError(null)
    setInviteSuccess(null)
    if (!email.trim() || !fullName.trim()) {
      setInviteError('Full name and email are required.')
      return
    }
    setInviting(true)
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim(), full_name: fullName.trim(), role },
    })
    setInviting(false)

    if (error) {
      setInviteError(error.message ?? 'Could not send invite.')
      return
    }
    setInviteSuccess(`Invitation sent to ${email.trim()}.`)
    setEmail('')
    setFullName('')
    setRole('warehouse_staff')
    await load()
  }

  return (
    <Layout title="Users">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-400">Manage who can access WITS and their role.</p>
          <Button
            onClick={() => {
              setInviteError(null)
              setInviteSuccess(null)
              setModalOpen(true)
            }}
          >
            <UserPlus size={16} /> Invite User
          </Button>
        </div>

        <Card>
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner className="h-6 w-6 text-ink-400" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={<UsersIcon size={32} />} title="No users yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3 font-medium text-ink-800">{u.full_name}</td>
                      <td className="px-5 py-3 text-ink-500">{u.email}</td>
                      <td className="px-5 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => void handleRoleChange(u, e.target.value as UserRole)}
                          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium"
                        >
                          <option value="warehouse_staff">Warehouse Staff (Receiver)</option>
                          <option value="production">Production</option>
                          <option value="warehouse_officer">Warehouse Officer</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => void handleToggleActive(u)}>
                          <Badge tone={u.is_active ? 'success' : 'neutral'}>
                            {u.is_active ? 'Active' : 'Deactivated'}
                          </Badge>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Invite User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void handleInvite()} disabled={inviting}>
              {inviting ? 'Sending…' : 'Send Invite'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="warehouse_staff">Warehouse Staff (Receiver)</option>
            <option value="production">Production</option>
            <option value="warehouse_officer">Warehouse Officer</option>
            <option value="admin">Administrator</option>
          </Select>
          {inviteError && <p className="text-sm font-medium text-red-600">{inviteError}</p>}
          {inviteSuccess && <p className="text-sm font-medium text-ok-600">{inviteSuccess}</p>}
          <p className="text-xs text-ink-400">
            An email invitation is sent via Supabase Auth. Requires the <code>invite-user</code> Edge
            Function to be deployed (see README).
          </p>
        </div>
      </Modal>
    </Layout>
  )
}
