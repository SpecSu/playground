#!/usr/bin/env python3
"""单文件打包：线上网关只放行 text/html → JS 用 esbuild 打成一个 ESM 内联，运行时资源（角色 glb / 缩略图 / 字体）base64 内嵌为 blob URL。
用法：python3 build/build_single.py  → 输出 dist/index.html"""
import base64, json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
os.makedirs('dist', exist_ok=True)
subprocess.run(['npx', '--yes', 'esbuild@0.28.2', 'src/main.js', '--bundle', '--format=esm', '--minify',
                '--alias:three=./vendor/three.module.min.js', '--target=es2020', '--outfile=dist/_bundle.js'], check=True)
js = open('dist/_bundle.js', encoding='utf-8').read().replace('</script', '<\\/script')
MIME = {'.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2'}
assets = {}
for d in ('assets/crew', 'assets/thumbs'):
    for f in sorted(os.listdir(d)):
        ext = os.path.splitext(f)[1]
        if ext in MIME:
            assets[f'{d}/{f}'] = [MIME[ext], base64.b64encode(open(f'{d}/{f}', 'rb').read()).decode()]
font = base64.b64encode(open('assets/fonts/Fredoka-Party.woff2', 'rb').read()).decode()
html = open('index.html', encoding='utf-8').read()
assert "url(assets/fonts/Fredoka-Party.woff2)" in html, 'brand font url not found'
html = html.replace("url(assets/fonts/Fredoka-Party.woff2)", f"url(data:font/woff2;base64,{font})")
html = re.sub(r'<script type="importmap">.*?</script>\s*', '', html, flags=re.S)
loader = ('<script>(function(){var A=' + json.dumps(assets) + ',M={};for(var k in A){var b=atob(A[k][1]),u=new Uint8Array(b.length);'
          'for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);M[k]=URL.createObjectURL(new Blob([u],{type:A[k][0]}));}window.__FP_ASSETS=M;})();</script>\n')
tag = '<script type="module" src="./src/main.js"></script>'
assert tag in html, 'main.js script tag not found'
html = html.replace(tag, loader + '<script type="module">' + js + '</script>')
open('dist/index.html', 'w', encoding='utf-8').write(html)
os.remove('dist/_bundle.js')
print('dist/index.html', round(os.path.getsize('dist/index.html') / 1e6, 2), 'MB,', len(assets), 'assets')
