-- Phase 2.2: request detail, comments, attachments and drafts
alter table public.purchase_requests add column if not exists requester_notes text;
alter table public.purchase_requests add column if not exists is_draft boolean not null default false;
create table if not exists public.purchase_request_comments (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.purchase_requests(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 comment text not null check(length(trim(comment))>0),
 created_at timestamptz not null default now()
);
create table if not exists public.purchase_request_attachments (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.purchase_requests(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 uploaded_by uuid not null references public.profiles(id) on delete cascade,
 file_name text not null,
 storage_path text not null unique,
 mime_type text,
 file_size bigint,
 created_at timestamptz not null default now()
);
create index if not exists request_comments_timeline_idx on public.purchase_request_comments(request_id,created_at);
create index if not exists request_attachments_idx on public.purchase_request_attachments(request_id,created_at);
alter table public.purchase_request_comments enable row level security;
alter table public.purchase_request_attachments enable row level security;
create policy "members read request comments" on public.purchase_request_comments for select using(public.is_org_member(organization_id));
create policy "members add request comments" on public.purchase_request_comments for insert with check(public.is_org_member(organization_id) and author_id=auth.uid());
create policy "members read request attachments" on public.purchase_request_attachments for select using(public.is_org_member(organization_id));
create policy "members add request attachments" on public.purchase_request_attachments for insert with check(public.is_org_member(organization_id) and uploaded_by=auth.uid());
-- Storage bucket. Paths must be tenant/request scoped: org_id/request_id/file.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('midricify-request-files','midricify-request-files',false,10485760,
 array['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do nothing;
create policy "workspace members read request files" on storage.objects for select to authenticated
using(bucket_id='midricify-request-files' and exists(
 select 1 from public.organization_memberships m
 where m.user_id=auth.uid() and m.status='active' and m.organization_id=(split_part(name,'/',1))::uuid
));
create policy "workspace members upload request files" on storage.objects for insert to authenticated
with check(bucket_id='midricify-request-files' and exists(
 select 1 from public.organization_memberships m
 where m.user_id=auth.uid() and m.status='active' and m.organization_id=(split_part(name,'/',1))::uuid
));
create policy "uploader can delete request files" on storage.objects for delete to authenticated
using(bucket_id='midricify-request-files' and owner_id=auth.uid()::text);

create or replace function public.save_purchase_request_draft(
 p_request_id uuid default null,p_title text default '',p_justification text default '',
 p_department_id uuid default null,p_needed_by date default null,p_currency_code text default 'NGN',p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_org uuid;v_id uuid;v_counter bigint;v_num text;v_item jsonb;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 if length(trim(coalesce(p_title,'')))<3 or length(trim(coalesce(p_justification,'')))<5 then raise exception 'Title and justification are required';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'At least one item is required';end if;
 select organization_id into v_org from public.organization_memberships where user_id=v_user and status='active' order by created_at limit 1;
 if v_org is null then raise exception 'Workspace membership required';end if;
 if p_request_id is null then
  update public.organizations set request_counter=request_counter+1 where id=v_org returning request_counter into v_counter;
  v_num:='PR-'||to_char(now(),'YYYY')||'-'||lpad(v_counter::text,5,'0');
  insert into public.purchase_requests(organization_id,request_number,requester_id,department_id,title,justification,needed_by,currency_code,status,is_draft)
  values(v_org,v_num,v_user,p_department_id,trim(p_title),trim(p_justification),p_needed_by,upper(coalesce(nullif(p_currency_code,''),'NGN')),'draft',true) returning id into v_id;
 else
  select id into v_id from public.purchase_requests where id=p_request_id and organization_id=v_org and requester_id=v_user and status='draft' and is_draft for update;
  if v_id is null then raise exception 'Draft not found or you cannot edit it';end if;
  update public.purchase_requests set department_id=p_department_id,title=trim(p_title),justification=trim(p_justification),needed_by=p_needed_by,currency_code=upper(coalesce(nullif(p_currency_code,''),'NGN')),updated_at=now() where id=v_id;
  delete from public.purchase_request_items where request_id=v_id;
 end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  if length(trim(coalesce(v_item->>'description','')))<2 or coalesce((v_item->>'quantity')::numeric,0)<=0 or coalesce((v_item->>'estimated_unit_price')::numeric,0)<0 then raise exception 'Invalid item details';end if;
  insert into public.purchase_request_items(request_id,description,quantity,unit,estimated_unit_price) values(v_id,trim(v_item->>'description'),(v_item->>'quantity')::numeric,coalesce(nullif(v_item->>'unit',''),'unit'),(v_item->>'estimated_unit_price')::numeric);
 end loop;
 update public.purchase_requests set subtotal=(select coalesce(sum(line_total),0) from public.purchase_request_items where request_id=v_id),is_draft=true,status='draft' where id=v_id;
 return v_id;
end;$$;
revoke all on function public.save_purchase_request_draft(uuid,text,text,uuid,date,text,jsonb) from public;
grant execute on function public.save_purchase_request_draft(uuid,text,text,uuid,date,text,jsonb) to authenticated;

create or replace function public.submit_saved_purchase_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_req public.purchase_requests%rowtype;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 select * into v_req from public.purchase_requests where id=p_request_id and requester_id=v_user and status='draft' and is_draft for update;
 if not found then raise exception 'Draft not found';end if;
 if not exists(select 1 from public.purchase_request_items where request_id=p_request_id) then raise exception 'Add at least one item';end if;
 update public.purchase_requests set status='submitted',is_draft=false,submitted_at=now(),updated_at=now() where id=p_request_id;
 insert into public.purchase_request_approvals(request_id,organization_id,step_number,approver_role,status,department_id)
 values(p_request_id,v_req.organization_id,1,'department_head','pending',v_req.department_id);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_req.organization_id,v_user,'purchase_request.submitted','purchase_request',p_request_id::text,jsonb_build_object('request_number',v_req.request_number,'subtotal',v_req.subtotal));
 return p_request_id;
end;$$;
revoke all on function public.submit_saved_purchase_request(uuid) from public;
grant execute on function public.submit_saved_purchase_request(uuid) to authenticated;
