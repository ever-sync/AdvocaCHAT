"""Apply SQL migrations atomically with a durable version ledger. Requires PG* env vars."""
from pathlib import Path
import subprocess
import re

def sql(source):
    result = subprocess.run(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

sql('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text);')
versions = set(sql('SELECT version FROM supabase_migrations.schema_migrations').splitlines())
commands = []
for path in sorted((Path(__file__).resolve().parent.parent / 'supabase/migrations').glob('*.sql')):
    version, name = path.stem.split('_', 1)
    if version in versions:
        continue
    source = re.sub(r'(?im)^\s*(begin|commit);\s*$', '', path.read_text())
    commands.append(f"\\echo Applying {path.name}\nBEGIN;\n" + source + f"\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('{version}','{name}');\nCOMMIT;")
result = subprocess.run(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1'], input='\n'.join(commands), text=True)
raise SystemExit(result.returncode)
