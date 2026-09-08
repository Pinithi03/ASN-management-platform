/**
 * Suppliers — admin-only. Registered suppliers list.
 */

import { useState } from "react";
import { Search, CheckCircle2, XCircle } from "lucide-react";
import { mockSuppliers } from "@/data/mockData";
import { cn } from "@/utils/cn";

export default function Suppliers(){
  const [search,setSearch]=useState("");
  const filtered=mockSuppliers.filter(s=>{
    if(!search)return true;
    const q=search.toLowerCase();
    return s.name.toLowerCase().includes(q)||s.supplier_code.toLowerCase().includes(q)||s.email.toLowerCase().includes(q);
  });

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier Management</h1>
          <p className="mt-1 text-sm text-gray-500">{mockSuppliers.length} registered suppliers.</p>
        </div>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">+ Add Supplier</button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search suppliers…"
          className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"/>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(s=>(
          <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                <p className="mt-0.5 font-mono text-xs text-gray-500">{s.supplier_code}</p>
              </div>
              {s.is_active?<CheckCircle2 className="h-5 w-5 text-emerald-500"/>:<XCircle className="h-5 w-5 text-red-400"/>}
            </div>
            <div className="mt-3 space-y-1 text-xs text-gray-600">
              <p>Email: {s.email}</p>
              {s.contact_name&&<p>Contact: {s.contact_name}</p>}
              {s.country&&<p>Country: {s.country}</p>}
            </div>
            <p className="mt-3 text-xs text-gray-400">Registered: {new Date(s.created_at).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}