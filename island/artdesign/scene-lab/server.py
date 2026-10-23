from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sys
import os
import argparse

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'tools'))
from tripo_pipeline import SPECS
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def list_directory(self,path):
        self.send_error(403,'Directory listing disabled')
        return None

    def translate_path(self,path):
        resolved=Path(super().translate_path(path)).resolve()
        if not resolved.is_relative_to(ROOT):
            return str(ROOT/'__blocked__')
        return str(resolved)

    def do_GET(self):
        clean=self.path.split('?',1)[0]
        if clean.startswith('/ref/'):
            asset=Path(clean).stem
            if asset not in SPECS: return self.send_error(404)
            path=ROOT.parent/SPECS[asset]['reference']
            self.send_response(200)
            self.send_header('Content-Type','image/png')
            self.send_header('Content-Length',str(path.stat().st_size))
            self.end_headers()
            self.wfile.write(path.read_bytes())
            return
        if clean=='/reference-scene.png':
            path=ROOT.parent/'art/v0.1/references/scene-original.png'
            self.send_response(200)
            self.send_header('Content-Type','image/png')
            self.end_headers()
            self.wfile.write(path.read_bytes())
            return
        return super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Serve the offline island asset lab on localhost.')
    parser.add_argument('--port',type=int,default=8771)
    args=parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Island asset lab: http://127.0.0.1:{args.port}',flush=True)
    server.serve_forever()
