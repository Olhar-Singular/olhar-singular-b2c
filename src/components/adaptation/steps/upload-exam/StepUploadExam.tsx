import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { detectFileType } from "@/lib/utils/fileValidation";
import { parsePdf } from "@/lib/utils/pdf-utils";
import { extractDocxWithImages } from "@/lib/utils/docx-utils";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

type Props = {
  data: WizardData;
  updateData: (partial: Partial<WizardData>) => void;
  onNext: () => void;
  onPrev: () => void;
  onLoadingChange?: (loading: boolean) => void;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// pdf.js / JSZip throw raw English messages ("Invalid PDF structure.",
// "Corrupted zip: ..."); the teacher gets this instead, the detail stays in the console.
const PARSE_ERROR_MESSAGE =
  "Não foi possível ler este arquivo. Ele pode estar corrompido: abra no Word e salve de novo, ou exporte o PDF outra vez, e envie novamente.";

export function StepUploadExam({ data, updateData, onNext, onLoadingChange }: Props) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const focusDropzoneOnDetachRef = useRef(false);
  const attached = data.uploadedExam ?? null;

  // Removing the file unmounts the card holding the trash button, which would
  // drop keyboard focus on <body>. Once the dropzone is re-enabled (tabbable
  // again), hand focus to it so the teacher can pick the next file right away.
  useEffect(() => {
    if (attached || !focusDropzoneOnDetachRef.current) return;
    focusDropzoneOnDetachRef.current = false;
    dropzoneRef.current?.focus();
  }, [attached]);

  // Guards against a stray completion after this step is left mid-parse (Voltar
  // is disabled while processing, but the wizard's step pills / sidebar nav are
  // not) — without it, a parse that finishes AFTER the user has moved on would
  // still fire state updates against a screen they no longer expect to change.
  //
  // The app runs in <StrictMode>, which mounts effects twice (mount → cleanup
  // → mount). Setting the ref only via `useRef(true)` left it permanently
  // `false` after that throwaway first cleanup. Setting it to `true` INSIDE the
  // effect (not just the initial ref value) makes the second, real mount reset
  // it correctly.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Cancels the upload path and returns to the tabs (Colar Texto / Banco de Questões), same step. */
  function backToTabs() {
    updateData({ activityInputMode: "bank" });
  }

  function handleContinue() {
    /* v8 ignore next -- guard: the button only renders while a file is attached */
    if (!attached) return;
    onNext();
  }

  /** Detaches the current file, re-enabling the dropzone for a new upload. */
  function handleRemoveFile() {
    focusDropzoneOnDetachRef.current = true;
    updateData({ uploadedExam: null });
    setError("");
    setAnnouncement("Arquivo removido. Escolha outro arquivo para adaptar.");
  }

  async function handleFile(file: File) {
    setError("");
    setAnnouncement("");

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Arquivo muito grande (máximo 10MB).");
      return;
    }

    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const fileType = detectFileType(bytes);
    if (fileType !== "pdf" && fileType !== "docx") {
      setError("Envie um arquivo PDF ou Word (.docx).");
      return;
    }

    setProcessing(true);
    onLoadingChange?.(true);
    try {
      const { text, pageImages } =
        fileType === "pdf"
          ? await parsePdf(file)
          : await extractDocxWithImages(file).then((r) => ({ text: r.text, pageImages: r.images }));

      /* v8 ignore next -- both outcomes are exercised (see the "unmount while
         parsing" and "stores the locally-parsed file" tests); v8's branch
         instrumentation misattributes the fall-through hit on this exact shape. */
      if (!mountedRef.current) return;
      // Dropping the previous result is what makes a SECOND adaptation
      // possible: StepGenerate only generates while `data.result` is empty, so
      // a leftover one makes the Gerar step silently do nothing and land the
      // teacher back on the adaptation of the *previous* exam. Nothing is lost
      // — the row was already written server-side and stays in the history.
      updateData({
        uploadedExam: { fileName: file.name, fileType, text, pageImages, file },
        result: null,
      });
    } catch (e) {
      console.error("Exam parsing error:", e);
      if (!mountedRef.current) return;
      setError(PARSE_ERROR_MESSAGE);
    } finally {
      if (mountedRef.current) {
        setProcessing(false);
        onLoadingChange?.(false);
      }
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function openFilePicker() {
    if (!attached) fileRef.current?.click();
  }

  // The dashed area is the only way to pick a file. As a <div role="button"> it
  // gets no native Enter/Space activation, so the keyboard is wired by hand.
  function handleDropzoneKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    openFilePicker();
  }

  // The dropzone is busy while a file is attached or still being parsed.
  const dropDisabled = !!attached || processing;

  // preventDefault runs unconditionally: without it the browser's default for a
  // dropped file is to open it in the tab, taking the teacher out of the app.
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dropDisabled ? "none" : "copy";
    if (!dropDisabled) setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (dropDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Adaptar direto do arquivo</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Envie o arquivo (PDF ou Word): a atividade é adaptada automaticamente, inteira, preservando a
          ordem das questões e as imagens originais. Você já cai direto na edição da versão adaptada.
        </p>
      </div>

      <div
        ref={dropzoneRef}
        role="button"
        tabIndex={attached ? -1 : 0}
        aria-disabled={!!attached}
        aria-label="Escolher arquivo PDF ou Word"
        onClick={openFilePicker}
        onKeyDown={handleDropzoneKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          attached
            ? "cursor-not-allowed opacity-60"
            : dragging
              ? "cursor-pointer border-primary bg-primary/5"
              : "cursor-pointer hover:border-primary hover:bg-primary/5"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          data-upload-input
          disabled={!!attached}
          onChange={handleFileInputChange}
        />
        {processing ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Lendo o arquivo...</p>
            <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Pode levar alguns instantes, não feche esta aba.
            </p>
          </div>
        ) : attached ? (
          <div className="flex flex-col items-center gap-2 text-primary">
            <CheckCircle2 className="w-8 h-8" />
            <p className="text-sm font-medium">Arquivo pronto para adaptar</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {dragging ? "Solte o arquivo aqui" : "Arraste um PDF ou Word aqui, ou clique para escolher"}
            </p>
          </div>
        )}
      </div>

      {attached && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-medium truncate font-serif">{attached.fileName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remover arquivo"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={handleRemoveFile}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={backToTabs} disabled={processing}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        {attached && (
          <Button onClick={handleContinue}>
            Continuar
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default StepUploadExam;
