// Explicit ".js" so these pure modules can also be imported directly by Node.
import { MAX_FILE_SIZE_BYTES } from "./limits.js";

const PDF_MIME_TYPE = "application/pdf";

/**
 * Some browsers/OSes report an empty MIME type for PDFs (e.g. files dragged
 * from certain apps), so fall back to the extension only when type is "".
 */
export function isPdfFile(file) {
  if (!file) return false;
  if (file.type === PDF_MIME_TYPE) return true;
  return file.type === "" && /\.pdf$/i.test(file.name ?? "");
}

export function isFileTooLarge(file) {
  return file.size > MAX_FILE_SIZE_BYTES;
}

/**
 * True when a drag event is carrying files (as opposed to selected text or a
 * link). `types` is an array in current browsers and a DOMStringList in some
 * older ones, so normalise it before searching.
 */
export function isFileDrag(event) {
  const types = event?.dataTransfer?.types;
  return types ? Array.from(types).includes("Files") : false;
}
