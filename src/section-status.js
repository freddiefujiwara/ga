// Per-section load states for the parts of the dashboard that
// fill in after the first reveal (the parallel loads): until a
// section's own response lands it carries the loading line —
// the same wording and muted look as the SNS sections' status
// lines — and a failed load ends on the failure line instead of
// sitting on the loading line, or on a misleading empty state,
// forever. The section renderers replace their container's
// contents wholesale, so a state line disappears on its own the
// moment real content renders.

export const SECTION_LOADING_TEXT = "読み込み中…";
export const SECTION_FAILED_TEXT = "取得できませんでした";

// Builds the status node in the shape the container takes: a
// list item for a ranking list, a full-width row for a table
// body (the column count comes from the table's own header
// cells, so no caller has to repeat it), a muted paragraph
// anywhere else.
function statusNode(container, text, failed) {
  const doc = container.ownerDocument;
  const className = "section-status" + (failed ? " section-failed" : "");
  if (container.tagName === "TBODY") {
    const headerCells =
      container.closest("table")?.querySelectorAll("thead th").length ?? 0;
    const tr = doc.createElement("tr");
    const td = doc.createElement("td");
    td.colSpan = headerCells > 0 ? headerCells : 1;
    td.className = className;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }
  if (container.tagName === "OL" || container.tagName === "UL") {
    const li = doc.createElement("li");
    li.className = className;
    li.textContent = text;
    return li;
  }
  const p = doc.createElement("p");
  p.className = "meta " + className;
  p.textContent = text;
  return p;
}

// Replaces the container's contents with the status line. The
// wording defaults to the shared lines; a caller with a more
// specific message on hand (the blog genre section's tag-map
// note is one) passes its own.
export function setSectionLoading(
  container,
  text = SECTION_LOADING_TEXT,
) {
  container.innerHTML = "";
  container.appendChild(statusNode(container, text, false));
}

export function setSectionFailed(container, text = SECTION_FAILED_TEXT) {
  container.innerHTML = "";
  container.appendChild(statusNode(container, text, true));
}
