import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Edit, Trash2, Shield, CheckCircle, XCircle, RefreshCw, Key, AlertCircle, Search } from 'lucide-react';
import * as api from '../api';
import { notify } from '../lib/notify';
import { T } from '../ui/tokens';

const ROLES = ['admin', 'staff', 'overseas_staff'];
const ROLE_LABELS = { admin: 'Admin', staff: 'Staff', overseas_staff: 'Overseas Staff' };
const ROLE_COLORS = { admin: 'bg-red-100 text-red-800', staff: 'bg-blue-100 text-blue-800', overseas_staff: 'bg-amber-100 text-amber-800' };

const EMPTY_FORM = { username: '', email: '', full_name: '', password: '', role: 'staff' };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-lg shadow-xl w-full max-w-md p-6 space-y-4" style={{ background: T.panel }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: T.text }}>{title}</h3>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: T.textMuted }}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UserManagement({ currentUser }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');

  const { data: userList = [], isLoading, refetch } = useQuery({
    queryKey: ['users/list'],
    queryFn: () => api.users.list(),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); setError(m); notify(m, { type: 'error' }); },
  });

  const { mutate: createUser, isPending: creating } = useMutation({
    mutationFn: (data) => api.users.create(data),
    onSuccess: () => { qc.invalidateQueries(['users/list']); setCreateOpen(false); setForm(EMPTY_FORM); setError(''); },
    onError: (e) => { const m = e?.message || String(e); setError(m); notify(m, { type: 'error' }); },
  });

  const { mutate: updateUser, isPending: updating } = useMutation({
    mutationFn: ({ id, data }) => api.users.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['users/list']); setEditUser(null); setError(''); },
    onError: (e) => { const m = e?.message || String(e); setError(m); notify(m, { type: 'error' }); },
  });

  const { mutate: removeUser, isPending: removing } = useMutation({
    mutationFn: (id) => api.users.delete(id),
    onSuccess: () => { qc.invalidateQueries(['users/list']); setDeleteUser(null); },
    onError: (e) => { const m = e?.message || String(e); setError(m); notify(m, { type: 'error' }); },
  });

  const { mutate: resetPassword, isPending: resetting } = useMutation({
    mutationFn: ({ id, password }) => api.users.resetPassword(id, password),
    onSuccess: () => { setResetUser(null); setNewPassword(''); setError(''); },
    onError: (e) => { const m = e?.message || String(e); setError(m); notify(m, { type: 'error' }); },
  });

  const [search, setSearch] = useState('');
  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center text-gray-500">
          <Shield className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="font-medium">Admin access required</p>
          <p className="text-sm text-gray-400 mt-1">Only administrators can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-800">User Accounts</h3>
          <span className="text-xs text-gray-400 ml-1">{userList.length} users</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setError(''); setCreateOpen(true); }}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />New User
          </button>
        </div>
      </div>

      {/* Role legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="font-medium text-gray-600">Roles:</span>
        <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">Admin</span> — full access, settings, users</span>
        <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Staff</span> — create/edit jobs, inventory, purchasing</span>
        <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Overseas Staff</span> — read-only, no pricing</span>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users…"
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Username','Full Name','Email','Role','Active','2FA','Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && userList.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No users found.</td></tr>
            )}
            {userList.filter(u => {
              if (!search) return true;
              const q = search.toLowerCase();
              return (u.username || '').toLowerCase().includes(q)
                || (u.full_name || '').toLowerCase().includes(q)
                || (u.email || '').toLowerCase().includes(q)
                || (ROLE_LABELS[u.role] || '').toLowerCase().includes(q);
            }).map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${u.id === currentUser?.id ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-sm font-medium text-gray-800">
                  {u.username}
                  {u.id === currentUser?.id && <span className="ml-1 text-xs text-blue-500">(you)</span>}
                </td>
                <td className="px-4 py-3">{u.full_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700'}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.is_active
                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                </td>
                <td className="px-4 py-3">
                  {u.totp_enabled
                    ? <span className="flex items-center gap-1 text-green-700 text-xs"><Shield className="w-3.5 h-3.5" />On</span>
                    : <span className="text-gray-400 text-xs">Off</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditForm({ role: u.role, is_active: u.is_active, full_name: u.full_name, email: u.email }); setEditUser(u); setError(''); }}
                      className="p-1 hover:bg-blue-50 rounded text-blue-600" title="Edit"
                    ><Edit className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={() => { setResetUser(u); setNewPassword(''); setError(''); }}
                      className="p-1 hover:bg-amber-50 rounded text-amber-600" title="Reset password"
                    ><Key className="w-3.5 h-3.5" /></button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => setDeleteUser(u)}
                        className="p-1 hover:bg-red-50 rounded text-red-500" title="Delete"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create User Modal ── */}
      {createOpen && (
        <Modal title="Create New User" onClose={() => { setCreateOpen(false); setError(''); }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          <div className="space-y-3">
            {[
              { key: 'username', label: 'Username *', placeholder: 'e.g. jsmith' },
              { key: 'full_name', label: 'Full Name *', placeholder: 'e.g. John Smith' },
              { key: 'email', label: 'Email *', placeholder: 'jsmith@company.com', type: 'email' },
              { key: 'password', label: 'Password *', placeholder: 'Min 8 chars, 1 uppercase, 1 number', type: 'password' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
                <input
                  type={f.type || 'text'}
                  value={form[f.key]}
                  onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Role *</label>
              <select value={form.role} onChange={e => setForm(x => ({ ...x, role: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setCreateOpen(false); setError(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              onClick={() => createUser(form)}
              disabled={creating || !form.username || !form.email || !form.full_name || !form.password}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}Create User
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <Modal title={`Edit User — ${editUser.username}`} onClose={() => { setEditUser(null); setError(''); }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Full Name</label>
              <input type="text" value={editForm.full_name || ''} onChange={e => setEditForm(x => ({ ...x, full_name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
              <input type="email" value={editForm.email || ''} onChange={e => setEditForm(x => ({ ...x, email: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
              <select value={editForm.role || 'staff'} onChange={e => setEditForm(x => ({ ...x, role: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!editForm.is_active} onChange={e => setEditForm(x => ({ ...x, is_active: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              Account Active
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setEditUser(null); setError(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              onClick={() => updateUser({ id: editUser.id, data: editForm })}
              disabled={updating}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {updating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* ── Reset Password Modal ── */}
      {resetUser && (
        <Modal title={`Reset Password — ${resetUser.username}`} onClose={() => { setResetUser(null); setError(''); }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setResetUser(null); setError(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              onClick={() => resetPassword({ id: resetUser.id, password: newPassword })}
              disabled={resetting || newPassword.length < 8}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}Reset Password
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteUser && (
        <Modal title="Delete User" onClose={() => setDeleteUser(null)}>
          <div className="text-sm text-gray-700">
            <p>Are you sure you want to delete <strong>{deleteUser.username}</strong> ({deleteUser.full_name})?</p>
            <p className="text-gray-500 mt-1">This action cannot be undone.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDeleteUser(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              onClick={() => removeUser(deleteUser.id)}
              disabled={removing}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {removing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}Delete User
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
