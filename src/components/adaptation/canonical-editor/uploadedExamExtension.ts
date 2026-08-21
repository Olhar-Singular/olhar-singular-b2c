/**
 * UploadedExamExtension — exposes the raw uploaded file (Adaptar direto do
 * arquivo only) to NodeViews via `editor.storage.uploadedExam`.
 *
 * NodeViews (ImageNodeView) only receive Tiptap's own NodeViewProps, not
 * arbitrary React props from their logical ancestors — `editor.storage` is
 * the established way this codebase hands editor-wide context down to them
 * (see OriginalDocExtension). Configured once per Revisar session via
 * `.configure({ file, pageImages, userId })`; all stay `null`/`[]`/`null` for
 * adaptations built from the Banco de Questões (no uploaded file to compare
 * against). `userId` rides along here too — ImageNodeView's upload-cropped-
 * image step needs it, and this keeps that NodeView free of its own useAuth()
 * dependency (it previously had one; that made it crash when mounted outside
 * an AuthProvider, e.g. in CanonicalEditor.realdom.test.tsx).
 */

import { Extension } from "@tiptap/core";

export type UploadedExamOptions = {
  file: File | null;
  pageImages: string[];
  userId: string | null;
};

export const UploadedExamExtension = Extension.create<UploadedExamOptions>({
  name: "uploadedExam",

  addOptions() {
    return {
      file: null,
      pageImages: [],
      userId: null,
    };
  },

  addStorage() {
    return {
      file: this.options.file,
      pageImages: this.options.pageImages,
      userId: this.options.userId,
    };
  },
});

export default UploadedExamExtension;
