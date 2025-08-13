import React from 'react';
export function Slider({ value, min=0, max=1, step=0.01, onValueChange }:{value:[number]|number[]; min?:number; max?:number; step?:number; onValueChange:(v:[number])=>void}){
  const v = Array.isArray(value)? value[0]: 0;
  return <input type='range' min={min} max={max} step={step} value={v} onChange={(e)=>onValueChange([Number(e.target.value)])} className='w-full'/>;
}
