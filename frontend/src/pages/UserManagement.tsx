// ─── Administrative Users Management Hub ──────────────────────────────────
// frontend/src/pages/UserManagement.tsx

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  KeyRound,
  Edit2,
  Trash2,
  X,
  Mail,
  AlertCircle,
  Factory,
  Crown,
  UserCheck,
} from "lucide-react";
import { userApi, UserItem, CreateUserPayload, UpdateUserPayload } from "@/services/userApi";
import { format } from "date-fns";

const PLANTS = [
  { code: "HQ", name: "Central HQ (All Plants)" },
  { code: "SIRIO", name: "Sirio Ltd — Badalgama" },
  { code: "BENJI", name: "Benji Ltd — Bingiriya" },
  { code: "OMEGA", name: "Omega Line Ltd — Sandalankawa" },
  { code: "ALPHA", name: "Alpha Apparels Ltd — Polgahawela" },
  { code: "VAVUNIYA", name: "Vavuniya Apparels — Vavuniya" },
];

export default function UserManagement() {
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [plantFilter, setPlantFilter] = useState<string>("ALL");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [resetPassResult, setResetPassResult] = useState<{ email: string; pass: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateUserPayload>({
    email: "",
    full_name: "",
    role: "COMPANY_ADMIN",
    plant_code: "SIRIO",
    is_active: true,
  });

  // ─── Queries ────────────────────────────────────────────────
  const { data: apiUsers = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: () => userApi.list(),
  });

  const users = apiUsers;

  // ─── Mutations ──────────────────────────────────────────────
  const createUserMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => userApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setActionError(err.message || "Failed to create administrator.");
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      userApi.update(id, payload),
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
      email: "",
      full_name: "",
      role: "COMPANY_ADMIN",
      plant_code: "SIRIO",
      is_active: true,
    });
    setActionError(null);
  };

  const handleOpenEdit = (user: UserItem) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name || "",
      role: user.role || "COMPANY_ADMIN",
      plant_code: user.plant_code || "SIRIO",
      is_active: user.is_active,
    });
    setActionError(null);
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (u.full_name || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.plant_name || "").toLowerCase().includes(q);

      const matchRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchPlant = plantFilter === "ALL" || u.plant_code === plantFilter;

      return matchSearch && matchRole && matchPlant;
    });
  }, [users, search, roleFilter, plantFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const superAdmins = users.filter((u) => u.role === "SUPER_ADMIN").length;
    const plantAdmins = users.filter((u) => u.role === "COMPANY_ADMIN").length;
    const operators = users.filter((u) => u.role === "OPERATOR" || u.role === "REVIEWER").length;
    return { total, superAdmins, plantAdmins, operators };
  }, [users]);

  return (
    <div className="p-6 space-y-6">
      {/* Top Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-brand-600" />
            Plant Administrators & System Users
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage administrative accounts, plant-level access, and super admin permissions across Oniverse manufacturing plants.
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
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 active:bg-brand-800 transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Administrator
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Super Admins (HQ)</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.superAdmins}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Plant Administrators</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.plantAdmins}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Operators & Reviewers</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.operators}</p>
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
              placeholder="Search admin name, email, or plant..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            />
          </div>

          {/* Role & Plant Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Plant selector */}
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-gray-400" />
              <select
                value={plantFilter}
                onChange={(e) => setPlantFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="ALL">All Manufacturing Plants</option>
                {PLANTS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Role filter */}
            <div className="flex bg-gray-100 p-1 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setRoleFilter("ALL")}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  roleFilter === "ALL" ? "bg-white text-brand-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All Roles
              </button>
              <button
                onClick={() => setRoleFilter("SUPER_ADMIN")}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  roleFilter === "SUPER_ADMIN" ? "bg-white text-purple-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Super Admin
              </button>
              <button
                onClick={() => setRoleFilter("COMPANY_ADMIN")}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  roleFilter === "COMPANY_ADMIN" ? "bg-white text-brand-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Plant Admin
              </button>
            </div>
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
                  <th className="px-6 py-3.5">Permission Role</th>
                  <th className="px-6 py-3.5">Assigned Oniverse Plant</th>
                  <th className="px-6 py-3.5">Account Status</th>
                  <th className="px-6 py-3.5">Last Login</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((usr) => {
                  const isSuper = usr.role === "SUPER_ADMIN";
                  const initial = usr.full_name?.charAt(0) || usr.email.charAt(0).toUpperCase();

                  return (
                    <tr key={usr.id} className="hover:bg-gray-50/80 transition-colors">
                      {/* Name & Email */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white shadow-xs shrink-0 ${
                              isSuper ? "bg-purple-600" : "bg-brand-600"
                            }`}
                          >
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

                      {/* Role Badge */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-extrabold rounded-full border shadow-xs ${
                            isSuper
                              ? "bg-purple-100 text-purple-900 border-purple-300"
                              : usr.role === "COMPANY_ADMIN"
                              ? "bg-brand-100 text-brand-800 border-brand-300"
                              : "bg-emerald-100 text-emerald-800 border-emerald-300"
                          }`}
                        >
                          {isSuper ? (
                            <>
                              <Crown className="w-3.5 h-3.5 text-purple-700" />
                              SUPER ADMIN
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                              {usr.role === "OPERATOR" ? "OPERATOR" : "PLANT ADMIN"}
                            </>
                          )}
                        </span>
                      </td>

                      {/* Assigned Plant */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Factory className="w-4 h-4 text-brand-600 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-gray-900 truncate">{usr.plant_name}</p>
                            <span className="text-[10px] font-mono text-gray-500">[{usr.plant_code}]</span>
                          </div>
                        </div>
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
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                              : "bg-red-50 text-red-700 border-red-300 hover:bg-red-100"
                          }`}
                          title="Click to toggle user status"
                        >
                          {usr.is_active ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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

      {/* ─── ADD ADMIN MODAL ────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
            <div className="p-5 bg-brand-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-brand-400" />
                <h3 className="text-base font-bold">Add Plant Administrator</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-brand-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUserMutation.mutate(formData);
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
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kasun Perera"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Corporate Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. admin@sirio.lk"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    System Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="COMPANY_ADMIN">Plant Administrator</option>
                    <option value="SUPER_ADMIN">Super Administrator (HQ)</option>
                    <option value="OPERATOR">Plant Operator</option>
                    <option value="REVIEWER">Audit Reviewer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Assigned Oniverse Plant <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.plant_code}
                    onChange={(e) => setFormData({ ...formData, plant_code: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    {PLANTS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm"
                >
                  {createUserMutation.isPending ? "Creating Administrator..." : "Create Administrator"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    plant_code: formData.plant_code,
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    System Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="COMPANY_ADMIN">Plant Administrator</option>
                    <option value="SUPER_ADMIN">Super Administrator (HQ)</option>
                    <option value="OPERATOR">Plant Operator</option>
                    <option value="REVIEWER">Audit Reviewer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Assigned Oniverse Plant
                  </label>
                  <select
                    value={formData.plant_code}
                    onChange={(e) => setFormData({ ...formData, plant_code: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    {PLANTS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
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