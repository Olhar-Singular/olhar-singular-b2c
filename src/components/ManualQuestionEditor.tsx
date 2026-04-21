import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Upload,
  Crop,
  X,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parsePdf } from "@/lib/pdf-utils";
import { extractDocxText } from "@/lib/docx-utils";
import { detectFileType } from "@/lib/fileValidation";
import { dataUrlToBlob } from "@/lib/extraction-utils";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import ImagePreviewDialog from "@/components/ImagePreviewDialog";
import QuestionRichEditor, { htmlToText } from "@/components/QuestionRichEditor";
import "katex/dist/katex.min.css";

const subjects = [
  "Física", "Matemática", "Química", "Biologia", "Português",
  "História", "Geografia", "Inglês", "Ciências", "Arte", "Ed. Física", "Geral",
];

type ManualQuestion = {
  text: string;
  subject: string;
  topic: string;
  options: string[];
  correct_answer: number;
  resolution: string;
  difficulty: string;
  imageUrl: string | null;
  isObjective: boolean;
  saved: boolean;
  saving: boolean;
};

const emptyQuestion = (): ManualQuestion => ({
  text: "",
  subject: "Geral",
  topic: "",
  options: ["", "", "", "", ""],
  correct_answer: -1,
  resolution: "",
  difficulty: "medio",
  imageUrl: null,
  isObjective: true,
  saved: false,
  saving: false,
});

type Props = {
  file: File;
  onFinish: () => void;
};

