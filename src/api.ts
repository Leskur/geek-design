export async function api<T=any>(url:string,options:RequestInit={}):Promise<T>{
 const response=await fetch('/api'+url,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 if(!response.ok){let message=`请求失败（${response.status}）`;try{message=(await response.json()).error||message;}catch{}throw Object.assign(new Error(message),{status:response.status});}
 return response.json();
}
export const post=<T=any>(url:string,body:unknown={})=>api<T>(url,{method:'POST',body:JSON.stringify(body)});
