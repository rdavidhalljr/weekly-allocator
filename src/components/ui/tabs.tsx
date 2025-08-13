import React, {useState} from 'react';
export function Tabs({defaultValue, children}:{defaultValue:string; children:React.ReactNode}){
  const [val,setVal]=useState(defaultValue);
  return <div data-value={val}>{React.Children.map(children,(c:any)=>React.cloneElement(c,{value:val,setValue:setVal}))}</div>
}
export function TabsList({children, className=''}:{children:any; className?:string}){ return <div className={`flex gap-2 ${className}`}>{children}</div> }
export function TabsTrigger({children, value, setValue, className=''}:{children:any; value:string; setValue?:(v:string)=>void; className?:string}){
  return <button onClick={()=>setValue && setValue(children)} className={`px-3 py-1 rounded-xl bg-white/10`}>{children}</button>
}
export function TabsContent({children, value, setValue, className='', ...props}:{children:any; value:string; setValue?:(v:string)=>void; className?:string}){
  // naive render-all; real tabs would conditionally render
  return <div className={className}>{children}</div>
}
