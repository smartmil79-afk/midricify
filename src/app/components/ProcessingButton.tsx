'use client';
import {useFormStatus} from 'react-dom';
export function ProcessingButton({children,processing='Processing…',className=''}:{children:React.ReactNode;processing?:string;className?:string}){
 const {pending}=useFormStatus();
 return <button type="submit" disabled={pending} aria-busy={pending} className={className+' disabled:cursor-not-allowed disabled:opacity-60'}>{pending&&<span aria-hidden="true" className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-3px]"/>}{pending?processing:children}</button>;
}
