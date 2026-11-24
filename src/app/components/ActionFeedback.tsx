"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
type Notice={title:string;detail:string;kind:"success"|"error"};
const messages:Record<string,Notice>={
 "request-submitted":{title:"Request submitted successfully",detail:"Your purchase request has been recorded and sent into the approval workflow.",kind:"success"},
 "draft-saved":{title:"Draft saved successfully",detail:"Your purchase request draft is saved and ready for editing or submission.",kind:"success"},
 "vendor-created":{title:"Supplier added successfully",detail:"The supplier is now available for purchase orders.",kind:"success"},
 "po-created":{title:"Purchase order created successfully",detail:"Your draft purchase order has been saved.",kind:"success"},
 "goods-received":{title:"Goods receipt recorded",detail:"The delivery has been recorded and is awaiting inspection.",kind:"success"},
 "invoice-created":{title:"Invoice created successfully",detail:"The supplier invoice has been recorded in Accounts Payable.",kind:"success"}
};
export function ActionFeedback(){const [notice,setNotice]=useState<Notice|null>(null);const pathname=usePathname();
 useEffect(()=>{const params=new URLSearchParams(window.location.search);const key=params.get("result");if(key&&messages[key]){setNotice(messages[key]);params.delete("result");const query=params.toString();window.history.replaceState({}, "", pathname+(query?"?"+query:"")+window.location.hash);}const onShow=(event:Event)=>setNotice((event as CustomEvent<Notice>).detail);window.addEventListener("midricify:feedback",onShow);return()=>window.removeEventListener("midricify:feedback",onShow);},[pathname]);
 if(!notice)return null;return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="action-feedback-title"><div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl"><div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${notice.kind==="success"?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}`}><span className="text-3xl">{notice.kind==="success"?"✓":"!"}</span></div><h2 id="action-feedback-title" className="text-xl font-bold text-slate-900">{notice.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{notice.detail}</p><button autoFocus onClick={()=>setNotice(null)} className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Continue</button></div></div>
}
export function showActionFeedback(title:string,detail:string,kind:"success"|"error"="success"){window.dispatchEvent(new CustomEvent("midricify:feedback",{detail:{title,detail,kind}}));}
