import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('components/fishing/FishingFeed.css').replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
function declarations(selector){
 const body=rules.filter(([,selectors])=>selectors.split(',').map(value=>value.trim()).includes(selector)).map(([, ,value])=>value).join(';');
 return Object.fromEntries(body.split(';').map(value=>value.trim().split(/:(.*)/s).slice(0,2)).filter(([name,value])=>name&&value!==undefined));
}
const picker='.feed-v020 .fishing-sheet[data-avatar-picker]';
const keyboard='.phone-viewport[data-keyboard-held] '+picker;

test('avatar picker bounds its flex shell without making the whole dialog a scroll container',()=>{
 const styles=declarations(picker);
 assert.equal(styles.display,'flex');
 assert.equal(styles['flex-direction'],'column');
 assert.equal(styles.height,'min(560px,calc(var(--phone-visible-height,844px) - 8px))');
 assert.equal(styles['min-height'],'0');
 assert.equal(styles.overflow,'hidden');
 assert.equal(styles['padding-bottom'],'0');
 assert.match(read('components/fishing/FishingFeed.tsx'),/className="sheet fishing-sheet"[^>]*data-avatar-picker=\{avatarPicker\|\|undefined\}/);
});

test('only the choices region shrinks and scrolls between the fixed identity and footer',()=>{
 const form=declarations(picker+' .fishing-avatar-form');
 assert.equal(form.display,'flex');
 assert.equal(form['flex-direction'],'column');
 assert.equal(form.flex,'1');
 assert.equal(form['min-height'],'0');
 for(const region of ['.fishing-avatar-identity','.fishing-avatar-footer'])assert.equal(declarations(picker+' '+region).flex,'none');
 const scroll=declarations(picker+' .fishing-avatar-scroll');
 assert.equal(scroll.flex,'1');
 assert.equal(scroll['min-height'],'0');
 assert.equal(scroll['overflow-y'],'auto');
 assert.equal(scroll['overscroll-behavior-y'],'contain');
 assert.equal(scroll['touch-action'],'pan-y');
 assert.equal(declarations(picker+' .fishing-avatar-footer .primary-button')['margin-top'],'0');
 assert.equal(declarations(picker+' .fishing-avatar-footer').background,'#161616');
});

test('keyboard-held override keeps the footer pinned and respects the visible boundary and safe area',()=>{
 // This selector must beat the shared keyboard rule that scrolls generic sheets.
 assert.equal(declarations(keyboard).overflow,'hidden');
 assert.equal(declarations(keyboard+' .sheet-handle').display,'none');
 assert.equal(declarations(keyboard+' .sheet-heading .eyebrow').display,'none');
 assert.match(declarations(picker+' .fishing-avatar-footer')['padding-bottom'],/env\(safe-area-inset-bottom,0px\)/);
 assert.match(declarations(picker+' .fishing-avatar-footer')['padding-bottom'],/var\(--phone-scale,1\)/,'physical safe-area padding is converted to canonical phone pixels');
 assert.equal(declarations(keyboard+' .fishing-avatar-footer')['padding-top'],'8px');
 assert.equal(declarations(keyboard+' .fishing-avatar-footer')['padding-bottom'],'8px','the existing viewport safe bounds already handle the keyboard edge');
 assert.match(read('components/FeedInterface.css'),/height:min\(758px,var\(--phone-visible-height,844px\)\)/);
});

test('short IME viewports remove fixed list padding and compact the nickname without shrinking its text',()=>{
 assert.equal(declarations(keyboard+' .sheet-heading').margin,'0 0 4px');
 assert.equal(declarations(keyboard+' .fishing-avatar-identity')['padding-bottom'],'6px');
 const input=declarations(keyboard+' .nickname-input');
 assert.equal(input.height,'38px');
 assert.equal(input.padding,'8px 12px');
 assert.equal(input['margin-top'],'4px');
 assert.equal(input['font-size'],undefined,'preserve the existing nickname font size');
 assert.equal(declarations(keyboard+' .fishing-avatar-scroll').padding,'0 2px','a zero-height list must not push the footer outside the clipped panel');
});
