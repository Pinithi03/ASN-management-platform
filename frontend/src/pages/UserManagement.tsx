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
  X,
  Mail,
  AlertCircle,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { userApi, UserItem, UpdateUserPayload } from "@/services/userApi";
import { format } from "date-fns";

export default function UserManagement() {
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Modals state
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [resetPassResult, setResetPassResult] = useState<{ email: string; pass: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state for editing
  const [formData, setFormData] = useState<UpdateUserPayload>({
    full_name: "",
    role: "ADMIN",
    plant_code: "HQ",
    is_active: true,
  });

  // ─── Queries ────────────────────────────────────────────────
  const { data: apiUsers = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: () => userApi.list(),
  });

  const users = apiUsers;

  // ─── Mutations ──────────────────────────────────────────────
  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      userApi.update(id, { ...payload, plant_code: "HQ" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
      resetForm();
    },
    onError: (err: Error) => {
      setActionError(err.message || "Failed to update administrator.");
    },
  });

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

  const resetForm = () => {
    setFormData({
      full_name: "",
      role: "ADMIN",
      plant_code: "HQ",
      is_active: true,
    });
    setActionError(null);
  };

  const handleOpenEdit = (user: UserItem) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || "",
      role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
      plant_code: "HQ",
      is_active: user.is_active,
    });
    setActionError(null);
  };

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
    <div className="p-6 space-y-6">
      {/* Top Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-brand-600" />
            System Administrators & Roles
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Directory of platform administrators provisioned via Keycloak Identity Provider.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2.5 text-gray-500 hover:text-brand-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            title="Refresh Administrators"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-brand-600" : ""}`} />
          </button>
        </div>
      </div>

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
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
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-black border border-gray-200">
                            Super Administrator
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-black border border-gray-200">
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
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                            usr.is_active
                              ? "bg-gray-100 text-black border-gray-300 hover:bg-gray-200"
                              : "bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                          }`}
                          title="Click to toggle user status"
                        >
                          {usr.is_active ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                              ACTIVE
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-red-600" />
                              INACTIVE
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
                          <button
                            onClick={() => handleOpenEdit(usr)}
                            className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit Administrator Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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

      {/* ─── EDIT ADMIN MODAL ────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
            <div className="p-5 bg-brand-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-brand-400" />
                <h3 className="text-base font-bold">Edit Administrator Profile ({editingUser.email})</h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-brand-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateUserMutation.mutate({
                  id: editingUser.id,
                  payload: {
                    full_name: formData.full_name,
                    role: formData.role,
                    plant_code: "HQ",
                    is_active: formData.is_active,
                  },
                });
              }}
              className="p-6 space-y-4"
            >
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  System Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="SUPER_ADMIN">Super Administrator (Full System & Organization Control)</option>
                  <option value="ADMIN">System Administrator (Operations & ASN Management)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Administrators operate centrally across all Oniverse manufacturing facilities and headquarters.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm"
                >
                  {updateUserMutation.isPending ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              <p className="text-[10px] text-amber-600 uppercase font-semibold">Temporary Access Password:</p>
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