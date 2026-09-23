# v0.1 verification

Verified on September 23, 2026 with synthetic student-work fixtures; no real student files were used.

## Automated checks

`node --test tests/core.test.mjs` passes four suites covering:

- Deterministic page moves, file grouping, bounds, rotation normalization, and safe filenames.
- Mixed PDF/image assembly, deleted-page omission, native PDF dimensions, and cumulative rotations.
- Saved standard form appearances flattened before pages are copied.
- A reversed 100-page PDF, reset/removal cleanup, empty output rejection, invalid PDFs, and the 300-page limit.

## Browser workflow checked

In the Codex Chromium browser, imported a three-page PDF, a portrait JPEG, and a landscape PNG. Moved the JPEG's file earlier; rotated that photo right; moved the PNG page to the start; deleted the first typed page; and dragged the third typed page into second place. Numbers updated with each move.

The actual downloaded PDF was independently parsed and verified:

| Final page | Expected content | PDF rotation |
| --- | --- | --- |
| 1 | Landscape PNG | 0° |
| 2 | Original typed page 3 | 90° inherited from source |
| 3 | Portrait JPEG | 90° added in MergeFORGE |
| 4 | Original typed page 2 | 0° |

Confirmed four pages, both embedded images, correct typed-page text, landscape/portrait page dimensions, and omission of the deleted typed page. The success screen reported “3 files became 1 PDF containing 4 pages.” Preview navigation showed those same generated pages before export. Going back to edit removed the stale download and required a fresh preview.

Additional checks: repeated filenames receive separate cards and copy labels; add-more preserves existing page order; valid files continue importing alongside rejected DOCX, password-protected PDF, damaged PDF, and empty PNG files; EXIF-oriented JPEG and saved form PDF import successfully; removing a file removes its pages; reset cancellation preserves work; reset confirmation returns to an empty workspace.

Responsive checks cover desktop, 390px, and 320px viewports. The smallest viewport uses one thumbnail column; page action buttons retain 44px touch targets. Drag handles are pointer/touch enabled with SortableJS, and all reordering has visible button alternatives. Native phone touch behavior and Safari/Firefox were not tested on physical devices.

The read-only WebMCP order tool was called successfully; unexpected input was intentionally rejected without changing state.

## Approved-design rebuild

The September 23 design rebuild was verified again in Chromium after applying the charcoal, blue, and orange interface. The Word reminder, metallic wordmark, outlined steps, glassy Continue to merge button, and final privacy/upload wording are present. CFL and Canvas references were removed from the interface and README.

Repeated the mixed PDF/JPEG/PNG workflow with file moves, real pointer dragging, rotation, page deletion, final preview navigation, filename entry, and an actual download. Independently parsed `MergeFORGE_Rebuild_QA.pdf`: it contains the same four-page sequence and rotations listed above, both images, and no deleted typed page. Editing afterward cleared the old download and disabled Merge until a fresh preview.

New Undo checks: deleting and restoring a single-photo file, restoring its position and rotation, deleting all remaining pages, then restoring the last page and successfully generating a new preview. Start over clears the Undo state. Also checked Word-file rejection alongside successful valid imports, keyboard Earlier/Later and To end controls, selection highlights, and the More moves disclosure.

Checked contact-sheet widths of 320, 390, 480, 540, 760, 820, 1005, and 1200 pixels: no horizontal overflow, and every page action is at least 44 by 44 pixels. Preview and Merge also fit at 320 pixels. No browser warnings or errors were recorded during the mixed-file run. All four automated core tests still pass. These are browser viewport checks, not physical-device certification.

## Repeat before a release

1. Serve the full folder over HTTP, including `vendor/`, and open the app in a current browser.
2. Import a multipage PDF and two differently oriented photos. Include the same filename twice.
3. Change whole-file order, then interleave individual pages using drag handles and every move button. Confirm numbering and keyboard focus.
4. Rotate pages left/right, delete a page, and add another file. Check that the order and edits are retained.
5. Return to Arrange files and move a file. Confirm all remaining pages regroup as the notice describes.
6. Preview every page, set a filename with and without `.pdf`, merge, download, and open the result in a separate PDF reader.
7. Edit after merging; confirm the old download disappears and the regenerated output reflects the change.
8. Try unsupported, empty, damaged, and password-protected files alongside valid files. Confirm friendly messages and successful valid imports.
9. Cancel and confirm Start over, test at 320px and 390px, test keyboard-only navigation, and test on a real phone before broad classroom rollout.

The 100-page automated case exercises assembly rather than measuring real-world phone memory limits. The session limits are guardrails, not a guarantee for every device or PDF encoding. Optional image compression is outside v0.1.
