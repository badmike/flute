import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';import {createServer} from 'node:net';import {chromium} from 'playwright';import {expect} from '@playwright/test';
// Installed Nuxt check: packs the library, installs it into a copy of local-project-nuxt, runs the real CLI
// (init/sync/scenes/validate/open/export) against `nuxt dev`, then proves `nuxt build` + `nuxt preview` answer /flute with 404.
const root=fileURLToPath(new URL('../',import.meta.url));const scratch=await mkdtemp(path.join(tmpdir(),'flute-nuxt-'));const host=path.join(scratch,'local-project-nuxt');
let dev,preview,browser;
function run(args,cwd=host){return new Promise((resolve,reject)=>{const p=spawn(args[0],args.slice(1),{cwd,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>out+=v);p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(Error(out)));})}
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n}
async function ready(origin,child){for(let i=0;i<300;i++){if(child.exitCode!==null)throw Error('Server exited early');try{if((await fetch(origin)).status<500)return}catch{}await new Promise(r=>setTimeout(r,200))}throw Error('Server did not start: '+origin)}
try{
 await cp(path.join(root,'local-project-nuxt'),host,{recursive:true,filter:source=>!/[\\/](?:node_modules|\.nuxt|\.output|\.data|dist)(?:[\\/]|$)/.test(source)&&!source.endsWith('package-lock.json')});
 await mkdir(path.join(scratch,'.local-package'));const packed=JSON.parse(await run(['npm','pack','--json',...(process.env.FLUTE_VERIFY_PREBUILT==='1'?['--ignore-scripts']:[]),'--pack-destination',path.join(scratch,'.local-package')],root));
 for(const entry of ['dist/library/vue.js','dist/library/vue-preview.js','dist/library/types/vue/index.d.ts','dist/library/types/preview-vue/index.d.ts'])assert.ok(packed[0].files.some(f=>f.path===entry),'Packed '+entry);
 await run(['npm','install','--force','--ignore-scripts','--no-audit','--no-fund',path.join(scratch,'.local-package',packed[0].filename)]);
 // Zero React in a Nuxt host: the library must not drag react into node_modules.
 assert.deepEqual((await readdir(path.join(host,'node_modules'))).filter(name=>/^react(?:-|$)/i.test(name)),[],'No React packages installed');
 const cli=path.join(host,'node_modules/@webprodigies/flute/dist/cli/flute.js');
 // The copied host already carries its generated /flute page; init must recognize it and change nothing.
 const init=JSON.parse(await run([process.execPath,cli,'init','--json']));assert.equal(init.success,true);assert.equal(init.data.project.adapter,'nuxt');assert.equal(init.data.project.entry,'app/pages/flute.vue');assert.equal(init.data.changed,false);
 assert.equal(JSON.parse(await run([process.execPath,cli,'sync','--json'])).success,true);
 assert.equal(JSON.parse(await run([process.execPath,cli,'validate','--json'])).success,true);
 const list=JSON.parse(await run([process.execPath,cli,'scenes','--json']));assert.deepEqual(list.data.scenes.map(s=>s.binding),['customer-focus','overview','plating'].map(id=>`src/flute/scenes/${id}.vue`));
 const nuxt=path.join(host,'node_modules/nuxt/bin/nuxt.mjs');
 const n=await port();const origin=`http://127.0.0.1:${n}`;
 dev=spawn(process.execPath,[nuxt,'dev','--host','127.0.0.1','--port',String(n)],{cwd:host,stdio:'ignore'});await ready(origin,dev);
 const opened=JSON.parse(await run([process.execPath,cli,'open','--scene','plating','--url',origin,'--no-open','--json']));assert.equal(opened.success,true);assert.equal(opened.data.url,`${origin}/flute?flute-preview=1&flute-scene=plating`);
 const html=await (await fetch(`${origin}/flute?flute-preview=1`)).text();assert.match(html,new RegExp(`<meta name="flute-project" content="${init.data.project.projectId}"`));
 browser=await chromium.launch({channel:'chromium',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const problems=[];page.on('pageerror',e=>problems.push(e.message));page.on('console',m=>{if(/Vue warn|hydrat|mismatch/i.test(m.text()))problems.push(m.text())});
 await page.goto(origin);await expect(page.locator('.orbit-dashboard')).toBeVisible();assert.equal(await page.locator('[data-flute-scene]').count(),0,'Normal route stays ordinary');
 await page.goto(`${origin}/flute?flute-preview=1`);await expect(page.getByText('3 perspectives',{exact:true})).toBeVisible();assert.equal(await page.locator('.flute-library-issues').count(),0,'No scene diagnostics');
 await page.goto(opened.data.url);await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
 await expect(page.locator('[data-flute-capture="scene"]')).toHaveAttribute('data-flute-valid','true');assert.equal(await page.locator('[data-flute-diagnostics]').count(),0);
 assert.ok(await page.locator('[data-flute-id]').count()>=6,'Registered every plating layer');await expect(page.getByText('$128,430',{exact:false}).first()).toBeVisible();
 const before=await page.locator('[data-flute-stage]').getAttribute('style');await page.evaluate(()=>window.__FLUTE_CAPTURE__.seek(4000));assert.notEqual(await page.locator('[data-flute-stage]').getAttribute('style'),before,'Seek moves the camera');
 await run([process.execPath,cli,'export','--url',opened.data.url,'--output','verification.mp4','--fps','30','--width','480','--height','360']);
 const probe=JSON.parse(await run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=codec_name,nb_frames,r_frame_rate','-of','json','verification.mp4']));
 assert.equal(probe.streams[0].codec_name,'h264');assert.equal(probe.streams[0].r_frame_rate,'30/1');assert.ok(Number(probe.streams[0].nb_frames)>=30);
 const hashes=(await run(['ffmpeg','-v','error','-i','verification.mp4','-f','framemd5','-'])).split('\n').filter(line=>/^0,/.test(line)).map(line=>line.split(',').pop().trim());
 assert.ok(new Set(hashes).size>hashes.length/2,'Exported frames change over the scene, not a frozen first frame');
 assert.deepEqual(problems,[],'No page errors, Vue warnings or hydration mismatches');
 await browser.close();browser=undefined;dev.kill('SIGTERM');dev=undefined;
 // Production: /flute answers 404, the app itself is untouched and no studio or scene code is bundled.
 await run([process.execPath,nuxt,'build']);
 const bundle=[];for(const directory of ['.output/public','.output/server'])for(const entry of await readdir(path.join(host,directory),{recursive:true,withFileTypes:true}))if(entry.isFile()&&/\.(?:m?js|css|html)$/.test(entry.name))bundle.push(await readFile(path.join(entry.parentPath,entry.name),'utf8'));
 const text=bundle.join('\n');for(const marker of ['@webprodigies','Closer to the people','data-flute-library','customer-focus'])assert.ok(!text.includes(marker),`Production bundle leaks ${marker}`);
 const p=await port();const production=`http://127.0.0.1:${p}`;
 preview=spawn(process.execPath,[nuxt,'preview','--port',String(p)],{cwd:host,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1'}});await ready(production,preview);
 const missing=await fetch(`${production}/flute?flute-preview=1`);assert.equal(missing.status,404);assert.ok(!(await missing.text()).includes('flute-project'),'404 page does not identify the project');
 const app=await fetch(production);assert.equal(app.status,200);assert.ok((await app.text()).includes('orbit'),'The application still renders');
 console.log('Installed Nuxt: init/sync/validate/scenes/open, /flute library, scene render, capture seek, real MP4 export and production 404 passed.');
}finally{await browser?.close();dev?.kill('SIGTERM');preview?.kill('SIGTERM');await rm(scratch,{recursive:true,force:true})}
