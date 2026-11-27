// ─── Administrative Users Management Hub ──────────────────────────────────
// frontend/src/pages/UserManagement.tsx

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  KeyRound,
  Edit2,
  Trash2,
  Mail,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { userApi, UserItem } from "@/services/userApi";
import { format } from "date-fns";
import PageHeader from "@/components/ui/PageHeader";

export default function UserManagement() {
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Modals state
  const [resetPassResult, setResetPassResult] = useState<{ email: string; pass: string } | null>(null);

  const { data: apiUsers = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => userApi.list(),
  });

  const users = apiUsers;

  // ─── Mutations ──────────────────────────────────────────────
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      userApi.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => userApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (usr: UserItem) => userApi.resetPassword(usr.id),
    onSuccess: (data, usr) => {
      setResetPassResult({
        email: usr.email,
        pass: data.temporary_password || "Password reset sent via email.",
      });
    },
  });

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (u.full_name || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q);

      const matchRole = roleFilter === "ALL" || u.role === roleFilter;

      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active).length;
    const superAdmins = users.filter((u) => u.role === "SUPER_ADMIN").length;
    return { total, active, superAdmins };
  }, [users]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Administrators" />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-brand-50 rounded-xl text-brand-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Administrators</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-gray-100 rounded-xl text-gray-700">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Accounts</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.active}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-gray-100 rounded-xl text-gray-700">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Super Administrators</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.superAdmins}</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search admin name or email..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            />
          </div>

          {/* Role Filter Dropdown */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none text-gray-900"
            >
              <option value="ALL">All Administrative Roles</option>
              <option value="SUPER_ADMIN">Super Administrators</option>
              <option value="ADMIN">System Administrators</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2 text-brand-600" />
            Loading administrators...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">No administrators found</p>
            <p className="text-xs text-gray-400 mt-1">Try clearing your search term or filter selection</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-xs">
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3.5">Administrator Name & Email</th>
                  <th className="px-6 py-3.5">System Role</th>
                  <th className="px-6 py-3.5">Account Status</th>
                  <th className="px-6 py-3.5">Last Login</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((usr) => {
                  const initial = usr.full_name?.charAt(0) || usr.email.charAt(0).toUpperCase();

                  return (
                    <tr key={usr.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Name & Email */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white shadow-xs shrink-0 bg-brand-600">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">
                              {usr.full_name || "Unnamed Administrator"}
                            </p>
                            <p className="text-xs text-gray-500 flex items-center gap-1 font-mono mt-0.5">
                              <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                              {usr.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* System Role */}
                      <td className="px-6 py-4">
                        {usr.role === "SUPER_ADMIN" ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Super Administrator
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            System Administrator
                          </span>
                        )}
                      </td>

                      {/* Status Toggle */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              id: usr.id,
                              is_active: !usr.is_active,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                            usr.is_active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                          }`}
                          title="Click to toggle user status"
                        >
                          {usr.is_active ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-red-600" />
                              Inactive
                            </>
                          )}
                        </button>
                      </td>

                      {/* Last Login */}
                      <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                        {usr.last_login_at
                          ? format(new Date(usr.last_login_at), "MMM d, HH:mm")
                          : "Never logged in"}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/users/${usr.id}/edit`}
                            target="_blank"
                            rel="noopener"
                            className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            title="Edit administrator (opens in a new tab)"
                            aria-label={`Edit ${usr.email}`}
                          >
                            <Edit2 className="w-4 h-4" aria-hidden="true" />
                          </a>
                          <button
                            onClick={() => resetPasswordMutation.mutate(usr)}
                            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Reset Credentials"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to remove administrator '${usr.email}'?`)) {
                                deleteUserMutation.mutate(usr.id);
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Administrator"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── RESET PASSWORD RESULT MODAL ───────────────────────── */}
      {resetPassResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Administrator Password Reset</h3>
              <p className="text-xs text-gray-500 mt-1">
                Temporary login password generated for <strong className="font-mono text-gray-900">{resetPassResult.email}</strong>.
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left font-mono text-xs text-amber-900 space-y-1">
              <p className="text-xs text-amber-600 uppercase font-semibold">Temporary Access Password:</p>
              <p className="text-sm font-bold tracking-wider">{resetPassResult.pass}</p>
            </div>

            <button
              onClick={() => setResetPassResult(null)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-gray-900 hover:bg-black rounded-lg transition-colors"
            >
              Done & Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}