export default function ManualQuestionEditor({ file, onFinish }: Props) {
  const { user } = useAuth();

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [docxText, setDocxText] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [zoom, setZoom] = useState(150);
  const [fileType, setFileType] = useState<"pdf" | "docx" | null>(null);

  const [questions, setQuestions] = useState<ManualQuestion[]>([emptyQuestion()]);
  const [activeQ, setActiveQ] = useState(0);
  const [savingAll, setSavingAll] = useState(false);

  const [cropperOpen, setCropperOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingDoc(true);
      try {
        const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        const type = detectFileType(bytes);
        setFileType(type as "pdf" | "docx");

        if (type === "pdf") {
          const result = await parsePdf(file);
          setPageImages(result.pageImages);
        } else if (type === "docx") {
          const text = await extractDocxText(file);
          setDocxText(text);
        }
      } catch (e: any) {
        toast.error("Erro ao processar arquivo", { description: e.message });
      } finally {
        setLoadingDoc(false);
      }
    })();
  }, [file]);

  const updateQuestion = useCallback((index: number, field: keyof ManualQuestion, value: any) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  }, []);

  const updateOption = useCallback((qIndex: number, optIndex: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const newOpts = [...q.options];
      newOpts[optIndex] = value;
      return { ...q, options: newOpts };
    }));
  }, []);

  const addQuestion = () => {
    setQuestions(prev => [...prev, emptyQuestion()]);
    setActiveQ(questions.length);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) {
      setQuestions([emptyQuestion()]);
      setActiveQ(0);
      return;
    }
    setQuestions(prev => prev.filter((_, i) => i !== index));
    setActiveQ(prev => Math.min(prev, questions.length - 2));
  };

  const handleImageUpload = (index: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) {
        toast.error("Imagem muito grande — máximo 5 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => updateQuestion(index, "imageUrl", reader.result as string);
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const handleSaveOne = async (index: number) => {
    if (!user) return;
    const q = questions[index];
    const textContent = htmlToText(q.text).trim();
    if (!textContent) {
      toast.error("Enunciado vazio");
      return;
    }

    updateQuestion(index, "saving", true);
    try {
      const hasOptions = q.isObjective && q.options.some(o => o.trim());
      const source = fileType === "pdf" ? "pdf_extract" : "docx_extract";

      let imageUrl: string | null = q.imageUrl;
      if (imageUrl && imageUrl.startsWith("data:")) {
        const blob = dataUrlToBlob(imageUrl);
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
        const { error: upErr } = await supabase.storage
          .from("question-images")
          .upload(fileName, blob, { contentType: "image/png" });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(fileName);
          imageUrl = publicUrl;
        } else {
          imageUrl = null;
        }
      }

      const row = {
        text: q.text,
        subject: q.subject,
        topic: q.topic || null,
        options: hasOptions ? q.options.filter(o => o.trim()) : null,
        correct_answer: hasOptions && q.correct_answer >= 0 ? q.correct_answer : null,
        resolution: q.resolution || null,
        difficulty: q.difficulty,
        source,
        source_file_name: file.name,
        image_url: imageUrl,
        created_by: user.id,
      };

      const { error } = await (supabase.from as any)("question_bank").insert([row]);
      if (error) throw error;

      updateQuestion(index, "saved", true);
      updateQuestion(index, "saving", false);
      toast.success(`Questão ${index + 1} salva!`);
    } catch (e: any) {
      updateQuestion(index, "saving", false);
      toast.error("Erro ao salvar", { description: e.message });
    }
  };

  const handleSaveAll = async () => {
    const unsaved = questions.map((q, i) => ({ q, i })).filter(({ q }) => !q.saved && htmlToText(q.text).trim());
    if (unsaved.length === 0) {
      toast.error("Nenhuma questão para salvar");
      return;
    }
    setSavingAll(true);
    for (const { i } of unsaved) {
      await handleSaveOne(i);
    }
    setSavingAll(false);
  };

  const savedCount = questions.filter(q => q.saved).length;
  const unsavedCount = questions.filter(q => !q.saved && htmlToText(q.text).trim()).length;
  const q = questions[activeQ];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onFinish}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Edição Manual</h1>
            <p className="text-xs text-muted-foreground">{file.name} • {questions.length} questão(ões) • {savedCount} salva(s)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onFinish}>{savedCount > 0 ? "Concluir" : "Cancelar"}</Button>
          <Button onClick={handleSaveAll} disabled={savingAll || unsavedCount === 0}>
            {savingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            Salvar todas ({unsavedCount})
          </Button>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-lg border">
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full flex flex-col bg-muted/30">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
              <span className="text-sm font-medium text-foreground">Documento Original</span>
              {fileType === "pdf" && pageImages.length > 0 && (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.max(50, z - 25))}>
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground w-10 text-center">{zoom}%</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.min(300, z + 25))}>
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground mx-1">|</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{currentPage + 1}/{pageImages.length}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={currentPage >= pageImages.length - 1} onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingDoc ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Processando documento...</span>
                </div>
              ) : fileType === "pdf" && pageImages.length > 0 ? (
                <img
                  src={pageImages[currentPage]}
                  alt={`Página ${currentPage + 1}`}
                  className="mx-auto rounded shadow-sm"
                  style={{ width: `${zoom}%`, maxWidth: "none" }}
                  draggable={false}
                />
              ) : fileType === "docx" && docxText ? (
                <div className="bg-background rounded p-4 text-sm whitespace-pre-wrap leading-relaxed text-foreground select-text cursor-text">
                  {docxText}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">Não foi possível renderizar o documento.</p>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full flex flex-col bg-background">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-medium text-foreground">Editor de Questões</span>
              <Button size="sm" variant="outline" onClick={addQuestion}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nova questão
              </Button>
            </div>

            <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto">
              {questions.map((qItem, i) => (
                <div key={i} className="flex items-center shrink-0">
                  <Button
                    size="sm"
                    variant={activeQ === i ? "default" : "outline"}
                    className={`text-xs h-7 rounded-r-none ${qItem.saved ? "border-green-500" : ""}`}
                    onClick={() => setActiveQ(i)}
                  >
                    Q{i + 1}
                    {qItem.saved && <CheckCircle2 className="w-3 h-3 ml-1 text-green-300" />}
                  </Button>
                  {!qItem.saved && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-6 px-0 rounded-l-none border-l-0 text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); removeQuestion(i); }}
                      aria-label={`Remover questão ${i + 1}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              {q && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {q.saved && <Badge className="bg-green-600 text-white">✓ Salva</Badge>}
                    {!q.saved && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={q.isObjective}
                          onCheckedChange={v => updateQuestion(activeQ, "isObjective", v)}
                        />
                        <Label className="text-xs text-muted-foreground cursor-pointer">
                          {q.isObjective ? "Objetiva" : "Dissertativa"}
                        </Label>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs">Enunciado *</Label>
                    <QuestionRichEditor
                      value={q.text}
                      onChange={(html) => updateQuestion(activeQ, "text", html)}
                      placeholder="Cole ou digite o enunciado da questão..."
                      minHeight={100}
                      disabled={q.saved}
                    />
                  </div>

                  {q.imageUrl ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Imagem anexada</Label>
                      <div
                        className="relative inline-block cursor-zoom-in group"
                        onClick={() => setPreviewImageUrl(q.imageUrl)}
                      >
                        <img src={q.imageUrl} alt="Imagem da questão" className="max-h-40 rounded border" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded">
                          <Search className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </div>
                      </div>
                      {!q.saved && (
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => updateQuestion(activeQ, "imageUrl", null)}>
                            <X className="w-3 h-3 mr-1" /> Remover
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleImageUpload(activeQ)}>
                            <Upload className="w-3 h-3 mr-1" /> Trocar
                          </Button>
                          {fileType === "pdf" && (
                            <Button size="sm" variant="outline" onClick={() => setCropperOpen(true)}>
                              <Crop className="w-3 h-3 mr-1" /> Recortar do PDF
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : !q.saved && (
                    <div>
                      <Label className="text-xs">Imagem</Label>
                      <div className="flex gap-1 flex-wrap mt-1">
                        <Button size="sm" variant="outline" onClick={() => handleImageUpload(activeQ)}>
                          <Upload className="w-3 h-3 mr-1" /> Upload Imagem
                        </Button>
                        {fileType === "pdf" && (
                          <Button size="sm" variant="outline" onClick={() => setCropperOpen(true)}>
                            <Crop className="w-3 h-3 mr-1" /> Recortar do PDF
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Matéria *</Label>
                      <Select value={q.subject} onValueChange={v => updateQuestion(activeQ, "subject", v)} disabled={q.saved}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Tópico</Label>
                      <Input
                        value={q.topic}
                        onChange={e => updateQuestion(activeQ, "topic", e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Ex: Cinemática"
                        disabled={q.saved}
                      />
                    </div>
                  </div>

                  {q.isObjective && (
                    <div>
                      <Label className="text-xs">Alternativas</Label>
                      <div className="space-y-2 mt-1">
                        {q.options.map((opt, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={q.correct_answer === j ? "default" : "outline"}
                              className="w-8 h-7 text-xs shrink-0"
                              onClick={() => !q.saved && updateQuestion(activeQ, "correct_answer", q.correct_answer === j ? -1 : j)}
                              disabled={q.saved}
                            >
                              {String.fromCharCode(65 + j)}
                            </Button>
                            <Input
                              value={opt}
                              onChange={e => updateOption(activeQ, j, e.target.value)}
                              className="h-7 text-sm"
                              placeholder={`Alternativa ${String.fromCharCode(65 + j)}`}
                              disabled={q.saved}
                            />
                          </div>
                        ))}
                      </div>
                      {q.options.some(o => o.trim()) && q.correct_answer < 0 && (
                        <p className="text-xs text-destructive mt-1">Clique na letra correta para definir o gabarito</p>
                      )}
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Resolução</Label>
                    <Textarea
                      value={q.resolution}
                      onChange={e => updateQuestion(activeQ, "resolution", e.target.value)}
                      rows={2}
                      className="text-sm"
                      placeholder="Explicação da resposta..."
                      disabled={q.saved}
                    />
                  </div>

                  <div className="w-40">
                    <Label className="text-xs">Dificuldade</Label>
                    <Select value={q.difficulty} onValueChange={v => updateQuestion(activeQ, "difficulty", v)} disabled={q.saved}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="facil">Fácil</SelectItem>
                        <SelectItem value="medio">Médio</SelectItem>
                        <SelectItem value="dificil">Difícil</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    {!q.saved && (
                      <>
                        <Button onClick={() => handleSaveOne(activeQ)} disabled={q.saving || !htmlToText(q.text).trim()}>
                          {q.saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                          Salvar questão
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeQuestion(activeQ)} className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4 mr-1" /> Remover
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <PdfPreviewModal
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        file={file}
        onCrop={(dataUrl) => {
          updateQuestion(activeQ, "imageUrl", dataUrl);
          setCropperOpen(false);
        }}
      />

      <ImagePreviewDialog
        open={!!previewImageUrl}
        onOpenChange={(open) => { if (!open) setPreviewImageUrl(null); }}
        imageUrl={previewImageUrl}
        title="Prévia da imagem da questão"
      />
    </div>
  );
}
