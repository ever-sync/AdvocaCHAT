#!/usr/bin/env python3
"""Local disposable PostgreSQL race regression; no provider requests or production mutations.
The baseline must contain F1-F8 schema and no customer data. Clones and logs are retained.
"""
import argparse,csv,json,subprocess,time,uuid,hashlib,os,re
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin',default=os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
parser.add_argument('--port',type=int,default=55432)
parser.add_argument('--baseline',default='advocachat_f8_verified')
parser.add_argument('--tmp-dir',default='/tmp/advocachat-f8-races')
parser.add_argument('--prefix',default='advocachat_f8_race_'+uuid.uuid4().hex[:8])
args=parser.parse_args()
assert re.fullmatch(r'[a-z][a-z0-9_]{0,45}',args.baseline) and re.fullmatch(r'[a-z][a-z0-9_]{0,45}',args.prefix), 'Local fixture database names only'
assert 1024<=args.port<=65535, 'Explicit local test port required'
PG=str(Path(args.pg_bin))+'/'
ROOT=Path(args.tmp_dir);ROOT.mkdir(parents=True,exist_ok=True)
os.chdir(Path(__file__).resolve().parents[2])
reports=[]
class Fixture:
 def __init__(self,suffix,test=None,marker=None,seed=None):
  self.name=args.prefix+'_'+suffix
  subprocess.run([PG+'createdb','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-T',seed.name if seed else args.baseline,self.name],check=True)
  self.base=[PG+'psql','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',self.name,'-v','ON_ERROR_STOP=1','-X','-At']
  if seed:
   self.ids=dict(seed.ids);return
  s=Path('supabase/tests/'+test+'.sql').read_text().split(marker)[0]; csvpath=ROOT/('f8-'+suffix+'-ids.csv');sqlpath=ROOT/('f8-'+suffix+'-fixture.sql')
  s+=f"\n\\copy (select name,id from legal_test_ids) to '{csvpath}' csv header\nCOMMIT;\n";sqlpath.write_text(s)
  r=subprocess.run(self.base+['-f',str(sqlpath)],capture_output=True,text=True);(ROOT/('f8-'+suffix+'-fixture.log')).write_text(r.stdout+r.stderr);assert r.returncode==0,r.stderr[-3000:]
  self.ids={r['name']:r['id'] for r in csv.DictReader(csvpath.open())}
 def auth(self,who='owner',role='authenticated'):
  uid=self.ids[who];claims=json.dumps({'sub':uid,'role':role});return f"set local role {role};select set_config('request.jwt.claim.sub','{uid}',true);select set_config('request.jwt.claim.role','{role}',true);select set_config('request.jwt.claims','{claims}',true);"
 def run(self,sql):
  r=subprocess.run(self.base+['-c',sql],capture_output=True,text=True);assert r.returncode==0,r.stderr;return r.stdout
 def call(self,sql,who='owner',role='authenticated'):
  out=self.run('begin;'+self.auth(who,role)+sql+'commit;')
  return [json.loads(x) for x in out.splitlines() if x.startswith('{') or x.startswith('[')][-1]
 def race(self,a_sql,b_sql,label,lock=None,arole='authenticated',brole='service_role',awho='owner',bwho='owner',expect_wait=True):
  lock=lock or f"select id from public.legal_cases where id='{self.ids['case']}' for update;"
  a=subprocess.Popen(self.base+['-c',f"begin;set local application_name='f8_a';{lock}{self.auth(awho,arole)}select pg_sleep(1.1);{a_sql}commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  time.sleep(.15)
  b=subprocess.Popen(self.base+['-c',f"begin;set local application_name='f8_b';{self.auth(bwho,brole)}{b_sql}commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  observed=False
  for _ in range(15):
   if self.run("select count(*) from pg_stat_activity where application_name='f8_b' and wait_event_type='Lock'").strip()=='1':observed=True;break
   if b.poll() is not None:break
   time.sleep(.025)
  ao,ae=a.communicate(timeout=15);bo,be=b.communicate(timeout=15)
  record={'label':label,'wait_observed':observed,'a_exit':a.returncode,'b_exit':b.returncode,'a_stdout':ao,'a_stderr':ae,'b_stdout':bo,'b_stderr':be};(ROOT/('f8-race-'+label+'.log')).write_text(json.dumps(record,indent=2));assert a.returncode==0,ae
  if expect_wait:assert observed,'No demonstrated lock wait: '+label
  return b.returncode,bo,be

def passed(label):reports.append(label);print("PASS:",label,flush=True)
def q(value):return "'"+json.dumps(value,ensure_ascii=False).replace("'","''")+"'"
def extract(out):return [json.loads(x) for x in out.splitlines() if x.startswith("{") or x.startswith("[")][-1]
seed=Fixture('fixture','legal_specialized_operations','-- F8_EXPANSION_CONCURRENCY_FIXTURE_READY')
def new(label):return Fixture(label,seed=seed)
def row(f,table,id):return json.loads(f.run(f"select to_jsonb(x) from public.{table} x where id='{id}'").strip())
def payload_from(row,keys):return {k:row[k] for k in keys if k in row}
def upload_sql(f,key=None):
 payload={'category':'medical','file_name':'synthetic-race.pdf','mime_type':'application/pdf','size_bytes':10,'description':'Synthetic external concurrency delivery','idempotency_key':key or str(uuid.uuid4())}
 return f"select public.legal_diligence_service_prepare_upload('{f.ids['external']}','{f.ids['diligence_grant']}',{q(payload)});"
def document(f,case,sha=None):
 d=f.call(f"select to_jsonb(public.legal_prepare_document('{case}','general','Synthetic receipt source','source.pdf','application/pdf',10));")
 f.run(f"insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents','{d['storage_path']}','{{\"size\":10}}')")
 f.call(f"select to_jsonb(public.legal_finalize_document('{d['id']}','{sha or hashlib.sha256(d['id'].encode()).hexdigest()}'));",role='service_role');return d

def act(f,case,key,doc=None):
 base=row(f,'legal_external_act_versions',f.ids['act'])
 p=payload_from(base,['category','title','act_kind','coverage_version_id','recipient','channel','final_document_id','signature_evidence_document_id','source_document_ids','purpose','authority_basis','checks'])
 p['act_key']=key
 if doc:p.update({'category':'general','final_document_id':doc['id'],'signature_evidence_document_id':doc['id'],'source_document_ids':[doc['id']]})
 else:p.update({'representation_id':f.ids['representation'],'succession_authority_id':f.ids['authority']})
 v=f.call(f"select public.legal_external_act_create_version('{case}',{q(p)});")
 f.call(f"select public.legal_external_act_submit('{v['id']}');")
 f.call(f"select public.legal_external_act_review('{v['id']}','ready','Synthetic independently reviewed manual preparation');")
 return v

f=new('revoked_read');ids=f.ids
rc,out,err=f.race(f"select public.legal_diligence_revoke_invite('{ids['diligence_invite']}','Synthetic concurrent revocation');",f"select public.legal_diligence_service_read('{ids['external']}','{ids['diligence_grant']}');",'diligence-read-after-revocation')
assert rc!=0 and 'Current individual diligence grant required' in err,err+out
passed('external read waiting for case cannot survive individual grant revocation')

f=new('revoked_finish');ids=f.ids
u=f.call(upload_sql(f),role='service_role');d=u['document']
f.run(f"insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents','{d['storage_path']}','{{\"size\":10}}')")
rc,out,err=f.race(f"select public.legal_diligence_revoke_invite('{ids['diligence_invite']}','Synthetic revoke during bytes processing');",f"select public.legal_diligence_service_finalize_upload('{ids['external']}','{u['delivery_id']}','{'a'*64}');",'diligence-finish-after-revocation')
assert rc!=0 and 'Current individual diligence grant required' in err,err+out
assert f.run(f"select status from public.legal_case_documents where id='{d['id']}'").strip()=='prepared'
assert f.call(f"select public.legal_diligence_service_abandon_upload('{ids['external']}','{u['delivery_id']}');",role='service_role')['cleanup_allowed'] is True
passed('revoked upload cannot finalize; its own prepared bytes may be safely abandoned')

f=new('expiry');ids=f.ids
f.run(f"update public.legal_diligence_grants set expires_at=clock_timestamp()+interval '0.8 seconds' where id='{ids['diligence_grant']}'")
rc,out,err=f.race('select 1;',f"select public.legal_diligence_service_download('{ids['external']}','{ids['diligence_grant']}','{ids['general']}');",'diligence-expires-during-case-wait')
assert rc!=0 and 'Current individual diligence grant required' in err,err+out
passed('individual expiration uses the clock after a demonstrated lock wait')

f=new('new_version');ids=f.ids
v=row(f,'legal_diligence_versions',ids['diligence']);p=payload_from(v,['diligence_key','category','title','instructions','supervisor_id','substitute_id','due_at','expires_at','source_document_ids']);p['previous_version_id']=v['id'];p['instructions']='New synthetic instructions require a fresh grant review.'
rc,out,err=f.race(f"select public.legal_diligence_create_version('{ids['case']}',{q(p)});",f"select public.legal_diligence_service_read('{ids['external']}','{ids['diligence_grant']}');",'diligence-new-instructions-during-read')
assert rc!=0 and 'Current individual diligence grant required' in err,err+out
passed('new instruction version invalidates old external access without silently expanding the grant')

f=new('staff_acl');ids=f.ids
rc,out,err=f.race(f"select public.legal_set_case_member('{ids['case']}','{ids['member']}',true,true,false);",f"select public.legal_diligence_staff_download('{ids['member']}','{ids['diligence']}','{ids['diligence_upload']}');",'restricted-staff-download-after-fiscal-revocation')
assert rc!=0 and ('category' in err.lower() or 'access' in err.lower()),err+out
passed('medical staff loses restricted delivery access after the fiscal half of ACL is revoked')

f=new('upload_quota');ids=f.ids
for _ in range(3):f.call(upload_sql(f),role='service_role')
rc,out,err=f.race(upload_sql(f),upload_sql(f),'diligence-five-file-concurrent-limit',arole='service_role')
assert rc!=0 and ('limit' in err.lower() or 'quota' in err.lower()),err+out
assert f.run(f"select count(*) from public.legal_diligence_deliveries where version_id='{ids['diligence']}' and state<>'abandoned'").strip()=='5'
passed('concurrent upload reservations cannot exceed the five-file diligence quota')

f=new('package_once');ids=f.ids
base=row(f,'legal_specialty_package_versions',ids['package']);p=payload_from(base,['package_key','title','specialty','purpose','scope','source_url','checked_on','validity_note','limitations','body']);p['package_key']='synthetic-concurrent-install'
v=f.call(f"select public.legal_specialty_create_version({q(p)});");f.call(f"select public.legal_specialty_review('{v['id']}','reviewed','Synthetic organizational review');")
preview=f.call(f"select public.legal_specialty_preview('{ids['case']}','{v['id']}');");key=str(uuid.uuid4())
install=f"select public.legal_specialty_apply('{ids['case']}','{v['id']}','{preview['preview_hash']}','{key}');"
rc,out,err=f.race(install,install,'package-concurrent-idempotent-install',brole='authenticated')
assert rc==0 and extract(out)['already_applied'] is True,err+out
assert f.run(f"select count(*) from public.legal_specialty_installations where case_id='{ids['case']}' and package_version_id='{v['id']}'").strip()=='1'
passed('same package preview and retry key create exactly one installation')

f=new('package_revoke');ids=f.ids
v=f.call(f"select public.legal_specialty_create_version({q(p)});");f.call(f"select public.legal_specialty_review('{v['id']}','reviewed','Synthetic organizational review');")
preview=f.call(f"select public.legal_specialty_preview('{ids['case']}','{v['id']}');")
rc,out,err=f.race(f"select public.legal_specialty_review('{v['id']}','revoked','Synthetic catalog revocation while installation waits');",f"select public.legal_specialty_apply('{ids['case']}','{v['id']}','{preview['preview_hash']}','{uuid.uuid4()}');",'package-revoked-during-install',lock=f"select pg_advisory_xact_lock(hashtextextended('legal_expansion_catalog:'||'{ids['tenant_a']}',0));",brole='authenticated')
assert rc!=0 and 'current complete package preview' in err,err+out
assert f.run(f"select count(*) from public.legal_specialty_installations where package_version_id='{v['id']}'").strip()=='0'
passed('catalog revocation invalidates preview after case-to-catalog wait without partial installation')

f=new('authority');ids=f.ids
v=act(f,ids['case'],'synthetic-new-operation')
rc,out,err=f.race(f"select public.legal_revoke_representation('{ids['representation']}','Synthetic revocation during preparation');",f"select public.legal_external_act_prepare_attempt('{v['id']}','{uuid.uuid4()}','Synthetic external handling proposal');",'act-representation-revoked-during-prepare',brole='authenticated')
assert rc!=0 and 'Current reviewed manual act preparation required' in err,err+out
assert f.run(f"select count(*) from public.legal_external_act_attempts where version_id='{v['id']}'").strip()=='0'
passed('revoked successor representation cannot authorize a new attempt after the case lock wait')

f=new('receipt_reference');ids=f.ids
d1=document(f,ids['case']);d2=document(f,ids['case2']);v1=act(f,ids['case'],'receipt-a');v2=act(f,ids['case2'],'receipt-b',d2)
a1=f.call(f"select public.legal_external_act_prepare_attempt('{v1['id']}','{uuid.uuid4()}','Synthetic external act A');");a2=f.call(f"select public.legal_external_act_prepare_attempt('{v2['id']}','{uuid.uuid4()}','Synthetic external act B');")
ref='SYNTHETIC-RACE-SAME-REFERENCE'
def receipt_sql(attempt,doc,ref):
 p={'document_id':doc['id'],'external_reference':ref,'recipient':'Synthetic recipient','channel':'Synthetic channel','occurred_on':f.run("select (clock_timestamp() at time zone 'America/Sao_Paulo')::date").strip(),'outcome':'protocol','description':'Synthetic receipt recorded manually, no external transmission'}
 return f"select public.legal_external_act_record_receipt('{attempt['id']}',{q(p)});"
lock=f"select id from public.legal_cases where id='{ids['case']}' for update;select pg_advisory_xact_lock(hashtextextended('legal_expansion_receipt_reference:'||'{ids['tenant_a']}'||':synthetic channel:synthetic-race-same-reference',0));"
rc,out,err=f.race(receipt_sql(a1,d1,ref),receipt_sql(a2,d2,'  '+ref.lower()+'  '),'same-receipt-reference-cross-case',lock=lock,brole='authenticated')
assert rc!=0 and 'External receipt already belongs to another attempt' in err,err+out
assert f.run(f"select count(*) from public.legal_external_act_receipts where lower(external_reference)='{ref.lower()}' and tenant_id='{ids['tenant_a']}'").strip()=='1'
passed('the same normalized external receipt reference cannot attach to two cases concurrently')

(ROOT/'f8-races-summary.json').write_text(json.dumps({'database_only':True,'provider_calls':0,'passed':reports},indent=2));print(json.dumps(reports),flush=True)
