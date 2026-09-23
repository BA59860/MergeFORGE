export const normalizeRotation = angle => ((angle % 360) + 360) % 360;
export function moveItem(items, id, destination) {
  const from = items.findIndex(item => item.id === id);
  if (from < 0 || !Number.isInteger(destination)) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(destination, result.length)), 0, item);
  return result;
}
export function groupPages(files, pages) {
  return files.flatMap(file => pages.filter(page => page.fileId === file.id));
}
export function filename(value) {
  const cleaned = value.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 115);
  return `${cleaned || 'My_Assignment'}.pdf`;
}
