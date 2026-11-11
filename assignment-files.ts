import "server-only";

export const MAX_ASSIGNMENT_BYTES = 8 * 1024 * 1024; // 8 MB

export const MIME: Record<"pdf" | "docx", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Accepts only real PDF and Word (.docx) files: the extension must match AND the
 * file contents must look like that format (a renamed file is refused).
 */
export function detectAssignmentType(fileName: string, bytes: Buffer): "pdf" | "docx" | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    // PDF files start with "%PDF-" (allowing a little leading junk, as readers do).
    return bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")) ? "pdf" : null;
  }
  if (ext === "docx") {
    // .docx is a ZIP archive containing a word/ folder.
    const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    return isZip && bytes.includes(Buffer.from("word/")) ? "docx" : null;
  }
  return null;
}

/** A filename safe to send back in a download header. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/\r\n"]/g, "_").replace(/[^\x20-\x7e]/g, "_").trim();
  return cleaned.slice(-150) || "assignment";
}

// ---------- General document / image checks (handouts, payment proofs) ----------
export type DocType = "pdf" | "docx" | "pptx" | "jpg" | "png";

export const DOC_MIME: Record<DocType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  png: "image/png",
};

/** Extension AND contents must match one of the allowed types (a renamed file is refused). */
export function detectFileType(fileName: string, bytes: Buffer, allowed: DocType[]): DocType | null {
  let ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpeg") ext = "jpg";
  if (!(allowed as string[]).includes(ext)) return null;
  const zip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  switch (ext) {
    case "pdf":
      return bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")) ? "pdf" : null;
    case "docx":
      return zip && bytes.includes(Buffer.from("word/")) ? "docx" : null;
    case "pptx":
      return zip && bytes.includes(Buffer.from("ppt/")) ? "pptx" : null;
    case "jpg":
      return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpg" : null;
    case "png":
      return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "png" : null;
    default:
      return null;
  }
}
