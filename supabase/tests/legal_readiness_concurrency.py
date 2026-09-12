"""Disposable localhost F9 load fixture only; proves import/cost idempotency under overlap."""
import concurrent.futures,json,os,pathlib,subprocess,uuid
pg=pathlib.Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))/'psql'
args=[str(pg),'-h','127.0.0.1','-p','55432','-U','postgres','-d','advocachat_f9_load','-XqAt','-v','ON_ERROR_STOP=1']
def sql(s):
 r=subprocess.run(args,input=s,text=True,capture_output=True,timeout=20)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
ids=json.loads(sql("select jsonb_object_agg(name,id) from f9_load_ids;"));owner=ids['owner'];case=ids['case']
def actor(s):return "begin;set local role authenticated;set local request.jwt.claim.sub='"+owner+"';"+s+'commit;'
def overlap(statement):
 # Hold the first transaction open after mutation while the second competes.
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  results=list(pool.map(sql,[actor(statement+'select pg_sleep(0.2);'),actor(statement)]))
 return [json.loads(r.splitlines()[0]) for r in results]
key=str(uuid.uuid4());rows='[{"title":"Synthetic concurrent F9","next_action":"Review synthetic fixture"}]'
preview=json.loads(sql(actor("select legal_preview_case_import('"+rows+"');")))
r=overlap("select legal_apply_case_import('"+rows+"','"+preview['preview_hash']+"','"+key+"');")
assert r[0]['case_ids']==r[1]['case_ids'] and sorted(x['already_applied'] for x in r)==[False,True]
case_id=r[0]['case_ids'][0]
key_cost=str(uuid.uuid4());payload=json.dumps({'kind':'estimate','category':'storage','amount':'1.25','currency':'BRL','period_start':'2026-09-01','period_end':'2026-09-12','source':'Synthetic concurrency test','allocation_method':'No actual cost','idempotency_key':key_cost})
r=overlap("select legal_record_operational_cost('"+case+"','"+payload+"');");assert r[0]['id']==r[1]['id']
assert sql("select count(*) from legal_operational_costs where idempotency_key='"+key_cost+"';")=='1'
# Remove only this script's local records; retain the reusable load fixture.
sql("begin;delete from legal_expansion_audit where metadata->>'cost_id'='"+r[0]['id']+"';delete from legal_operational_costs where idempotency_key='"+key_cost+"';delete from legal_case_import_batches where idempotency_key='"+key+"';delete from legal_case_events where case_id='"+case_id+"';delete from legal_cases where id='"+case_id+"';commit;")
print('PASS: concurrent identical imports create one case; concurrent identical costs create one cost.')
