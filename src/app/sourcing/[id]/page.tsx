import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
import RfqDetail from './RfqDetail';
export default async function RfqDetailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const ctx=await getWorkspaceContext();if(!ctx?.organization)notFound();const sb=await createClient();
 const [{data:rfq},{data:items},{data:invites},{data:quotes}]=await Promise.all([
  sb.from('rfqs').select('*').eq('id',id).eq('organization_id',ctx.organization.id).maybeSingle(),
  sb.from('rfq_items').select('id,description,quantity,unit,specifications').eq('rfq_id',id).order('created_at'),
  sb.from('rfq_vendors').select('vendor_id,vendors(id,name)').eq('rfq_id',id),
  sb.from('vendor_quotations').select('id,vendor_id,quotation_number,currency_code,exchange_rate_to_base,delivery_days,payment_terms,discount_amount,tax_amount,freight_cost,insurance_cost,customs_duty,clearing_cost,handling_cost,other_charges,status,quality_score,vendor_quotation_items(rfq_item_id,quantity,unit_price,specification_compliant),vendors(name)').eq('rfq_id',id).eq('organization_id',ctx.organization.id)
 ]);
 if(!rfq)notFound();
 const vendors=(invites??[]).map((x:any)=>({id:x.vendor_id,name:Array.isArray(x.vendors)?x.vendors[0]?.name:x.vendors?.name??'Vendor'}));
 return <RfqDetail rfq={rfq} items={items??[]} vendors={vendors} quotes={(quotes??[]) as any} baseCurrency={ctx.organization.base_currency??'NGN'}/>;
}
