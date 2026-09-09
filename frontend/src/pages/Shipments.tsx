/**
 * Shipments — supplier-only. View and create shipments.
 */

import { useState } from "react";
import { Search, PackagePlus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { mockShipments } from "@/data/mockData";
import { cn } from "@/utils/cn";

const statusColor:Record<string,string>={
  DRAFT:"bg-gray-100 text-gray-600",PACKING:"bg-amber-100 text-amber-700",PACKED:"bg-blue-100 text-blue-700",
  XML_SENT:"bg-purple-100 text-purple-700",RECEIVED:"bg-blue-100 text-blue-700",ACCEPTED:"bg-emerald-100 text-emerald-700",
  REJECTED:"bg-red-100 text-red-700",DISPATCHED:"bg-emerald-100 text-emerald-700",DELIVERED:"bg-emerald-100 text-emerald-700",
};

export default function Shipments(){
  const user=useAuthStore(s=>s.user);
  const [search,setSearch]=useState("");
  const base=mockShipments.filter(s=>s.supplier_id===user?.supplier_id);
  const filtered=base.filter(s=>{
    if(!search)return true;
    return s.shipment_number.toLowerCase().includes(search.toLowerCase());
  });

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipments</h1>
          <p className="mt-1 text-sm text-gray-500">{base.length} shipments created by you.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          <PackagePlus className="h-4 w-4"/>New Shipment
        </button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search shipments…"
          className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"/>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Shipment #</th>
              <th className="px-5 py-3">Plant</th>
              <th className="px-5 py-3">Boxes</th>
              <th className="px-5 py-3">Pieces</th>
              <th className="px-5 py-3">Carrier</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Ship Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s=>(
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs font-medium text-gray-900">{s.shipment_number}</td>
                <td className="px-5 py-3 text-gray-700">{s.plant_code||"—"}</td>
                <td className="px-5 py-3 text-gray-700">{s.total_boxes}</td>
                <td className="px-5 py-3 text-gray-700">{s.total_pieces.toLocaleString()}</td>
                <td className="px-5 py-3 text-gray-700">{s.carrier||"—"}</td>
                <td className="px-5 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",statusColor[s.status]||"bg-gray-100 text-gray-600")}>{s.status.replace(/_/g," ")}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-gray-500">{s.ship_date?new Date(s.ship_date).toLocaleDateString():"—"}</td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No shipments found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}