import React from 'react';
export function Button({ children, onClick, className='' }:{children:React.ReactNode; onClick?:()=>void; className?:string}){
  return <button onClick={onClick} className={`px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 ${className}`}>{children}</button>
}
