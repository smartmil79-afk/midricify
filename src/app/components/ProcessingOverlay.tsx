"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";

export function ProcessingOverlay(){
 const [active,setActive]=useState(false);
 const pathname=usePathname();
 useEffect(()=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const start=()=>{
   if(timeout)return;
   setActive(true);
   timeout=setTimeout(()=>{setActive(false);timeout=undefined;},3000);
  };
  const onSubmit=(event:Event)=>{
   const form=event.target;
   if(form instanceof HTMLFormElement&&form.dataset.noProcessing!=="true")start();
  };
  const onClick=(event:MouseEvent)=>{
   const target=event.target;
   if(!(target instanceof Element))return;
   const button=target.closest("button");
   if(!button||button.disabled||button.dataset.processing!=="true")return;
   start();
  };
  document.addEventListener("submit",onSubmit,true);
  document.addEventListener("click",onClick,true);
  return()=>{
   document.removeEventListener("submit",onSubmit,true);
   document.removeEventListener("click",onClick,true);
   if(timeout)clearTimeout(timeout);
  };
 },[]);
 useEffect(()=>{setActive(false);},[pathname]);
 if(!active)return null;
 return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="status" aria-live="polite" aria-label="Processing your request">
  <div className="flex w-full max-w-xs flex-col items-center rounded-3xl bg-white px-8 py-9 text-center shadow-2xl">
   <div className="relative mb-5 h-14 w-14"><div className="absolute inset-0 rounded-full border-4 border-slate-200"/><div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"/></div>
   <div className="text-lg font-bold text-slate-900">Please wait</div>
   <p className="mt-2 text-sm leading-6 text-slate-500">Your action is being processed. Please do not close this page.</p>
  </div>
 </div>;
}
