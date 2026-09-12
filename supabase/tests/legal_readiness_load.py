import subprocess,pathlib,time,json,concurrent.futures,statistics,os,sys
p=os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin').rstrip('/')+'/';args=['-h','127.0.0.1','-p','55432','-U','postgres'];root=pathlib.Path(__file__).resolve().parents[2];db='advocachat_f9_load'
# Run only against a disposable localhost clone with F9 installed. Pass --seed once.
# No production credentials, external providers, network load or real file bytes.
out=pathlib.Path('/tmp/advocachat-readiness-load');out.mkdir(exist_ok=True)
# Existing disposable load database has only rolled-back setup; reuse it.
s=(root/'supabase/tests/legal_specialized_operations.sql').read_text().split("insert into legal_test_ids(name) values('coverage')")[0]
s+='''reset role;
create table public.f9_load_ids as select * from legal_test_ids;
insert into public.legal_cases(tenant_id,owner_id,title,next_action)
select pg_temp.lid('tenant_a'),pg_temp.lid('owner'),'Synthetic load F9 '||n,'Review synthetic fixture' from generate_series(1,1000) n;
with docs as materialized (select gen_random_uuid() id,c.tenant_id,c.id case_id from public.legal_cases c cross join generate_series(1,10) n where c.title like 'Synthetic load F9%')
insert into public.legal_case_documents(id,tenant_id,case_id,category,display_name,file_name,mime_type,size_bytes,storage_path,status,uploaded_by,sha256,ready_at)
select c.id,c.tenant_id,c.case_id,'general','Synthetic load','synthetic.txt','text/plain',16,c.tenant_id||'/'||c.case_id||'/'||c.id,'ready',pg_temp.lid('owner'),repeat('0',64),now() from docs c;
insert into public.legal_operational_costs(tenant_id,case_id,kind,category,amount,currency,period_start,period_end,source,allocation_method,idempotency_key,payload_hash,created_by)
select c.tenant_id,c.id,'estimate','infrastructure',1,'BRL','2026-09-01','2026-09-12','Synthetic only','Synthetic fixture',gen_random_uuid(),'load',pg_temp.lid('owner') from public.legal_cases c cross join generate_series(1,3) n where c.title like 'Synthetic load F9%';
commit;
'''
if '--seed' in sys.argv:
 r=subprocess.run([p+'psql',*args,'-d',db,'-XqAt','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True);(out/'seed.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'See load-seed.log'
 
owner=subprocess.check_output([p+'psql',*args,'-d',db,'-XqAt','-c',"select id from f9_load_ids where name='owner'"],text=True).strip()
statement="begin;set local role authenticated;set local request.jwt.claim.sub='"+owner+"';select public.legal_readiness_metrics();rollback;"
def call(_):
 start=time.monotonic();r=subprocess.run([p+'psql',*args,'-d',db,'-XqAt','-v','ON_ERROR_STOP=1'],input=statement,text=True,capture_output=True,timeout=30);assert r.returncode==0;data=json.loads(r.stdout.strip());assert data['case_count']>=1000;assert data['cost_totals'][0]['amount']=='3000.00';return (time.monotonic()-start)*1000
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:timings=list(pool.map(call,range(20)))
result={'result':'PASS','database':db,'synthetic_cases':1000,'synthetic_file_metadata':10000,'cost_rows':3000,'concurrency':4,'requests':20,'p50_ms':round(statistics.median(timings),2),'p95_ms':round(sorted(timings)[18],2),'max_ms':round(max(timings),2),'scope':'Local PostgreSQL; includes psql startup. No external load or real documents.'};(out/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
