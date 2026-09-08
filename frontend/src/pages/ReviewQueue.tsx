/**
 * ReviewQueue — admin-only. Shows emails and ASNs pending review.
 */

import { mockEmails, mockASNs, mockSuppliers, mockShipments } from "@/data/mockData";
import { cn } from "@/utils/cn";

const statusColor:Record<string,string>={REVIEW:"bg-amber-100 text-amber-700",SUBMITTED:"bg-amber-100 text-amber-700",DRAFT:"bg-gray-100 text-gray-600",QUEUED:"bg-blue-100 text-blue-700"};

export default function ReviewQueue(){
  const pendingEmails=mockEmails.filter(e=>e.status==="REVIEW"||e.status==="QUEUED");
  const pendingASNs=mockASNs.filter(a=>a.status==="SUBMITTED"||a.status==="DRAFT");

  return(
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-500">{pendingEmails.length+pendingASNs.length} items need your attention.</p>
      </div>

      <Section title={`Emails Pending Review (${pendingEmails.length})`}>
        {pendingEmails.map(e=>(
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-5 py-3 hover:bg-gray-50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{e.subject||"No subject"}</p>
              <p className="text-xs text-gray-500">From: {e.from_address} · {e.received_at?new Date(e.received_at).toLocaleDateString():"—"}</p>
            </div>
            <span className={cn("ml-4 rounded-full px-2 py-0.5 text-xs font-medium",statusColor[e.status]||"bg-gray-100 text-gray-600")}>{e.status}</span>
          </div>
        ))}
        {pendingEmails.length===0&&<p className="py-4 text-center text-sm text-gray-400">No emails pending review.</p>}
      </Section>

      <Section title={`ASNs Pending Review (${pendingASNs.length})`}>
        {pendingASNs.map(a=>{
          const sup=mockSuppliers.find(s=>s.id===a.supplier_id);
          const shp=mockShipments.find(s=>s.id===a.shipment_id);
          return(
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-5 py-3 hover:bg-gray-50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{a.asn_number}</p>
                <p className="text-xs text-gray-500">{sup?.name||a.supplier_id} · Shipment {shp?.shipment_number||a.shipment_id}</p>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",statusColor[a.status]||"bg-gray-100 text-gray-600")}>{a.status}</span>
                {a.status==="SUBMITTED"&&(
                  <>
                    <button className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">Accept</button>
                    <button className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">Reject</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {pendingASNs.length===0&&<p className="py-4 text-center text-sm text-gray-400">No ASNs pending review.</p>}
      </Section>
    </div>
  );
}

function Section({title,children}:{title:string;children:React.ReactNode}){
  return(
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}