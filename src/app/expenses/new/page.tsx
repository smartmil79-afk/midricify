import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
import {ExpenseForm} from './ExpenseForm';
export default async function NewExpensePage(){const ctx=await getWorkspaceContext();const sb=await createClient();const org=ctx?.organization;let departments:any[]=[],budgets:any[]=[];
 if(org){const [d,b]=await Promise.all([sb.from('departments').select('id,name').eq('organization_id',org.id).eq('is_active',true).order('name'),sb.from('department_budgets').select('id,name,fiscal_year').eq('organization_id',org.id).eq('status','active').order('name')]);departments=d.data??[];budgets=b.data??[];}
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-3xl"><Link href="/expenses" className="text-sm text-blue-700">← Expenses</Link><h1 className="text-2xl font-bold mt-3">New expense request</h1><p className="text-slate-500 mt-1 mb-6">Record a non-asset operating expense, subscription or service.</p><ExpenseForm departments={departments} budgets={budgets} currency={org?.base_currency??'NGN'}/></div></main>
}
