/**
 * Profile — supplier-only. Shows account info and registered plants.
 */

import { useAuthStore } from "@/store/authStore";
import { mockSuppliers, mockCompanies } from "@/data/mockData";

export default function Profile(){
  const user=useAuthStore(s=>s.user);
  const supplier=mockSuppliers.find(s=>s.id===user?.supplier_id);
  const company=mockCompanies.find(c=>c.id===user?.company_id);

  return(
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Your account and registered plants.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Account Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <F label="Full Name" value={user?.full_name||"—"}/>
          <F label="Email" value={user?.email||"—"}/>
          <F label="Role" value="Supplier"/>
          <F label="Last Login" value={user?.last_login_at?new Date(user.last_login_at).toLocaleString():"—"}/>
        </div>
      </div>

      {supplier&&(
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Supplier Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <F label="Company" value={supplier.name}/>
            <F label="Supplier Code" value={supplier.supplier_code}/>
            <F label="Contact" value={supplier.contact_name||"—"}/>
            <F label="Email" value={supplier.email}/>
            <F label="Country" value={supplier.country||"—"}/>
            <F label="Status" value={supplier.is_active?"Active":"Inactive"}/>
          </div>
        </div>
      )}

      {company&&(
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Primary Plant</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <F label="Plant Name" value={company.name}/>
            <F label="Plant Code" value={company.code}/>
          </div>
        </div>
      )}
    </div>
  );
}

function F({label,value}:{label:string;value:string}){
  return <div><label className="block text-xs font-medium text-gray-500">{label}</label><p className="mt-1 text-sm text-gray-900">{value}</p></div>;
}