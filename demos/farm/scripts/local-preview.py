#!/usr/bin/env python3
"""Start this farm on the Mac, detached from the terminal; never install a login item."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen

root = Path(__file__).resolve().parent.parent
local = root / '.local'
local.mkdir(exist_ok=True)
pid_file = local / 'server.pid'
url = 'http://127.0.0.1:5190'

def healthy(pid):
    try:
        listener = subprocess.run(['lsof', '-nP', '-a', '-p', str(pid), '-iTCP:5190', '-sTCP:LISTEN'], capture_output=True)
        if listener.returncode != 0:
            return False
        with urlopen(url, timeout=2) as response:
            return response.status == 200 and b'id="root"' in response.read()
    except OSError:
        return False

if pid_file.exists():
    pid = int(pid_file.read_text().strip())
    check = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True)
    if check.returncode == 0:
        cwd = subprocess.run(['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'], capture_output=True, text=True)
        if 'server/index.ts' not in check.stdout or ('n' + str(root) + '\n') not in cwd.stdout:
            sys.exit('Recorded PID belongs to a different process; nothing was stopped or changed.')
        if not healthy(pid):
            sys.exit('Farm process exists but5190 did not respond. Inspect .local/server.log; nothing was stopped.')
        print(json.dumps({'url': url, 'pid': pid, 'status': 'already running'}))
        sys.exit(0)

if '--check' in sys.argv:
    sys.exit('Farm background process is not running.')
if not (root / 'dist/index.html').exists():
    sys.exit('Build first: npm run build')
candidates = [str(local / 'runtime/node'), os.environ.get('FARM_NODE'), shutil.which('node')]
node = None
for candidate in candidates:
    if not candidate or not Path(candidate).is_file():
        continue
    version = subprocess.check_output([candidate, '--version'], text=True).strip().lstrip('v').split('.')
    if tuple(map(int, version[:2])) >= (24, 9):
        node = candidate
        break
if not node:
    sys.exit('Node24.9+ is required; set FARM_NODE to its binary path.')
env = os.environ.copy()
env.update(PORT='5190', FARM_DB=str(local / 'farm.sqlite'))
with (local / 'server.log').open('ab', buffering=0) as log:
    process = subprocess.Popen([node, '--experimental-strip-types', 'server/index.ts'], cwd=root,
                               env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                               start_new_session=True, close_fds=True)
pid_file.write_text(str(process.pid) + '\n')
for _ in range(20):
    if process.poll() is not None:
        sys.exit('Farm did not start. Inspect .local/server.log; no other process was stopped.')
    if healthy(process.pid):
        print(json.dumps({'url': url, 'pid': process.pid, 'status': 'started in independent session'}))
        sys.exit(0)
    time.sleep(.1)
sys.exit('Farm started but health check timed out. Inspect .local/server.log.')
