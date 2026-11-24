import Link from 'next/link';
import { getWorkspaceContext } from '@/lib/workspace';
import RequestForm from './RequestForm';
export default async function NewRequestPage(){const ctx=await getWorkspaceContext();return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-3xl mx-auto"><Link href="/" className="text-sm text-blue-700">← Dashboard</Link><h1 className="text-2xl font-bold mt-4">New Purchase Request</h1><p className="text-slate-500 mt-1">Submit a purchase request for review in {ctx?.organization?.name??'your workspace'}.</p><div className="bg-white border rounded-2xl p-5 mt-6"><RequestForm departments={ctx?.departments??[]} currency={ctx?.organization?.base_currency??'NGN'}/></div></div></main>}
