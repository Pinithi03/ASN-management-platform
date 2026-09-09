/**
 * UserManagement — admin-only. List users, toggle active, show roles.
 */

import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { cn } from "@/utils/cn";

interface MockUser{id:string;name:string;email:string;role:"COMPANY_ADMIN"|"SUPPLIER";is_active:boolean;last_login:string;}

const users:MockUser[]=[
  {id:"u1",name:"Kasun Perera",email:"kasun@sirio.lk",role:"COMPANY_ADMIN",is_active:true,last_login:"2026-09-07"},
  {id:"u2",name:"Maria Santos",email:"maria@textcorp.com",role:"SUPPLIER",is_active:true,last_login:"2026-09-07"},
  {id:"u3",name:"Luca Rossi",email:"luca@stitchworks.com",role:"SUPPLIER",is_active:true,last_login:"2026-09-05"},
  {id:"u4",name:"Priya Sharma",email:"priya@fabricindia.in",role:"SUPPLIER",is_active:true,last_login:"2026-09-03"},
  {id:"u5",name:"Rahman Ali",email:"rahman@silktex.bd",role:"SUPPLIER",is_active:false,last_login:"2026-08-20"},
  {id:"u6",name:"Nimal Fernando",email:"nimal@sirio.lk",role:"COMPANY_ADMIN",is_active:true,last_login:"2026-09-06"},
];

export default function UserManagement(){
  const [search,setSearch]=useState("");
  const filtered=users.filter(u=>{
    if(!search)return true;
    const q=search.toLowerCase();
    return u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q);
  });

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">{users.length} registered users.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <UserPlus className="h-4 w-4"/>Add User
        </button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…"
          className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"/>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(u=>(
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-5 py-3 text-gray-600">{u.email}</td>
                <td className="px-5 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",u.role==="COMPANY_ADMIN"?"bg-brand-100 text-brand-700":"bg-emerald-100 text-emerald-700")}>
                    {u.role==="COMPANY_ADMIN"?"Admin":"Supplier"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",u.is_active?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700")}>
                    {u.is_active?"Active":"Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{u.last_login}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}