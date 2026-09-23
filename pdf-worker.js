/* All assembly happens off the UI thread. Nothing in this worker uses the network. */
importScripts('./vendor/pdf-lib.min.js');
const { PDFDocument, degrees, PDFName } = PDFLib;
const files = new Map();
const normalizeRotation = value => ((value % 360) + 360) % 360;
self.onmessage = async ({ data: request }) => {
  const { requestId, action, payload } = request;
  try {
    let result;
    if (action === 'import') {
      const { id, kind, bytes } = payload;
      if (kind === 'pdf') {
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });
        if (!doc.getPageCount()) throw new Error('This PDF has no pages.');
        if (doc.getPageCount() > 300) throw new Error('This PDF has more than 300 pages. Please split it into smaller files.');
        // Flatten saved form appearances so copied pages keep the student's answers.
        const form = doc.getForm();
        if (form.hasXFA()) throw new Error('This PDF uses an interactive XFA form. Print it to a new PDF first.');
        if (form.getFields().length) form.flatten({ updateFieldAppearances: false });
        // No document or page actions are carried into the submission.
        for (const page of doc.getPages()) {
          page.node.delete(PDFName.of('AA'));
        }
        const normalized = await doc.save({ objectsPerTick: 30 });
        files.set(id, { kind, doc });
        result = { bytes: normalized, count: doc.getPageCount() };
        self.postMessage({ requestId, result }, [normalized.buffer]);
        return;
      }
      files.set(id, { kind, bytes, width: payload.width, height: payload.height });
      result = { count: 1 };
    } else if (action === 'remove') {
      files.delete(payload.id);
      result = true;
    } else if (action === 'reset') {
      files.clear();
      result = true;
    } else if (action === 'generate') {
      const { pages } = payload;
      if (!pages.length) throw new Error('Add at least one page before merging.');
      const output = await PDFDocument.create();
      output.setCreator('MergeFORGE');
      output.setProducer('MergeFORGE • local browser processing');
      const copied = new Map();
      // Copy each source's selected pages in one call to share its fonts/images.
      for (const id of new Set(pages.map(page => page.fileId))) {
        const source = files.get(id);
        if (!source) throw new Error('A source file is no longer available. Please add it again.');
        const group = pages.filter(page => page.fileId === id);
        if (source.kind === 'pdf') {
          const extracted = await output.copyPages(source.doc, group.map(page => page.sourceIndex));
          group.forEach((page, index) => copied.set(page.id, extracted[index]));
        }
      }
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const source = files.get(page.fileId);
        if (source.kind === 'pdf') {
          const resultPage = copied.get(page.id);
          resultPage.setRotation(degrees(normalizeRotation(resultPage.getRotation().angle + page.rotation)));
          output.addPage(resultPage);
        } else {
          const image = source.kind === 'png' ? await output.embedPng(source.bytes) : await output.embedJpg(source.bytes);
          const landscape = source.width > source.height;
          const width = landscape ? 792 : 612;
          const height = landscape ? 612 : 792;
          const scale = Math.min((width - 36) / source.width, (height - 36) / source.height);
          const resultPage = output.addPage([width, height]);
          resultPage.drawImage(image, { x: (width - source.width * scale) / 2, y: (height - source.height * scale) / 2, width: source.width * scale, height: source.height * scale });
          resultPage.setRotation(degrees(normalizeRotation(page.rotation)));
        }
        self.postMessage({ requestId, progress: Math.round((index + 1) / pages.length * 85), message: `Assembling page ${index + 1} of ${pages.length}…` });
      }
      self.postMessage({ requestId, progress: 90, message: 'Finishing your PDF…' });
      const bytes = await output.save({ objectsPerTick: 30 });
      self.postMessage({ requestId, result: { bytes } }, [bytes.buffer]);
      return;
    } else throw new Error('Unknown PDF operation.');
    self.postMessage({ requestId, result });
  } catch (error) {
    const expected = /This PDF (has|uses)|more than 300|at least one page|no longer available/.test(error.message || '');
    const message = /encrypt|password/i.test(String(error))
      ? 'This PDF is password-protected. Save an unlocked copy and add that instead.'
      : expected ? error.message : action === 'import'
      ? 'This PDF appears damaged or incomplete. Save a fresh PDF and try again.'
      : 'We couldn’t assemble this PDF. Try fewer pages or save a fresh copy of the source files.';
    self.postMessage({ requestId, error: message });
  }
};
