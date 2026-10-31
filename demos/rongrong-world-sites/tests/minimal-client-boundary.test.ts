import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

test('MinimalApp preserves use client as its first statement before imports',()=>{
  const source=readFileSync(new URL('../src/minimal/MinimalApp.tsx',import.meta.url),'utf8');
  const parsed=ts.createSourceFile('MinimalApp.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const first=parsed.statements[0];
  assert.ok(first&&ts.isExpressionStatement(first)&&ts.isStringLiteral(first.expression),'client directive must precede imports');
  assert.equal(first.expression.text,'use client');
});
