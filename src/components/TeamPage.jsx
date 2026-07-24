import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageHeader from './core/PageHeader'
import Loading from './core/Loading'
import EmptyState from './core/EmptyState'

const ROLE_LABELS = { member: 'Member', admin: 'Admin' }
const ROLE_STYLES = {
  member: 'bg-mist text-body',
  admin: 'bg-sage/15 text-sage',
}
// Everyone who isn't an admin is a plain member. Legacy roles (assistant_bm /
// brand_manager) collapse here too, so rows still render before db/role_merge.sql
// has been applied.
const normalizeRole = (role) => (role === 'admin' ? 'admin' : 'member')

const AVATAR_COLORS = [
  'bg-[#D6CFC4] text-[#5C5340]',
  'bg-[#C8D6CF] text-[#3A5C4A]',
  'bg-[#D4C8D6] text-[#5C3A5C]',
  'bg-[#D6D0C4] text-[#5C5040]',
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function initials(email) {
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function TeamPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  const fetchUsers = useCallback(() => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    supabase
      .from('users')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => { setUsers(data || []); setLoading(false) })
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleRoleChange = async (id, newRole) => {
    if (!supabase) return
    setSaving(id)
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', id)
    if (!error) setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role: newRole } : u))
    setSaving(null)
  }

  return (
    <div className="px-[48px] py-[40px] w-full">
      <PageHeader
        className="mb-8"
        label="Admin"
        title="Team"
        count={!loading && supabase && users.length ? users.length : null}
        subtitle="Manage who can access the seeding tool and what they can do."
        actions={
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-card-edge rounded-[10px] text-[12px] text-faint hover:text-ink hover:border-ink/30 transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {loading ? (
        <Loading label="Loading team…" />
      ) : !supabase ? (
        <p className="text-[13.5px] text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
          Supabase not configured — team management unavailable locally
        </p>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users yet" description="People appear here the first time they sign in with a Markato account." />
      ) : (
        <div className="border border-card-edge rounded-[14px] overflow-hidden bg-white">
          {users.map((u, i) => {
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length]
            return (
              <div
                key={u.id}
                className={`flex items-center gap-[14px] px-[18px] py-[14px] ${i !== users.length - 1 ? 'border-b border-[#F0ECE2]' : ''}`}
              >
                {/* Avatar */}
                <div className={`w-[40px] h-[40px] rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${avatarColor}`}>
                  {initials(u.email)}
                </div>

                {/* Email + date */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-ink truncate">{u.email}</p>
                  <p className="font-mono text-[11px] text-faint mt-[2px]">joined {formatDate(u.created_at)}</p>
                </div>

                {/* Role dropdown */}
                <select
                  value={normalizeRole(u.role)}
                  disabled={saving === u.id}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  className={`text-[12px] font-medium px-[10px] py-[5px] rounded-[9px] border border-card-edge outline-none cursor-pointer appearance-none pr-[24px] bg-no-repeat ${ROLE_STYLES[normalizeRole(u.role)]} ${saving === u.id ? 'opacity-50' : ''}`}
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23A89E8C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center' }}
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
