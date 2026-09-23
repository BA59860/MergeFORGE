import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { moveItem,groupPages,normalizeRotation,filename } from '../model.js';
const require=createRequire(import.meta.url);
// pdf-lib ships a UMD bundle. Read into an isolated CommonJS-style function.
const module={exports:{}};
new Function('module','exports',fs.readFileSync(new URL('../vendor/pdf-lib.min.js',import.meta.url),'utf8'))(module,module.exports);
const PDFLib=module.exports;
const {PDFDocument,degrees,rgb}=PDFLib;
let request=0;
const pending=new Map();
const scope={postMessage(data){if(data.progress!=null)return;const promise=pending.get(data.requestId);pending.delete(data.requestId);data.error?promise.reject(new Error(data.error)):promise.resolve(data.result);}};
new Function('self','importScripts','PDFLib',fs.readFileSync(new URL('../pdf-worker.js',import.meta.url),'utf8'))(scope,()=>{},PDFLib);
function rpc(action,payload={}){return new Promise((resolve,reject)=>{const requestId=++request;pending.set(requestId,{resolve,reject});scope.onmessage({data:{requestId,action,payload}});});}
async function sourcePdf(count=3){const doc=await PDFDocument.create();for(let i=0;i<count;i++){const page=doc.addPage([500+i,700+i]);page.drawRectangle({x:10,y:10,width:40,height:40,color:rgb(i%2,.3,.7)});if(i===2)page.setRotation(degrees(90));}return doc.save();}
test('deterministic ordering, file grouping, and filename safety',()=>{
 const files=[{id:'a'},{id:'b'}];const pages=[{id:'a1',fileId:'a'},{id:'b1',fileId:'b'},{id:'a2',fileId:'a'}];
 assert.deepEqual(moveItem(pages,'a2',0).map(p=>p.id),['a2','a1','b1']);
 assert.deepEqual(groupPages(moveItem(files,'b',0),pages).map(p=>p.id),['b1','a1','a2']);
 assert.deepEqual(moveItem(pages,'a1',999).map(p=>p.id),['b1','a2','a1']);
 assert.deepEqual(moveItem(pages,'missing',1),pages);assert.equal(normalizeRotation(-90),270);
 assert.equal(filename('LastName_Lab3.pdf'),'LastName_Lab3.pdf');assert.equal(filename(' '),'My_Assignment.pdf');assert.equal(filename('a/b:c'),'a_b_c.pdf');
});
test('assembly preserves chosen order, deleted pages, inherited rotation, and image proportions',async()=>{
 await rpc('reset');await rpc('import',{id:'pdf',kind:'pdf',bytes:await sourcePdf()});
 // A valid 1x1 PNG; its placement geometry comes from the decoded image dimensions.
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDAAAAABJRU5ErkJggg==','base64'));
 await rpc('import',{id:'image',kind:'png',bytes:png,width:1600,height:2400});
 const pages=[{id:'p3',fileId:'pdf',sourceIndex:2,rotation:270},{id:'photo',fileId:'image',sourceIndex:0,rotation:90},{id:'p1',fileId:'pdf',sourceIndex:0,rotation:180}];
 const {bytes}=await rpc('generate',{pages});const doc=await PDFDocument.load(bytes);
 assert.equal(doc.getPageCount(),3);assert.deepEqual(doc.getPages().map(p=>p.getSize()),[{width:502,height:702},{width:612,height:792},{width:500,height:700}]);
 assert.deepEqual(doc.getPages().map(p=>p.getRotation().angle),[0,90,180]);
 assert.equal(doc.getForm().getFields().length,0);
 await rpc('remove',{id:'image'});await assert.rejects(rpc('generate',{pages}),/no longer available/);
});
test('saved form answers are flattened before page copying',async()=>{
 const doc=await PDFDocument.create();const page=doc.addPage();const field=doc.getForm().createTextField('answer');field.setText('A saved answer');field.addToPage(page,{x:30,y:30,width:220,height:30});
 const result=await rpc('import',{id:'form',kind:'pdf',bytes:await doc.save()});const normalized=await PDFDocument.load(result.bytes);
 assert.equal(normalized.getForm().getFields().length,0);assert.ok(normalized.getPage(0).node.Contents());
 const output=await rpc('generate',{pages:[{id:'f1',fileId:'form',sourceIndex:0,rotation:0}]});assert.equal((await PDFDocument.load(output.bytes)).getPageCount(),1);
});
test('moderate 100-page workload and friendly failure paths',async()=>{
 await rpc('reset');await rpc('import',{id:'many',kind:'pdf',bytes:await sourcePdf(100)});
 const pages=Array.from({length:100},(_,i)=>({id:`p${i}`,fileId:'many',sourceIndex:99-i,rotation:0}));
 const output=await rpc('generate',{pages});const doc=await PDFDocument.load(output.bytes);assert.equal(doc.getPageCount(),100);assert.equal(doc.getPage(0).getWidth(),599);assert.equal(doc.getPage(99).getWidth(),500);
 await assert.rejects(rpc('generate',{pages:[]}),/at least one page/);
 await assert.rejects(rpc('import',{id:'bad',kind:'pdf',bytes:new TextEncoder().encode('not a PDF')}));
 await assert.rejects(rpc('import',{id:'too-long',kind:'pdf',bytes:await sourcePdf(301)}),/more than 300/);
 await rpc('reset');await assert.rejects(rpc('generate',{pages}),/no longer available/);
});
