#!/usr/bin/env python3
"""Local disposable PostgreSQL race regression; no provider requests or production mutations.
The baseline must contain F1-F7 schema and no customer data. Clones and logs are retained.
"""
import argparse,csv,json,subprocess,time,uuid,hashlib,os,re
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin',default=os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
parser.add_argument('--port',type=int,default=55432)
parser.add_argument('--baseline',default='advocachat_f7_verified')
parser.add_argument('--tmp-dir',default='/tmp/advocachat-f7-races')
parser.add_argument('--prefix',default='advocachat_f7_race_'+uuid.uuid4().hex[:8])
args=parser.parse_args()
assert re.fullmatch(r'[a-z][a-z0-9_]{0,45}',args.baseline) and re.fullmatch(r'[a-z][a-z0-9_]{0,45}',args.prefix), 'Local fixture database names only'
assert 1024<=args.port<=65535, 'Explicit local test port required'
PG=str(Path(args.pg_bin))+'/'
ROOT=Path(args.tmp_dir);ROOT.mkdir(parents=True,exist_ok=True)
os.chdir(Path(__file__).resolve().parents[2])
reports=[]
class Fixture:
 def __init__(self,suffix,test,marker):
  self.name=args.prefix+'_'+suffix
  subprocess.run([PG+'createdb','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-T',args.baseline,self.name],check=True)
  self.base=[PG+'psql','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',self.name,'-v','ON_ERROR_STOP=1','-X','-At']
  s=Path('supabase/tests/'+test+'.sql').read_text().split(marker)[0]; csvpath=ROOT/('f7-'+suffix+'-ids.csv');sqlpath=ROOT/('f7-'+suffix+'-fixture.sql')
  s+=f"\n\\copy (select name,id from legal_test_ids) to '{csvpath}' csv header\nCOMMIT;\n";sqlpath.write_text(s)
  r=subprocess.run(self.base+['-f',str(sqlpath)],capture_output=True,text=True);(ROOT/('f7-'+suffix+'-fixture.log')).write_text(r.stdout+r.stderr);assert r.returncode==0,r.stderr[-3000:]
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
  a=subprocess.Popen(self.base+['-c',f"begin;set local application_name='f7_a';{lock}{self.auth(awho,arole)}select pg_sleep(1.1);{a_sql}commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  time.sleep(.15)
  b=subprocess.Popen(self.base+['-c',f"begin;set local application_name='f7_b';{self.auth(bwho,brole)}{b_sql}commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  observed=False
  for _ in range(15):
   if self.run("select count(*) from pg_stat_activity where application_name='f7_b' and wait_event_type='Lock'").strip()=='1':observed=True;break
   if b.poll() is not None:break
   time.sleep(.025)
  ao,ae=a.communicate(timeout=15);bo,be=b.communicate(timeout=15)
  record={'label':label,'wait_observed':observed,'a_exit':a.returncode,'b_exit':b.returncode,'a_stdout':ao,'a_stderr':ae,'b_stdout':bo,'b_stderr':be};(ROOT/('f7-race-'+label+'.log')).write_text(json.dumps(record,indent=2));assert a.returncode==0,ae
  if expect_wait:assert observed,'No demonstrated lock wait: '+label
  return b.returncode,bo,be

def passed(label):reports.append(label);print("PASS:",label,flush=True)
def q(value):return "'"+json.dumps(value,ensure_ascii=False).replace("'","''")+"'"
def extract(out):return [json.loads(x) for x in out.splitlines() if x.startswith("{") or x.startswith("[")][-1]
m=Fixture('assistance','legal_document_assistance','-- F7_ASSISTANCE_CONCURRENCY_FIXTURE_READY');ids=m.ids
quota_lock=f"select pg_advisory_xact_lock(hashtextextended('legal_assistance_quota:'||'{ids['tenant_a']}',0));"
def ocr_sql(document,previous=None):return f"select public.legal_ocr_enqueue('{document}','{uuid.uuid4()}',"+(f"'{previous}'" if previous else 'null')+");"
def ocr_claim():return m.call('select public.legal_ocr_service_claim();',role='service_role')
def ai_sql(case,citation):
 payload={'draft_key':'race-'+uuid.uuid4().hex,'kind':'summary','category':'general','purpose':'Synthetic concurrency; no provider request','citation_ids':[citation],'max_output_tokens':256,'idempotency_key':str(uuid.uuid4())}
 return f"select public.legal_ai_enqueue('{case}',{q(payload)});"
def ai_claim():return m.call(f"select public.legal_ai_service_claim('{ids['tenant_a']}','synthetic-ai-account','synthetic-model',true);",role='service_role')[0]
def authorize(j):return f"select public.legal_ai_service_authorize('{j['id']}','{j['lease_token']}','{ids['tenant_a']}','synthetic-ai-account','synthetic-model',12000);"
def finish(j,outcome):return f"select public.legal_ai_service_finish('{j['id']}','{j['lease_token']}',{q(outcome)});"
# A second case provides independent case locks, while both compete for one tenant quota.
doc=m.call(f"select to_jsonb(public.legal_prepare_document('{ids['case2']}','general','Synthetic second-case original','race.pdf','application/pdf',10));")
m.run(f"begin;{m.auth(role='service_role')}reset role;insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents','{doc['storage_path']}','{{\"size\":10}}');set local role service_role;select public.legal_finalize_document('{doc['id']}','{hashlib.sha256(doc['id'].encode()).hexdigest()}');commit;")
text_payload={'mode':'manual','pages_total':1,'note':'Synthetic second-case transcription','pages':[{'page_number':1,'text':'Synthetic second case B123.'}]}
v=m.call(f"select public.legal_text_create_version('{doc['id']}',{q(text_payload)});")
m.call(f"select public.legal_text_submit('{v['id']}');")
m.call(f"select public.legal_text_review_pages('{v['id']}',array[1],'approved','Synthetic original manually compared');")
cit=m.call(f"select public.legal_assistance_search('{ids['case2']}','B123',{q([{'kind':'text_page','version_id':v['id']}])});")['citations'][0]['id']
rc,out,err=m.race(ocr_sql(ids['general'],ids['f7_ocr']),ocr_sql(ids['general'],ids['f7_ocr']),'duplicate-ocr-enqueue',brole='authenticated')
assert rc!=0 and ('Reprocessing' in err or 'live' in err),err+out
j=m.run(f"select id from public.legal_ocr_jobs where document_id='{ids['general']}' and state='queued'").strip();assert j
m.call(f"select public.legal_ocr_cancel('{j}','Synthetic duplicate race cleanup');")
passed('same original concurrent enqueue retains exactly one live OCR job')
m.call('select public.legal_assistance_configure_ocr(true,40,20);')
rc,out,err=m.race(ocr_sql(ids['medical']),ocr_sql(doc['id']),'ocr-shared-tenant-quota',lock=quota_lock,brole='authenticated')
assert rc!=0 and ('quota' in err.lower() or 'limit' in err.lower() or 'reservation exceeded' in err.lower()),err+out
assert m.run(f"select sum(quota_pages) from public.legal_ocr_jobs where tenant_id='{ids['tenant_a']}'").strip()=='40'
passed('two cases cannot reserve beyond the same tenant OCR page quota')
rc,out,err=m.race('select public.legal_ocr_service_claim();','select public.legal_ocr_service_claim();','ocr-single-worker-lease',arole='service_role',expect_wait=False)
assert rc==0 and extract(out)==[],err+out
medical=json.loads(m.run(f"select to_jsonb(j) from public.legal_ocr_jobs j where document_id='{ids['medical']}' and state='running'").strip());assert medical['attempts']==1
m.call(f"select public.legal_ocr_service_fail('{medical['id']}','{medical['lease_token']}','synthetic_before_processing',false);",role='service_role')
passed('two workers acquire one OCR lease using SKIP LOCKED')
# Refill only one AI reserve after the fixture's measured and uncertain consumption.
policy=json.loads(m.run(f"select to_jsonb(p)-array['id','tenant_id','version_number','state','created_by','created_at','reviewed_by','reviewed_at','review_note','source_document_sha256'] from public.legal_ai_policy_versions p where id='{ids['f7_policy']}'").strip())
for key in ['input_rate','output_rate','monthly_budget']:policy[key]=str(policy[key])
policy['monthly_budget']='0.030000'
p=m.call(f"select public.legal_ai_create_policy_version({q(policy)});")
m.call(f"select public.legal_ai_review_policy('{p['id']}','approved','Synthetic concurrency budget review');")
m.call(f"select public.legal_ai_service_configure('{ids['owner']}','{ids['tenant_a']}','synthetic-ai-account','synthetic-model','{p['id']}',true);",role='service_role')
j1=m.call(ai_sql(ids['case'],ids['f7_general_citation']));j2=m.call(ai_sql(ids['case2'],cit));leases=[ai_claim(),ai_claim()];leases={x['id']:x for x in leases};a=leases[j1['id']];b=leases[j2['id']]
rc,out,err=m.race(authorize(a),authorize(b),'ai-shared-tenant-budget',lock=f"select id from public.legal_cases where id='{ids['case']}' for update;select pg_advisory_xact_lock(hashtextextended('legal_assistance_catalog:'||'{ids['tenant_a']}',0));"+quota_lock,arole='service_role')
assert rc==0 and extract(out)['allowed'] is False,err+out
assert m.run(f"select sum(quota_cost)<=0.030000 from public.legal_ai_jobs where tenant_id='{ids['tenant_a']}'").strip()=='t'
assert m.run(f"select state from public.legal_ai_jobs where id='{b['id']}'").strip()=='quota_exhausted'
m.call(finish(a,{'ok':False,'code':'synthetic_before_send','consumption':'not_sent'}),role='service_role')
passed('parallel case generation cannot exceed decimal tenant budget; uncertain charges remain reserved')
# A valid synthetic kernel DTO races a real permission revocation while waiting for the case.
j=m.call(ocr_sql(ids['medical'],medical['id']),who='member');lease=ocr_claim()[0]
md=json.loads(m.run(f"select to_jsonb(d) from public.legal_case_documents d where id='{ids['medical']}'").strip())
kernel={'kernel_version':'legal-ocr-offline-v1','source_sha256':md['sha256'],'source_bytes':10,'mime_type':'application/pdf','status':'complete','reason':None,'pages_total':1,'pages':[{'page':1,'status':'recognized','text':'Synthetic recognized source','words':[],'confidence_mean':'99.00','width':10,'height':10,'coordinate_system':'rendered_pixels','review_status':'unreviewed'}],'engine':{'tesseract':'synthetic','poppler':'synthetic','models':[{'language':'por','sha256':'a'*64}],'oem':1,'psm':3,'render_dpi':150,'render_max_dimension':4000,'minimum_confidence':'60.00','memory_enforcement':'rlimit_as'},'review_status':'unreviewed','elapsed_ms':1}
rc,out,err=m.race(f"select public.legal_set_case_member('{ids['case']}','{ids['member']}',true,false,true);",f"select public.legal_ocr_service_finish('{j['id']}','{lease['lease_token']}',{q(kernel)});",'ocr-finish-after-revocation')
assert rc==0,err+out
result=extract(out);assert result['version_id'] is None and result['job']['state']=='authorization_revoked',result
passed('OCR completion waiting on case discards result after uploader medical access is revoked')
# Cancellation must discard text but account for reported consumption even after a successful provider response.
j=m.call(ai_sql(ids['case'],ids['f7_general_citation']));lease=ai_claim();assert m.call(authorize(lease),role='service_role')['allowed']
body={'title':'Synthetic output','sections':[{'heading':'Evidence','text':'Synthetic proposed interpretation','citation_ids':[ids['f7_general_citation']]}],'missing_facts':[],'divergences':[]}
outcome={'ok':True,'body':body,'usage':{'input_tokens':100,'output_tokens':50},'response_id':'resp_race'}
rc,out,err=m.race(f"select public.legal_ai_cancel('{j['id']}','Synthetic cancellation during processing');",finish(lease,outcome),'ai-finish-after-cancel')
assert rc==0,err+out
result=extract(out);assert result['version_id'] is None and result['job']['state']=='cancelled' and result['job']['measured_cost']=='0.000200',result
passed('cancelled generation never creates draft, while exact reported cost remains accounted')
# Change the original transcription only after every generation test, since all old citations become stale.
instrument_version=m.run(f"select id from public.legal_instrument_versions where instrument_id='{ids['f7_instrument']}' and version_number=1").strip()
m.call(f"select to_jsonb(public.legal_submit_instrument_review('{instrument_version}'));")
correction={'mode':'correction','previous_version_id':ids['f7_general_text'],'pages_total':1,'note':'Synthetic correction supersedes original source','pages':[{'page_number':1,'text':'Corrected A123 requires fresh nominal review.'}]}
rc,out,err=m.race(f"select public.legal_text_create_version('{ids['general']}',{q(correction)});",f"select to_jsonb(public.legal_review_instrument('{instrument_version}','approved','Must fail because source changed while waiting'));",'derived-instrument-source-change',brole='authenticated')
assert rc!=0 and ('source' in err.lower() or 'current' in err.lower()),err+out
assert m.run(f"select status from public.legal_instrument_versions where id='{instrument_version}'").strip()=='in_review'
passed('F2 instrument approval waiting on case rejects a concurrently superseded source')
# Preserve F2's established instrument mutex order: new-version writer and reviewer must never deadlock.
i=m.call(f"select to_jsonb(public.legal_create_instrument('{ids['case']}','contract','Synthetic independent instrument','general','Synthetic initial content'));")
iv=m.run(f"select id from public.legal_instrument_versions where instrument_id='{i['id']}'").strip()
m.call(f"select to_jsonb(public.legal_submit_instrument_review('{iv}'));")
rc,out,err=m.race(f"select to_jsonb(public.legal_add_instrument_version('{i['id']}','Synthetic replacement content'));",f"select to_jsonb(public.legal_review_instrument('{iv}','approved','Superseded concurrent version'));",'instrument-version-review-lock-order',lock=f"select id from public.legal_instruments where id='{i['id']}' for update;",brole='authenticated')
assert rc!=0 and 'Invalid instrument review transition' in err and 'deadlock' not in err,err+out
passed('F2 new version and F7 review preserve instrument lock order without deadlock')
# A completion started before expiration cannot authorize a result after waiting beyond the lease.
m.call('select public.legal_assistance_configure_ocr(true,100,20);')
j=m.call(ocr_sql(ids['fiscal']));lease=ocr_claim()[0]
fd=json.loads(m.run(f"select to_jsonb(d) from public.legal_case_documents d where id='{ids['fiscal']}'").strip())
kernel['source_sha256']=fd['sha256']
m.run(f"update public.legal_ocr_jobs set lease_until=clock_timestamp()+interval '0.8 seconds' where id='{j['id']}'")
rc,out,err=m.race('select 1;',f"select public.legal_ocr_service_finish('{j['id']}','{lease['lease_token']}',{q(kernel)});",'ocr-lease-expires-during-wait')
assert rc==0 and extract(out)['version_id'] is None and extract(out)['job']['state']=='authorization_revoked',err+out
passed('lease expiration uses current clock after case wait and never creates a late OCR result')
# A queued reservation from an earlier month must recheck the dispatch month's quota.
j=m.call(ocr_sql(doc['id']))
m.run(f"update public.legal_ocr_jobs set quota_month=(quota_month-interval '1 month')::date where id='{j['id']}'")
m.call('select public.legal_assistance_configure_ocr(true,40,20);')
assert ocr_claim()==[]
assert m.run(f"select state||'|'||error_code||'|'||quota_pages from public.legal_ocr_jobs where id='{j['id']}'").strip()=='failed|monthly_page_limit|0'
passed('queued OCR cannot bypass current-month quota with a prior-month reservation')
(ROOT/'f7-races-summary.json').write_text(json.dumps({'database_only':True,'provider_calls':0,'passed':reports},indent=2));print(json.dumps(reports),flush=True)
