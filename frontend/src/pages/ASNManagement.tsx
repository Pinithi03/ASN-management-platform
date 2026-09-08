/**
 * ASNManagement — shared page. Admin reviews ASNs; Supplier creates/tracks them.
 */

import { useState } from "react";
import { Search, CheckCircle2, XCircle, Clock, AlertTriangle, FileCode } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { mockASNs, mockSuppliers, mockShipments } from "@/data/mockData";
import { cn } from "@/utils/cn";
import type { ASNRecord } from "@/types";

const STATUS_OPTIONS = ["ALL","DRAFT","VALIDATED","XML_SENT","SUBMITTED","RECEIVED","ACCEPTED","REJECTED","FAILED","COMPLETED","CANCELLED"] as const;

const statusColor: Record<string,string> = {
  DRAFT:"bg-gray-100 text-gray-600", VALIDATED:"bg-blue-100 text-blue-700", XML_SENT:"bg-purple-100 text-purple-700",
  SUBMITTED:"bg-amber-100 text-amber-700", RECEIVED:"bg-blue-100 text-blue-700", ACCEPTED:"bg-emerald-100 text-emerald-700",
  REJECTED:"bg-red-100 text-red-700", FAILED:"bg-red-100 text-red-700", COMPLETED:"bg-emerald-100 text-emerald-700",
  CANCELLED:"bg-gray-100 text-gray-500",
};

const statusIcon: Record<string, React.ComponentType<{className?:string}>> = {
  ACCEPTED: CheckCircle2, COMPLETED: CheckCircle2, REJECTED: XCircle, FAILED: AlertTriangle,
  DRAFT: Clock, VALIDATED: Clock, SUBMITTED: Clock, XML_SENT: FileCode,
};

function supplierName(id:string){const s=mockSuppliers.find(x=>x.id===id);return s?s.name:id;}
function shipmentNum(id:string){const s=mockShipments.find(x=>x.id===id);return s?s.shipment_number:id;}

export default function ASNManagement(){
  const user=useAuthStore(s=>s.user);
  const isAdmin=user?.role==="COMPANY_ADMIN";
  const [search,setSearch]=useState("");
  const [sf,setSf]=useState<string>("ALL");
  const [sel,setSel]=useState<ASNRecord|null>(null);

  const base=isAdmin?mockASNs:mockASNs.filter(a=>a.supplier_id===user?.supplier_id);
  const filtered=base.filter(a=>{
    if(sf!=="ALL"&&a.status!==sf)return false;
    if(search){const q=search.toLowerCase();return a.asn_number.toLowerCase().includes(q)||supplierName(a.supplier_id).toLowerCase().includes(q);}
    return true;
  });

  return(
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isAdmin?"ASN Review":"ASN Management"}</h1>
        <p className="mt-1 text-sm text-gray-500">{isAdmin?`${base.length} advance ship notices to review.`:`${base.length} ASNs created by you.`}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ASN number…"
            className={cn("h-9 w-64 rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:outline-none focus:ring-1",isAdmin?"focus:border-brand-500 focus:ring-brand-500":"focus:border-emerald-500 focus:ring-emerald-500")}/>
        </div>
        <select value={sf} onChange={e=>setSf(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none">
          {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s==="ALL"?"All Statuses":s.replace(/_/g," ")}</option>)}
        </select>
        {!isAdmin&&<button className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">+ New ASN</button>}
      </div>

      <div className="flex gap-4">
        <div className={cn("rounded-xl border border-gray-200 bg-white",sel?"flex-1":"w-full")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">ASN #</th>
                  <th className="px-4 py-3">Shipment</th>
                  {isAdmin&&<th className="px-4 py-3">Supplier</th>}
                  <th className="px-4 py-3">XML Valid</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(a=>{
                  const SIcon=statusIcon[a.status]||Clock;
                  return(
                  <tr key={a.id} onClick={()=>setSel(a)} className={cn("cursor-pointer hover:bg-gray-50",sel?.id===a.id&&"bg-brand-50")}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-gray-900">{a.asn_number}</td>
                    <td className="px-4 py-3 text-gray-700">{shipmentNum(a.shipment_id)}</td>
                    {isAdmin&&<td className="px-4 py-3 text-gray-700">{supplierName(a.supplier_id)}</td>}
                    <td className="px-4 py-3">{a.xml_validated?<CheckCircle2 className="h-4 w-4 text-emerald-500"/>:<XCircle className="h-4 w-4 text-red-400"/>}</td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",statusColor[a.status])}>{a.status.replace(/_/g," ")}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>);
                })}
                {filtered.length===0&&<tr><td colSpan={isAdmin?6:5} className="px-4 py-8 text-center text-gray-400">No ASNs found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {sel&&(
          <div className="w-96 shrink-0 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">ASN Detail</h3>
              <button onClick={()=>setSel(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <D label="ASN Number" value={sel.asn_number}/>
              <D label="Shipment" value={shipmentNum(sel.shipment_id)}/>
              <D label="Supplier" value={supplierName(sel.supplier_id)}/>
              <D label="XML Validated" value={sel.xml_validated?"Yes":"No"}/>
              <D label="Status" value={sel.status.replace(/_/g," ")}/>
              {sel.sent_at&&<D label="Sent At" value={new Date(sel.sent_at).toLocaleString()}/>}
              {sel.accepted_at&&<D label="Accepted At" value={new Date(sel.accepted_at).toLocaleString()}/>}
              {sel.rejection_reason&&(
                <div className="rounded-lg bg-red-50 px-3 py-2">
                  <p className="text-xs font-medium text-red-600">Rejection / Error</p>
                  <p className="text-xs text-red-500">{sel.rejection_reason}</p>
                </div>
              )}
              {isAdmin&&sel.status==="SUBMITTED"&&(
                <div className="flex gap-2 pt-2">
                  <button className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700">Accept</button>
                  <button className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700">Reject</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function D({label,value}:{label:string;value:string}){
  return <div><p className="text-xs font-medium text-gray-400">{label}</p><p className="text-sm text-gray-900">{value}</p></div>;
}