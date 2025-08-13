import React from 'react';
export function Input({ value, onChange, placeholder, className='' }:{value:string; onChange:(e:any)=>void; placeholder?:string; className?:string}){
  return <input value={value} onChange={onChange} placeholder={placeholder} className={`w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 outline-none ${className}`} />;
}
