import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';import {createServer} from 'node:net';import {chromium} from 'playwright';import {expect} from '@playwright/test';
// Installed Vue check: packs the library, installs it into a copy of local-project-vue,
// runs the real CLI (init/sync/scenes/open/export) and drives the running Vite dev server in Chromium.
const root=fileURLToPath(new URL('../',import.meta.url));const scratch=await mkdtemp(path.join(tmpdir(),'flute-vue-'));const host=path.join(scratch,'local-project-vue');
let server,browser;
function run(args,cwd=host){return new Promise((resolve,reject)=>{const p=spawn(args[0],args.slice(1),{cwd,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>out+=v);p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(Error(out)));})}
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n}
try{
 await cp(path.join(root,'local-project-vue'),host,{recursive:true,filter:source=>!source.includes('node_modules')&&!source.includes('/dist')});
 await mkdir(path.join(scratch,'.local-package'));const packed=JSON.parse(await run(['npm','pack','--json',...(process.env.FLUTE_VERIFY_PREBUILT==='1'?['--ignore-scripts']:[]),'--pack-destination',path.join(scratch,'.local-package')],root));
 for(const entry of ['dist/library/vue.js','dist/library/vue-preview.js','dist/library/types/vue/index.d.ts','dist/library/types/preview-vue/index.d.ts'])assert.ok(packed[0].files.some(f=>f.path===entry),'Packed '+entry);
 const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 assert.ok(['react','react-dom','vue'].every(name=>manifest.peerDependenciesMeta[name]?.optional===true),'Frameworks are optional peers');
 await run(['npm','install','--force','--ignore-scripts','--no-audit','--no-fund',path.join(scratch,'.local-package',packed[0].filename)]);
 const cli=path.join(host,'node_modules/@webprodigies/flute/dist/cli/flute.js');
 // The copied host already carries its generated connection; init must recognize it and change nothing.
 const init=JSON.parse(await run([process.execPath,cli,'init','--json']));assert.equal(init.success,true);assert.equal(init.data.project.adapter,'vue');
 assert.equal(JSON.parse(await run([process.execPath,cli,'sync','--json'])).success,true);
 assert.equal(JSON.parse(await run([process.execPath,cli,'validate','--json'])).success,true,'validate sees the App.vue wrap');
 const list=JSON.parse(await run([process.execPath,cli,'scenes','--json']));assert.deepEqual(list.data.scenes.map(s=>s.binding),['customer-focus','overview','plating'].map(id=>`src/flute/scenes/${id}.vue`));
 await run(['npm','run','build']);
 const n=await port();const origin=`http://127.0.0.1:${n}`;
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(n),'--strictPort'],{cwd:host,stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const opened=JSON.parse(await run([process.execPath,cli,'open','--scene','plating','--url',origin,'--no-open','--json']));assert.equal(opened.success,true);
 browser=await chromium.launch({channel:'chromium',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const problems=[];page.on('pageerror',e=>problems.push(e.message));page.on('console',m=>{if(/Vue warn/.test(m.text()))problems.push(m.text())});
 await page.goto(origin);await expect(page.locator('.orbit-dashboard')).toBeVisible();assert.equal(await page.locator('[data-flute-scene]').count(),0,'Normal route stays ordinary');
 await page.goto(origin+'/?flute-preview=1');await expect(page.getByText('3 perspectives',{exact:true})).toBeVisible();assert.equal(await page.locator('.flute-library-issues').count(),0);
 await page.goto(opened.data.url);await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
 await expect(page.locator('[data-flute-capture="scene"]')).toHaveAttribute('data-flute-valid','true');assert.equal(await page.locator('[data-flute-diagnostics]').count(),0);
 assert.ok(await page.locator('[data-flute-id]').count()>=6,'Registered every plating layer');await expect(page.getByText('$128,430',{exact:false}).first()).toBeVisible();
 const before=await page.locator('[data-flute-stage]').getAttribute('style');await page.evaluate(()=>window.__FLUTE_CAPTURE__.seek(4000));assert.notEqual(await page.locator('[data-flute-stage]').getAttribute('style'),before,'Seek moves the camera');
 await run([process.execPath,cli,'export','--url',opened.data.url,'--output','verification.mp4','--fps','30','--width','480','--height','360']);
 const probe=JSON.parse(await run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=codec_name,nb_frames,r_frame_rate','-of','json','verification.mp4']));
 assert.equal(probe.streams[0].codec_name,'h264');assert.equal(probe.streams[0].r_frame_rate,'30/1');assert.ok(Number(probe.streams[0].nb_frames)>=30);
 const hashes=(await run(['ffmpeg','-v','error','-i','verification.mp4','-f','framemd5','-'])).split('\n').filter(line=>/^0,/.test(line)).map(line=>line.split(',').pop().trim());
 assert.ok(new Set(hashes).size>hashes.length/2,'Exported frames change over the scene, not a frozen first frame');
 assert.deepEqual(problems,[],'No page errors or Vue warnings');
 console.log('Installed Vue: init/sync/scenes/open, library, scene render, capture seek and real MP4 export passed.');
}finally{await browser?.close();server?.kill('SIGTERM');await rm(scratch,{recursive:true,force:true})}
