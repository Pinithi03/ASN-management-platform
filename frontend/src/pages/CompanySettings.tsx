/**
 * CompanySettings — admin-only. Shows plant/company config.
 */

import { useAuthStore } from "@/store/authStore";
import { mockCompanies } from "@/data/mockData";

export default function CompanySettings(){
  const user=useAuthStore(s=>s.user);
  const company=mockCompanies.find(c=>c.id===user?.company_id)||mockCompanies[0];

  return(
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your plant configuration and email settings.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Plant Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company Name" value={company.name}/>
          <Field label="Company Code" value={company.code}/>
          <Field label="Status" value={company.is_active?"Active":"Inactive"}/>
          <Field label="Created" value={new Date(company.created_at).toLocaleDateString()}/>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Email Configuration (IMAP)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="IMAP Host" value="imap.sirio.lk"/>
          <Field label="IMAP Port" value="993"/>
          <Field label="Username" value="purchasing@sirio.lk"/>
          <Field label="Encryption" value="TLS"/>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Email Configuration (SMTP)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="SMTP Host" value="smtp.sirio.lk"/>
          <Field label="SMTP Port" value="587"/>
          <Field label="From Address" value="noreply@sirio.lk"/>
          <Field label="Encryption" value="STARTTLS"/>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Save Changes</button>
      </div>
    </div>
  );
}

function Field({label,value}:{label:string;value:string}){
  return(
    <div>
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      <input readOnly value={value} className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"/>
    </div>
  );
}