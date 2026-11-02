import {Search,X} from 'lucide-react';
export function ManagementSearch({label,value,onChange,result,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;result?:string;disabled?:boolean}){
 return <div className="management-list-toolbar">{result&&<span className="management-search-result">{result}</span>}<label className="wb-search"><Search size={15}/><input aria-label={label} placeholder={`${label}…`} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/>{value&&<button className="wb-icon-button" aria-label={`清除${label.slice(2)}搜索`} onClick={()=>onChange('')}><X size={13}/></button>}</label></div>;
}
