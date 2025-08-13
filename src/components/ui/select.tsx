import React from 'react';
export function Select({value, onValueChange, children}:{value:string; onValueChange:(v:any)=>void; children:any}){ return <div>{React.Children.map(children,(c:any)=>React.cloneElement(c,{value, onValueChange}))}</div> }
export function SelectTrigger({children, className=''}:{children:any; className?:string}){ return <div className={`px-3 py-2 rounded-xl bg-white/5 border border-white/10 ${className}`}>{children}</div> }
export function SelectValue({placeholder}:{placeholder?:string}){ return <span>{placeholder}</span> }
export function SelectContent({children, className=''}:{children:any; className?:string}){ return <div className={`mt-2 space-y-1 ${className}`}>{children}</div> }
export function SelectItem({value, children, onValueChange}:{value:string; children:any; onValueChange?:(v:any)=>void}){ return <div className='px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 cursor-pointer' onClick={()=>onValueChange && onValueChange(value)}>{children}</div> }
