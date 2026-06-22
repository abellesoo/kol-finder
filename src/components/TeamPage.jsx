import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLE_LABELS = { assistant_bm: 'Assistant BM', brand_manager: 'Brand Manager', admin: 'Admin' }
const ROLE_STYLES = {
  assistant_bm: 'bg-accent-dim text-ink',
  brand_manager: 'bg-mist text-ink/60',
  admin: 'bg-sage/20 text-sage',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TeamPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    supabase
      .from('users')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => { setUsers(data || []); setLoading(false) })
  }, [])

  const handleRoleChange = async (id, newRole) => {
    setSaving(id)
    await supabase.from('users').update({ role: newRole }).eq('id', id)
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role: newRole } : u))
    setSaving(null)
  }

  return (
    <div className="px-8 py-10 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <p className="font-mono text-xs tracking-widest text-ink/30 uppercase mb-1">Admin</p>
        <h1 className="text-2xl font-semibold text-ink">Team</h1>
      </div>

      {loading ? (
        <p className="text-sm text-ink/30">Loading...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-ink/30 py-6 text-center border border-dashed border-mist rounded-xl">
          No users yet
        </p>
      ) : (
        <div className="border border-mist rounded-xl overflow-hidden">
          {users.map((u, i) => (
            <div
              key={u.id}
              className={`flex items-center justify-between px-4 py-3 ${i !== users.length - 1 ? 'border-b border-mist' : ''}`}
            >
              <div>
                <p className="text-sm font-medium text-ink">{u.email}</p>
                <p className="font-mono text-xs text-ink/30 mt-0.5">{formatDate(u.created_at)}</p>
              </div>
              <select
                value={u.role}
                disabled={saving === u.id}
                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                className={`text-xs font-mono px-2 py-1 rounded border-0 outline-none cursor-pointer ${ROLE_STYLES[u.role]} ${saving === u.id ? 'opacity-50' : ''}`}
              >
                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
