#!/usr/bin/env python3
"""Local disposable PostgreSQL race regression; no provider requests or production mutations.
The baseline must contain F1-F6 schema and no customer data. Clones and logs are retained.
"""
import argparse,csv,json,subprocess,time,uuid,hashlib,os,re
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin',default=os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
parser.add_argument('--port',type=int,default=55432)
parser.add_argument('--baseline',default='advocachat_f6_verified')
parser.add_argument('--tmp-dir',default='/tmp/advocachat-f6-races')
parser.add_argument('--prefix',default='advocachat_f6_race_'+uuid.uuid4().hex[:8])
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
  s=Path('supabase/tests/'+test+'.sql').read_text().split(marker)[0]; csvpath=ROOT/('f6-'+suffix+'-ids.csv');sqlpath=ROOT/('f6-'+suffix+'-fixture.sql')
  s+=f"\n\\copy (select name,id from legal_test_ids) to '{csvpath}' csv header\nCOMMIT;\n";sqlpath.write_text(s)
  r=subprocess.run(self.base+['-f',str(sqlpath)],capture_output=True,text=True);(ROOT/('f6-'+suffix+'-fixture.log')).write_text(r.stdout+r.stderr);assert r.returncode==0,r.stderr[-3000:]
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
  a=subprocess.Popen(self.base+['-c',f"begin;set local application_name='f6_a';{lock}{self.auth(awho,arole)}select pg_sleep(1.1);{a_sql}commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  time.sleep(.15)
  b=subprocess.Popen(self.base+['-c',f"begin;set local application_name='f6_b';{self.auth(bwho,brole)}{b_sql}commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  observed=False
  for _ in range(15):
   if self.run("select count(*) from pg_stat_activity where application_name='f6_b' and wait_event_type='Lock'").strip()=='1':observed=True;break
   if b.poll() is not None:break
   time.sleep(.025)
  ao,ae=a.communicate(timeout=15);bo,be=b.communicate(timeout=15)
  record={'label':label,'wait_observed':observed,'a_exit':a.returncode,'b_exit':b.returncode,'a_stdout':ao,'a_stderr':ae,'b_stdout':bo,'b_stderr':be};(ROOT/('f6-race-'+label+'.log')).write_text(json.dumps(record,indent=2));assert a.returncode==0,ae
  if expect_wait:assert observed,'No demonstrated lock wait: '+label
  return b.returncode,bo,be
 def job(self):
  p={'case_id':self.ids['case'],'proceeding_id':self.ids['jud_proceeding'],'operation':'consult_cnj','query':{'cnj':'00000014520248260001'},'max_requests':2,'budget_units':0,'authorization_note':'Synthetic race request only','idempotency_key':str(uuid.uuid4())}
  return self.call(f"select public.legal_judicial_enqueue('{self.ids['jud_connection']}','{json.dumps(p)}');")['id']
 def claim(self):return self.call(f"select public.legal_judicial_service_claim('{self.ids['tenant_a']}','jud-fixture-account','escavador',true,1);",role='service_role')
 def authorize(self,j,l):return f"select public.legal_judicial_service_authorize_attempt('{j}','{l}','{self.ids['tenant_a']}','jud-fixture-account');"
def passed(label):reports.append(label);print('PASS:',label,flush=True)
m=Fixture('monitor','legal_judicial_monitoring','-- F6_MONITORING_CONCURRENCY_FIXTURE_READY');ids=m.ids;raw='{"event":"synthetic-concurrent-callback"}';payload={'original_sha256':hashlib.sha256(raw.encode()).hexdigest(),'parser_version':'race-v1','event_type':'movement','provider_monitor_ids':[],'candidates':[{'cnj':'00000014520248260001'}]};ingest=f"select public.legal_judicial_service_ingest('{ids['tenant_a']}','jud-fixture-account','escavador','concurrent-same','{raw}','{json.dumps(payload)}');"
rc,out,err=m.race(ingest,ingest,'callback-idempotency',lock=f"select pg_advisory_xact_lock(hashtextextended('legal_judicial_ingest:'||'{ids['tenant_a']}',0));",arole='service_role');assert rc==0 and '"duplicate": true' in out,err+out;assert m.run("select count(*) from public.legal_judicial_inbox where provider_event_id='concurrent-same'").strip()=='1';passed('concurrent identical callbacks persist one original/inbox')
j=m.job();claim=f"select public.legal_judicial_service_claim('{ids['tenant_a']}','jud-fixture-account','escavador',true,1);"
rc,out,err=m.race(claim,claim,'single-send-lease',arole='service_role',expect_wait=False);assert rc==0 and '\n[]\n' in out,err+out;assert m.run(f"select state||'|'||attempts from public.legal_judicial_jobs where id='{j}'").strip()=='sending|1';passed('two workers compete; SKIP LOCKED grants exactly one send lease')
l=m.run(f"select lease_token from public.legal_judicial_jobs where id='{j}'").strip();m.call(f"select public.legal_judicial_service_finish('{j}','{l}','succeeded','{{\"items_count\":0}}');",role='service_role')
j=m.job();l=m.claim()[0]['lease_token'];limits='{"environment":"production","requests_per_minute":120,"requests_per_day":1000}'
configure=f"select public.legal_judicial_service_configure('{ids['owner']}','{ids['tenant_a']}','jud-fixture-account','{ids['jud_source']}',false,'{limits}');"
rc,out,err=m.race(configure,m.authorize(j,l),'connection-revoked-before-fetch',arole='service_role');assert rc==0 and '"reason": "disabled"' in out,err+out;assert m.run(f"select request_count from public.legal_judicial_jobs where id='{j}'").strip()=='0';passed('disabled connection is reread after case wait; zero fetch budget consumed')
m.call(configure.replace(',false,',',true,'),role='service_role')
rc,out,err=m.race(f"select public.legal_set_case_member('{ids['case']}','{ids['member']}',true,false,true);",f"select public.legal_judicial_read_original('{ids['jud_inbox']}');",'source-reader-revoked',brole='authenticated',bwho='member');assert rc!=0 and 'Current original category access required' in err,err+out;passed('original read waiting on case refuses medical grant revoked concurrently')
j=m.job();l=m.claim()[0]['lease_token'];rc,out,err=m.race(f"select public.legal_judicial_review_source('{ids['jud_source']}','revoked','Concurrent synthetic source revocation');",m.authorize(j,l),'source-permission-revoked');assert rc==0 and '"reason": "permission_required"' in out,err+out;assert m.run(f"select request_count from public.legal_judicial_jobs where id='{j}'").strip()=='0';passed('source permission revoked while request waits; no authorized external fetch')
# Separate fixture: reviewed catalog head and proposed deadlines without any monitoring mutation.
d=Fixture('deadline','legal_assisted_deadlines','-- F6_DEADLINE_CONCURRENCY_FIXTURE_READY');ids=d.ids
rc,out,err=d.race(f"select public.legal_deadline_review_calendar('{ids['deadline_calendar']}','revoked','Synthetic concurrent calendar revocation');",f"select public.legal_deadline_review('{ids['deadline_current']}','reviewed','Cannot publish a stale calendar while waiting');",'calendar-revocation',lock=f"select pg_advisory_xact_lock(hashtextextended('legal_judicial_catalog:'||'{ids['tenant_a']}',0));",brole='authenticated');assert rc!=0 and 'Complete current submitted version required' in err,err+out;assert d.run(f"select state||'|'||(task_id is null) from public.legal_deadline_versions where id='{ids['deadline_current']}'").strip()=='in_review|true';passed('catalog revocation while approval waits prevents any partial deadline task')
rc,out,err=d.race(f"select public.legal_set_case_member('{ids['case']}','{ids['member']}',true,false,true);",f"select public.legal_deadline_read_report('{ids['deadline_version']}');",'deadline-export-revoked',brole='authenticated',bwho='member');assert rc!=0 and 'Current dual category access required' in err,err+out;passed('historical report export revalidates category after lock wait')
# An inactive catalog editor that entered before the lock must not draft after revocation.
row=json.loads(d.run(f"select to_jsonb(r)-array['id','tenant_id','version_number','state','created_by','created_at','reviewed_by','reviewed_at','review_note'] from public.legal_deadline_rule_versions r where id='{ids['deadline_rule']}'").strip());row['rule_key']='revoked-editor-race'
rc,out,err=d.race(f"reset role;update public.profiles set status='inactive' where id='{ids['owner']}';",f"select public.legal_deadline_create_rule_version('{json.dumps(row).replace(chr(39),chr(39)*2)}');",'catalog-editor-revoked',arole='service_role',lock=f"select pg_advisory_xact_lock(hashtextextended('legal_judicial_catalog:'||'{ids['tenant_a']}',0));",brole='authenticated');assert rc!=0 and 'Rule catalog edit revoked' in err,err+out;assert d.run("select count(*) from public.legal_deadline_rule_versions where rule_key='revoked-editor-race'").strip()=='0';passed('catalog editor is revalidated after advisory wait and cannot draft after inactivation')
(ROOT/'f6-races-summary.json').write_text(json.dumps({'database_only':True,'provider_calls':0,'passed':reports},indent=2));print(json.dumps(reports),flush=True)
