const paths={upload:'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',plus:'M12 5v14M5 12h14',right:'m9 5 7 7-7 7',left:'m15 5-7 7 7 7',lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z',check:'m5 12 4 4L19 6',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',merge:'M4 3v4l8 6 8-6V3M12 13v8m-4-4 4 4 4-4'};
function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.plus}"/></svg>`;}

import { moveItem, groupPages, normalizeRotation, filename } from './model.js';
Object.assign(paths,{grip:'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',up:'m5 15 7-7 7 7',down:'m5 9 7 7 7-7',first:'M5 5h14m-14 13 7-7 7 7',last:'M5 19h14M5 6l7 7 7-7',rotateLeft:'M3 10a9 9 0 1 1 2 9M3 4v6h6',rotateRight:'M21 10a9 9 0 1 0-2 9M21 4v6h-6',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',close:'m6 6 12 12M6 18 18 6'});
Object.assign(paths,{layers:'m12 3 10 5-10 5L2 8zM2 13l10 5 10-5M2 18l10 5 10-5',shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-5',document:'M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h8',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',bulb:'M9 18h6M9 21h6M8 15a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3'});
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const state = { files: [], pages: [], step: 'add', revision: 0, finalRevision: -1, previewedRevision: -1, pageEdited: false, busy: false, finalDoc: null, finalBytes: null, finalUrl: null, previewIndex: 0, selected: null, undo: null };
const MAX_BYTES = 250 * 1024 * 1024;
const MAX_PAGES = 300;
const steps = ['add','files','pages','preview','merge'];
let pdfjs, worker, requestCounter = 0, fileCounter = 0, pageCounter = 0, previewTask, previewToken = 0;
let fileSortable, pageSortable;
const requests = new Map();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const esc = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function announce(message) { $('#live').textContent = ''; setTimeout(() => { $('#live').textContent = message; }, 30); }
function notice(messages) {
  $('#notices').replaceChildren();
  if (!messages?.length) return;
  const box = document.createElement('div'); box.className = 'notice';
  const list = document.createElement('ul');
  messages.forEach(message => { const item = document.createElement('li'); item.textContent = message; list.append(item); });
  const close = document.createElement('button'); close.className = 'icon-button'; close.setAttribute('aria-label','Dismiss message'); close.innerHTML = icon('close'); close.onclick = () => box.remove();
  box.append(list,close); $('#notices').append(box);
}
function progress(message, percent) {
  $('#progress-text').textContent = message;
  if (percent == null) $('#progress').removeAttribute('value'); else $('#progress').value = percent;
}
function busy(value, message='Working on your PDF…') {
  state.busy = value; $('#progress-panel').hidden = !value;
  all('.view,.steps,.workflow-footer,.utility,.intro,.undo-notice').forEach(element => { element.inert = value; });
  $('#workspace').setAttribute('aria-busy', String(value));
  if (value) progress(message);
}
function rpc(action, payload={}, transfer=[]) {
  return new Promise((resolve,reject) => {
    const requestId = ++requestCounter;
    requests.set(requestId,{resolve,reject});
    worker.postMessage({requestId,action,payload},transfer);
  });
}
function loadPdf(bytes) {
  const loading = pdfjs.getDocument({ data:bytes, cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href, cMapPacked:true, standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href, wasmUrl:new URL('./vendor/wasm/',import.meta.url).href, useWasm:false, enableXfa:false, isEvalSupported:false });
  loading.onPassword = () => { loading.destroy(); };
  return loading.promise;
}
function canvasBlob(canvas, type='image/png', quality) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This image could not be rendered. Try a smaller image.')),type,quality));
}
async function thumbnail(pdf, index) {
  const page = await pdf.getPage(index + 1);
  const base = page.getViewport({scale:1});
  const viewport = page.getViewport({scale:Math.min(360/base.width,450/base.height)});
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
  const url = URL.createObjectURL(await canvasBlob(canvas,'image/jpeg',.82));
  canvas.width = canvas.height = 0; page.cleanup();
  return url;
}
async function prepareImage(file, kind) {
  let bitmap;
  try { bitmap = await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch { throw new Error('This image could not be opened. Please save it as a JPG or PNG and try again.'); }
  try {
    if (bitmap.width * bitmap.height > 60_000_000) throw new Error('This photo is larger than 60 megapixels. Please resize it first.');
    // Bound very large phone images while retaining a generous reading resolution.
    const scale = Math.min(1, 6000 / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const bytes = new Uint8Array(await (await canvasBlob(canvas,kind==='png'?'image/png':'image/jpeg',.96)).arrayBuffer());
    const small = document.createElement('canvas'); const ratio = Math.min(360/canvas.width,450/canvas.height);
    small.width = Math.max(1,Math.round(canvas.width*ratio)); small.height = Math.max(1,Math.round(canvas.height*ratio)); small.getContext('2d').drawImage(canvas,0,0,small.width,small.height);
    const thumb = URL.createObjectURL(await canvasBlob(small,'image/jpeg',.82));
    const result = {bytes,width:canvas.width,height:canvas.height,thumb};
    canvas.width=canvas.height=small.width=small.height=0;
    return result;
  } finally { bitmap.close(); }
}
async function importFiles(input) {
  if (state.busy || !pdfjs) return;
  const chosen = [...input]; if (!chosen.length) return;
  discardUndo();
  const errors = []; let added = 0;
  busy(true,'Opening your files…'); notice([]);
  try {
    for (let index=0; index<chosen.length; index++) {
      const file = chosen[index]; const ext = file.name.split('.').pop().toLowerCase();
      if (!['pdf','jpg','jpeg','png'].includes(ext)) { errors.push(`${file.name}: Please use PDF, JPG, or PNG.${/docx?/i.test(ext)?' Save Word documents as PDF first.':''}`); continue; }
      if (!file.size) { errors.push(`${file.name}: This file is empty.`); continue; }
      if (state.files.reduce((sum,item)=>sum+item.size,0)+file.size>MAX_BYTES) { errors.push(`${file.name}: This would exceed 250 MB in one session. Please use smaller files.`); continue; }
      if (state.pages.length>=MAX_PAGES) { errors.push(`${file.name}: Keep each submission to 300 pages or fewer.`); continue; }
      const id = `file-${++fileCounter}`; const kind = ext==='pdf'?'pdf':ext==='png'?'png':'jpg';
      const pendingPages=[]; let pdf, image;
      try {
        progress(`Opening ${index+1} of ${chosen.length}: ${file.name}`);
        const signature = new Uint8Array(await file.slice(0,1024).arrayBuffer());
        const valid = kind==='pdf' ? new TextDecoder().decode(signature).includes('%PDF-') : kind==='png' ? signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71 : signature[0]===255&&signature[1]===216;
        if (!valid) throw new Error('The file contents do not match its extension. Save a fresh PDF, JPG, or PNG.');
        if (kind==='pdf') {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await rpc('import',{id,kind,bytes},[bytes.buffer]);
          if (state.pages.length+result.count>MAX_PAGES) throw new Error('This would exceed 300 pages. Please split your submission.');
          pdf = await loadPdf(result.bytes);
          for (let p=0;p<result.count;p++) {
            progress(`Making thumbnails: ${file.name} · page ${p+1} of ${result.count}`,Math.round((p+1)/result.count*100));
            pendingPages.push({id:`page-${++pageCounter}`,fileId:id,sourceIndex:p,rotation:0,thumb:await thumbnail(pdf,p)});
            await tick();
          }
        } else {
          image = await prepareImage(file,kind);
          await rpc('import',{id,kind,bytes:image.bytes,width:image.width,height:image.height},[image.bytes.buffer]);
          pendingPages.push({id:`page-${++pageCounter}`,fileId:id,sourceIndex:0,rotation:0,thumb:image.thumb});
        }
        const previous = state.files.filter(item=>item.name===file.name).length;
        // IDs are independent of names; labels help distinguish repeated names.
        const taken = new Set(state.files.map(item=>item.label));
        let copy=previous+1, label=file.name;
        while (taken.has(label)) label=`${file.name} (copy ${++copy-1})`;
        state.files.push({id,name:file.name,label,kind,size:file.size,count:pendingPages.length,thumb:pendingPages[0].thumb});
        state.pages.push(...pendingPages); added++;
      } catch (error) {
        for (const page of pendingPages) URL.revokeObjectURL(page.thumb);
        if (image && !pendingPages.length) URL.revokeObjectURL(image.thumb);
        await rpc('remove',{id});
        errors.push(`${file.name}: ${error.message||'This file could not be read. Try saving a new copy.'}`);
      } finally { if (pdf) await pdf.loadingTask.destroy(); }
    }
    if (added) { invalidate(); renderAll(); showStep('files'); announce(`Added ${added} ${added===1?'file':'files'}. ${state.pages.length} pages ready to arrange.`); }
    notice(errors);
  } finally { busy(false); $('#file-input').value=''; }
}
function invalidate() {
  state.revision++; state.previewedRevision=-1; state.finalRevision=-1;
  previewToken++; previewTask?.cancel(); previewTask=null;
  state.finalDoc?.loadingTask.destroy().catch(()=>{}); state.finalDoc=null; state.finalBytes=null;
  if (state.finalUrl) URL.revokeObjectURL(state.finalUrl);
  state.finalUrl=null; $('#download').removeAttribute('href');
  $('#success').hidden=true; $('#merge-settings').hidden=false;
}
function sourceCount(){ return new Set(state.pages.map(page=>page.fileId)).size; }
function countText(){ const n=sourceCount();return `${n} ${n===1?'file':'files'} · ${state.pages.length} ${state.pages.length===1?'page':'pages'}`; }
function renderNav() {
  all('[data-step]').forEach(button=>{
    const step=button.dataset.step;
    button.disabled=step!=='add'&&(!state.pages.length||(step==='merge'&&state.previewedRevision!==state.revision));
    if(step===state.step) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current');
    button.classList.toggle('done',steps.indexOf(step)<steps.indexOf(state.step));
    button.querySelector('span').innerHTML=steps.indexOf(step)<steps.indexOf(state.step)?icon('check'):String(steps.indexOf(step)+1);
  });
  $('#reset').disabled=!state.files.length&&!state.undo;
  $('#to-files').disabled=!state.pages.length;
  $('#added-summary').hidden=!state.pages.length; $('#added-summary').textContent=`${countText()} ready to arrange.`;
  $('#document-count').innerHTML=`${sourceCount()} ${sourceCount()===1?'file':'files'} <span>→</span> 1 PDF`;
  $('#workflow-footer').hidden=state.step==='add'||!state.pages.length||!$('#success').hidden;
  $('#next').hidden=state.step==='merge';
  $('#next').innerHTML=`${state.step==='files'?'Arrange pages':state.step==='pages'?'Preview your PDF':'Continue to merge'} ${icon('right')}`;
  $('#next').classList.toggle('glass',state.step==='preview');
  const backLabels={files:'Add files',pages:'Arrange files',preview:'Edit pages',merge:'Preview'};
  $('#back').innerHTML=`${icon('left')} ${backLabels[state.step]||'Back'}`;
  $('#next').disabled=state.step==='preview'&&state.previewedRevision!==state.revision;
  $('#footer-hint').textContent=`${state.pages.length} ${state.pages.length===1?'page':'pages'}, arranged by you.`;
  const headings={add:['Bring all your work together.','Notebook photos, scans, and typed work. Start with what you have.'],files:['Start with the big picture.','Order your files first. Fine-tune individual pages in the next step.'],pages:['Put every page in its place.','Photos, scans, typed work. One PDF, exactly how you want it.'],preview:['One last look. Then you’re ready.','Check the order, orientation, and readability before making your final PDF.'],merge:['Give your work a good send-off.','Choose a name that makes your assignment easy to find.']};
  $('#step-title').textContent=headings[state.step][0];
  $('#step-subtitle').textContent=headings[state.step][1];
  $('#undo-notice').hidden=!state.undo;
}
function showStep(step, focus=true) {
  state.step=step;
  all('.view').forEach(view=>view.hidden=view.id!==`${step}-view`);
  if(step==='merge') $('#merge-summary').textContent=`${sourceCount()} ${sourceCount()===1?'file':'files'} → 1 PDF with ${state.pages.length} ${state.pages.length===1?'page':'pages'}`;
  renderNav();
  if(focus) { const heading=$(`#${step}-view h2`);heading.tabIndex=-1;heading.focus({preventScroll:true}); if(window.scrollY>230) heading.scrollIntoView({block:'start',behavior:'instant'}); }
}
function fileCard(file,index) {
  const remaining=state.pages.filter(page=>page.fileId===file.id).length;
  return `<article class="file-card" role="listitem" data-id="${file.id}"><button class="drag-handle" aria-label="Drag ${esc(file.label)} to reorder" title="Drag to reorder">${icon('grip')}</button><img class="file-thumb" src="${file.thumb}" alt="First imported page" loading="lazy"><div class="file-info"><span class="file-number">FILE ${index+1}</span><h3>${esc(file.label)}</h3><p>${remaining} of ${file.count} ${file.count===1?'page':'pages'} · ${file.kind.toUpperCase()}</p></div><div class="file-actions"><button class="secondary" data-action="up" ${index===0?'disabled':''} aria-label="Move ${esc(file.label)} up">${icon('up')}Move up</button><button class="secondary" data-action="down" ${index===state.files.length-1?'disabled':''} aria-label="Move ${esc(file.label)} down">${icon('down')}Move down</button><button class="secondary remove" data-action="remove" aria-label="Remove ${esc(file.label)}">${icon('trash')}Remove</button></div></article>`;
}
function pageCard(page,index) {
  const file=state.files.find(file=>file.id===page.fileId);
  const selected=page.id===state.selected;
  const tool=(action,label,iconName,disabled=false)=>`<button class="icon-button ${action==='delete'?'remove':''}" data-action="${action}" ${disabled?'disabled':''} title="${label}" aria-label="${label} ${index+1}">${icon(iconName)}</button>`;
  const move=(action,label,iconName,disabled)=>`<button data-action="${action}" ${disabled?'disabled':''} aria-label="Move page ${index+1} ${label.toLowerCase()}">${icon(iconName)}${label}</button>`;
  return `<article class="page-card ${selected?'selected':''}" role="listitem" data-id="${page.id}" aria-label="Page ${index+1}, ${esc(file.label)}, original page ${page.sourceIndex+1}">
    <div class="page-top"><span class="order-number">${index+1}</span><button class="drag-handle" aria-label="Drag page ${index+1} to reorder" title="Drag to reorder">${icon('grip')}</button></div>
    <button class="page-image" data-action="select" aria-label="Select page ${index+1}" aria-pressed="${selected}"><img src="${page.thumb}" alt="Page ${page.sourceIndex+1} of ${esc(file.label)}" loading="lazy" class="${page.rotation%180?'quarter-turn':''}" style="transform:rotate(${page.rotation}deg)"></button>
    <div class="page-meta"><strong title="${esc(file.label)}">${esc(file.label)}</strong><p>${file.kind==='pdf'?`Original page ${page.sourceIndex+1}`:'Photo'}${page.rotation?` · rotated ${page.rotation}°`:''}</p></div>
    <div class="page-tools">${tool('earlier','Move earlier: page','left',index===0)}${tool('later','Move later: page','right',index===state.pages.length-1)}${tool('rotate-left','Rotate left: page','rotateLeft')}${tool('rotate-right','Rotate right: page','rotateRight')}${tool('delete','Delete page','trash')}</div>
    <details class="page-more"><summary>More moves<span class="sr-only"> for page ${index+1}</span></summary><div class="move-tools">${move('first','To start','first',index===0)}${move('last','To end','last',index===state.pages.length-1)}</div></details>
  </article>`;
}
function renderAll() {
  if(!state.pages.some(page=>page.id===state.selected))state.selected=state.pages[0]?.id||null;
  fileSortable?.destroy(); pageSortable?.destroy();
  $('#file-list').innerHTML=state.files.map(fileCard).join('');
  $('#page-list').innerHTML=state.pages.map(pageCard).join('');
  $('#page-count').textContent=`${state.pages.length} ${state.pages.length===1?'page':'pages'}`;
  $('#file-count').textContent=`${state.files.length} ${state.files.length===1?'file':'files'}`;
  $('#file-order-note').hidden=!state.pageEdited;
  const options={handle:'.drag-handle',animation:matchMedia('(prefers-reduced-motion: reduce)').matches?0:160,ghostClass:'sortable-ghost',chosenClass:'sortable-chosen',forceFallback:true,fallbackOnBody:true,fallbackTolerance:4,scrollSensitivity:65,scrollSpeed:14};
  fileSortable=new Sortable($('#file-list'),{...options,onEnd:event=>{if(event.oldIndex!==event.newIndex) moveFile(event.item.dataset.id,event.newIndex);}});
  pageSortable=new Sortable($('#page-list'),{...options,onEnd:event=>{if(event.oldIndex!==event.newIndex) movePage(event.item.dataset.id,event.newIndex);}});
  renderNav();
}
function focusAction(container,id,action) {
  const card=$(`${container} [data-id="${id}"]`);
  const button=card?.querySelector(`[data-action="${action}"]:not(:disabled)`)||card?.querySelector('.drag-handle');
  button?.focus({preventScroll:true});
}
function moveFile(id,index,action) {
  state.files=moveItem(state.files,id,index); state.pages=groupPages(state.files,state.pages); invalidate();renderAll();focusAction('#file-list',id,action);announce(`File moved to position ${index+1}. Its pages are grouped together.`);
}
function movePage(id,index,action) {
  state.selected=id;state.pages=moveItem(state.pages,id,index); state.pageEdited=true;invalidate();renderAll();focusAction('#page-list',id,action);announce(`Page moved to position ${index+1} of ${state.pages.length}.`);
}
function discardUndo() {
  const undo=state.undo;if(!undo)return;state.undo=null;$('#undo-notice').hidden=true;
  const retained=new Set([...state.pages.map(page=>page.thumb),...state.files.map(file=>file.thumb)]);
  if(!retained.has(undo.page.thumb))URL.revokeObjectURL(undo.page.thumb);
  if(!state.files.some(file=>file.id===undo.file.id)){
    URL.revokeObjectURL(undo.file.thumb);rpc('remove',{id:undo.file.id}).catch(error=>notice([error.message]));
  }
}
$('#undo-delete').onclick=()=>{
  const undo=state.undo;if(!undo||state.busy)return;
  if(!state.files.some(file=>file.id===undo.file.id))state.files.splice(Math.min(undo.fileIndex,state.files.length),0,undo.file);
  state.pages.splice(Math.min(undo.index,state.pages.length),0,undo.page);
  state.selected=undo.page.id;state.undo=null;state.pageEdited=true;invalidate();renderAll();showStep('pages',false);focusAction('#page-list',undo.page.id,'delete');announce('Page restored.');
};
function removeFile(id) {
  discardUndo();
  const file=state.files.find(file=>file.id===id);const index=state.files.indexOf(file);
  const thumbs=new Set(state.pages.filter(page=>page.fileId===id).map(page=>page.thumb));thumbs.add(file.thumb);thumbs.forEach(url=>URL.revokeObjectURL(url));
  state.files=state.files.filter(file=>file.id!==id);state.pages=state.pages.filter(page=>page.fileId!==id);rpc('remove',{id}).catch(error=>notice([error.message]));invalidate();renderAll();
  if(!state.pages.length) showStep('add');else focusAction('#file-list',state.files[Math.min(index,state.files.length-1)].id,'remove');announce(`Removed ${file.label}.`);
}
$('#file-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||state.busy)return;const id=button.closest('[data-id]').dataset.id;const index=state.files.findIndex(file=>file.id===id);const action=button.dataset.action;
  if(action==='remove')removeFile(id);else moveFile(id,index+(action==='up'?-1:1),action);
});
$('#page-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||state.busy)return;const id=button.closest('[data-id]').dataset.id;const index=state.pages.findIndex(page=>page.id===id);const page=state.pages[index];const action=button.dataset.action;
  state.selected=id;
  if(action==='select') { all('.page-card').forEach(card=>{const selected=card.dataset.id===id;card.classList.toggle('selected',selected);card.querySelector('.page-image').setAttribute('aria-pressed',String(selected));});return; }
  if(action==='delete') {
    discardUndo();
    const file=state.files.find(file=>file.id===page.fileId);
    state.undo={page,file,index,fileIndex:state.files.indexOf(file)};
    state.pages.splice(index,1);
    if(!state.pages.some(item=>item.fileId===file.id))state.files=state.files.filter(item=>item.id!==file.id);
    state.selected=state.pages[Math.min(index,state.pages.length-1)]?.id||null;
    state.pageEdited=true;invalidate();renderAll();
    if(!state.pages.length)showStep('add',false);
    $('#undo-delete').focus({preventScroll:true});
    announce(`Deleted page ${index+1}. ${state.pages.length} pages remaining.`);
  } else if(action.startsWith('rotate')) {
    page.rotation=normalizeRotation(page.rotation+(action==='rotate-left'?-90:90));state.pageEdited=true;invalidate();renderAll();focusAction('#page-list',id,action);announce(`Page ${index+1} rotated ${action==='rotate-left'?'left':'right'}.`);
  } else movePage(id,action==='first'?0:action==='last'?state.pages.length-1:index+(action==='earlier'?-1:1),action);
});
async function buildFinal() {
  if(state.finalRevision===state.revision&&state.finalDoc)return;
  const result=await rpc('generate',{pages:state.pages.map(({id,fileId,sourceIndex,rotation})=>({id,fileId,sourceIndex,rotation}))});
  state.finalBytes=result.bytes;
  state.finalDoc=await loadPdf(result.bytes.slice());
  state.finalUrl=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
  state.finalRevision=state.revision;state.previewIndex=0;
}
async function renderPreview() {
  const token=++previewToken;const doc=state.finalDoc;if(!doc)return;
  const oldTask=previewTask;oldTask?.cancel();
  if(oldTask)try{await oldTask.promise;}catch{}
  const index=state.previewIndex;
  $('#preview-prev').disabled=index===0;$('#preview-next').disabled=index===state.pages.length-1;$('#preview-page').max=state.pages.length;$('#preview-page').value=index+1;
  $('#preview-total').textContent=`${state.pages.length} ${state.pages.length===1?'page':'pages'}, one PDF.`;
  const source=state.pages[index];const file=state.files.find(file=>file.id===source.fileId);
  $('#preview-source').textContent=file.label;$('#preview-caption').textContent=`Final page ${index+1} · original page ${source.sourceIndex+1}`;
  $('#preview-error').hidden=true;
  try{
    const page=await doc.getPage(index+1);if(token!==previewToken)return;
    const base=page.getViewport({scale:1});
    const available=Math.max(240,$('.preview-paper').clientWidth-48);
    const scale=Math.min(2,available*Math.min(devicePixelRatio||1,2)/base.width,1800/Math.max(base.width,base.height));
    const viewport=page.getViewport({scale});const canvas=$('#preview-canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-label',`Final PDF, page ${index+1} of ${state.pages.length}`);
    previewTask=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'});
    await previewTask.promise;if(token!==previewToken)return;
    previewTask=null;state.previewedRevision=state.revision;renderNav();
    announce(`Preview page ${index+1} of ${state.pages.length}.`);
  }catch(error){if(error.name==='RenderingCancelledException'||token!==previewToken)return;$('#preview-error').hidden=false;$('#preview-error').textContent='This page could not be previewed. Go back and remove or replace it before merging.';state.previewedRevision=-1;renderNav();throw error;}
}
async function navigate(step) {
  if(state.busy||(!state.pages.length&&step!=='add'))return;
  if(step==='preview') {
    busy(true,'Preparing your final PDF preview…');notice([]);
    try{await buildFinal();showStep('preview',false);await renderPreview();}
    catch(error){notice([`We couldn’t make the preview. ${error.message||'Try smaller files or save a fresh copy of the PDF.'}`]);}
    finally{busy(false);const heading=$(`#${state.step}-view h2`);heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }else if(step==='merge'&&state.previewedRevision!==state.revision){await navigate('preview');}
  else showStep(step);
}
all('[data-step]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.step)));
$('#to-files').onclick=()=>navigate('files');$('#edit-pages').onclick=()=>navigate('pages');
$('#back').onclick=()=>navigate(steps[steps.indexOf(state.step)-1]);
$('#next').onclick=()=>navigate(steps[steps.indexOf(state.step)+1]);
$('#back-edit').onclick=()=>{invalidate();renderAll();navigate('pages');};
$('#preview-prev').onclick=()=>{if(state.previewIndex>0){state.previewIndex--;renderPreview().catch(()=>{});}};
$('#preview-next').onclick=()=>{if(state.previewIndex<state.pages.length-1){state.previewIndex++;renderPreview().catch(()=>{});}};
$('#preview-page').onchange=event=>{const number=Number(event.target.value);state.previewIndex=Number.isInteger(number)?Math.max(0,Math.min(state.pages.length-1,number-1)):0;renderPreview().catch(()=>{});};
$('#merge-button').onclick=async()=>{
  if(state.busy||state.finalRevision!==state.revision||state.previewedRevision!==state.revision)return;
  const name=filename($('#filename').value);$('#filename').value=name.slice(0,-4);
  $('#download').href=state.finalUrl;$('#download').download=name;
  $('#success-message').textContent=`Success! ${sourceCount()} ${sourceCount()===1?'file became':'files became'} 1 PDF containing ${state.pages.length} ${state.pages.length===1?'page':'pages'}.`;
  $('#download-details').textContent=`${name} · ${(state.finalBytes.byteLength/1024/1024).toFixed(2)} MB`;
  $('#merge-settings').hidden=true;$('#success').hidden=false;renderNav();$('#download').focus();announce($('#success-message').textContent);
};
function pickFiles(){if(!state.busy)$('#file-input').click();}
$('#add-files').onclick=pickFiles;all('.add-more').forEach(button=>button.onclick=pickFiles);
$('#file-input').onchange=event=>importFiles(event.target.files);
let dragDepth=0;
document.addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('#dropzone').classList.add('drag-over');}});
document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=state.busy?'none':'copy';}});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('#dropzone').classList.remove('drag-over');}});
document.addEventListener('drop',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth=0;$('#dropzone').classList.remove('drag-over');if(!state.busy)importFiles(event.dataTransfer.files);}});
$('#reset').onclick=()=>{ $('#reset-dialog').returnValue=''; $('#reset-dialog').showModal(); };
$('#reset-dialog').addEventListener('close',async()=>{
  if($('#reset-dialog').returnValue!=='reset')return;
  busy(true,'Clearing this tab…');
  try{
    discardUndo();state.selected=null;
    const thumbs=new Set([...state.pages.map(page=>page.thumb),...state.files.map(file=>file.thumb)]);thumbs.forEach(url=>URL.revokeObjectURL(url));
    await rpc('reset');invalidate();state.files=[];state.pages=[];state.pageEdited=false;$('#filename').value='My_Assignment';notice([]);renderAll();showStep('add',false);
  }finally{busy(false);$('#add-files').focus();}
});
window.addEventListener('beforeunload',event=>{if(state.files.length||state.undo){event.preventDefault();event.returnValue='';}});
async function initialize(){
  busy(true,'Getting MergeFORGE ready…');
  try{
    if(location.protocol==='file:')throw new Error('Open MergeFORGE through GitHub Pages or a local web server. See the README for the one-step local preview.');
    pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
    worker=new Worker(new URL('./pdf-worker.js',import.meta.url));
    worker.onmessage=({data})=>{const pending=requests.get(data.requestId);if(!pending)return;if(data.progress!=null){progress(data.message,data.progress);return;}requests.delete(data.requestId);if(data.error)pending.reject(new Error(data.error));else pending.resolve(data.result);};
    worker.onerror=()=>{requests.forEach(pending=>pending.reject(new Error('The PDF processor stopped. Reload this tab and try smaller files.')));requests.clear();notice(['The PDF processor could not start or ran out of memory. Reload this tab and try smaller files.']);};
    // Ensure the worker and its bundled library have loaded before enabling import.
    await rpc('reset');
    if(typeof Sortable==='undefined')throw new Error('The page-ordering library could not load. Check that the vendor folder is included.');
    renderAll();
    const context=document.modelContext;
    if(context?.registerTool){
      const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});
      Promise.resolve(context.registerTool({name:'read_mergeforge_order',title:'Read current PDF order',description:'Read filenames and page order already imported in this tab. Does not read page contents or download a PDF.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||Object.keys(input).length)throw new Error('No input fields are supported.');return {step:state.step,pages:state.pages.map((page,index)=>({position:index+1,source:state.files.find(file=>file.id===page.fileId).label,originalPage:page.sourceIndex+1,rotation:page.rotation}))};}},{signal:controller.signal})).catch(()=>{});
    }
  }catch(error){notice([error.message||'MergeFORGE could not load. Try refreshing in a current browser.']);all('#add-files,.add-more').forEach(button=>button.disabled=true);}
  finally{busy(false);}
}
initialize();
