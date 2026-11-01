import {useState} from 'react';
import {PageSwitcher} from './PageSwitcher';
export function Choice({label,options,value,onChange,name,disabled=false}:{label:string;options:{id:string;name:string}[];value?:string;onChange?:(id:string)=>void;name?:string;disabled?:boolean}){
 const [selected,setSelected]=useState('');const current=value??(options.some(o=>o.id===selected)?selected:options[0]?.id||'');
 return <div className="team-choice"><PageSwitcher label={label} pages={options.map(o=>({...o,count:0}))} value={current} disabled={disabled} onChange={id=>{setSelected(id);onChange?.(id);}}/>{name&&<input type="hidden" name={name} value={current}/>}</div>;
}
