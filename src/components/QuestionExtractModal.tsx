import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, AlertTriangle, Gift, CreditCard } from "lucide-react";
import { validatePdfMagicBytes, validateImageMagicBytes } from "@/lib/fileValidation";
import { validateExtractedQuestions } from "@/lib/questionParser";

const EXTRACTION_COST = 5;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtracted: (questions: any[], sourceFileName: string) => void;
  creditBalance: number;
  freeExtractionUsed: boolean;
  refreshProfile: () => Promise<void>;
};

type Step = "upload" | "confirm" | "extracting";

export default function QuestionExtractModal({
  open,
  onOpenChange,
  onExtracted,
  creditBalance,
  freeExtractionUsed,
  refreshProfile,
}: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const isFree = !freeExtractionUsed;
  const hasCredits = creditBalance >= EXTRACTION_COST;
  const canExtract = isFree || hasCredits;

  const resetState = () => {
    setStep("upload");
    setFile(null);
    setFileError(null);
    setExtracting(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen && !extracting) resetState();
    onOpenChange(isOpen);
  };

  const validateFile = useCallback(async (f: File): Promise<string | null> => {
    const isPdf = f.type === "application/pdf" || f.name.endsWith(".pdf");
    const isImage = f.type.startsWith("image/");

    if (!isPdf && !isImage) {
      return "Formato não suportado. Envie um PDF ou imagem (PNG, JPG).";
    }
    if (f.size > 20 * 1024 * 1024) {
      return "Arquivo muito grande. Máximo 20 MB.";
    }

    const bytes = new Uint8Array(await f.slice(0, 8).arrayBuffer());

    if (isPdf && !validatePdfMagicBytes(bytes)) {
      return "Arquivo PDF inválido ou corrompido.";
    }
    if (isImage && !validateImageMagicBytes(bytes)) {
      return "Arquivo de imagem inválido.";
    }

    return null;
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError(null);

    const error = await validateFile(f);
    if (error) {
      setFileError(error);
      return;
    }

    setFile(f);
    setStep("confirm");
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    setFileError(null);

    const error = await validateFile(f);
    if (error) {
      setFileError(error);
      return;
    }

    setFile(f);
    setStep("confirm");
  };

  const handleExtract = async () => {
    if (!file || !user || !canExtract) return;

    setStep("extracting");
    setExtracting(true);

    try {
      const isImage = file.type.startsWith("image/");
      let body: FormData | Record<string, unknown>;

      if (isImage) {
        const formData = new FormData();
        formData.append("file", file, file.name);
        body = formData;
      } else {
        const { parsePdf } = await import("@/lib/pdf-utils");
        const { pageImages, text } = await parsePdf(file);
        body = { pdfText: text, pdfFileName: file.name, pageImages };
      }

      const { data, error: invokeError } = await supabase.functions.invoke(
        "extract-questions",
        { body }
      );

      if (invokeError) {
        const status = (invokeError as any)?.context?.status;
        if (status === 402) {
          toast.error(`Créditos insuficientes. Saldo: ${data?.balance ?? creditBalance}. Necessário: ${EXTRACTION_COST}.`);
          resetState();
          return;
        }
        throw new Error((invokeError as any).message || "Falha na extração.");
      }

      const questions = validateExtractedQuestions(data.questions);

      if (questions.length === 0) {
        toast.error("Nenhuma questão identificável encontrada no documento.");
        resetState();
        return;
      }

      await refreshProfile();
      toast.success(`${questions.length} questão(ões) extraída(s) com sucesso!`);
      onExtracted(questions, data.source_file_name || file.name);
      handleClose(false);
    } catch (e: any) {
      toast.error(e.message || "Erro na extração");
      setStep("confirm");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Extrair Questões com IA</DialogTitle>
          <DialogDescription>
            Envie um PDF ou imagem de prova para extrair questões automaticamente.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            {!canExtract && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Saldo insuficiente. Você tem {creditBalance} crédito(s) e precisa de {EXTRACTION_COST}.
                  <br />
                  <span className="text-xs mt-1 block opacity-80">Adquira mais créditos para continuar extraindo.</span>
                </AlertDescription>
              </Alert>
            )}

            {isFree && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <Gift className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300">
                  <strong>Extração gratuita disponível!</strong> Sua primeira extração é por nossa conta.
                </p>
              </div>
            )}

            {!isFree && hasCredits && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Esta extração custa <strong>{EXTRACTION_COST} créditos</strong>. Seu saldo: <strong>{creditBalance}</strong>.
                </p>
              </div>
            )}

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                canExtract
                  ? "cursor-pointer hover:border-primary/50 hover:bg-muted/30"
                  : "opacity-50 cursor-not-allowed border-muted"
              }`}
              onClick={() => { if (canExtract) document.getElementById("extract-file-input")?.click(); }}
              onDrop={canExtract ? handleDrop : undefined}
              onDragOver={canExtract ? (e) => e.preventDefault() : undefined}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground mb-1">
                Clique ou arraste o arquivo aqui
              </p>
              <p className="text-xs text-muted-foreground">PDF ou imagem (PNG, JPG) • Máximo 20 MB</p>
              <input
                id="extract-file-input"
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
                disabled={!canExtract}
              />
            </div>

            {fileError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {fileError}
              </p>
            )}
          </div>
        )}

        {step === "confirm" && file && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>

            {isFree ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <Gift className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">Extração gratuita</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Nenhum crédito será descontado.</p>
                </div>
                <Badge variant="secondary" className="ml-auto bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                  Grátis
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Custo da extração</p>
                  <p className="text-xs text-muted-foreground">Saldo após: {creditBalance - EXTRACTION_COST} crédito(s)</p>
                </div>
                <Badge variant="outline" className="ml-auto">
                  {EXTRACTION_COST} créditos
                </Badge>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("upload")}>
                Trocar arquivo
              </Button>
              <Button className="flex-1" onClick={handleExtract}>
                <Sparkles className="w-4 h-4 mr-1" />
                {isFree ? "Extrair grátis" : `Extrair (${EXTRACTION_COST} créditos)`}
              </Button>
            </div>
          </div>
        )}

        {step === "extracting" && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Extraindo questões...</p>
              <p className="text-xs text-muted-foreground mt-1">A IA está analisando o documento. Isso pode levar alguns segundos.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
