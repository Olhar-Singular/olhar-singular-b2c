import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, X, Upload, Loader2 } from "lucide-react";
import { dataUrlToBlob } from "@/lib/extraction-utils";
import ImagePreviewDialog from "@/components/ImagePreviewDialog";
import { renderMathToHtml, hasMathContent } from "@/lib/latexRenderer";
import "katex/dist/katex.min.css";

function MathPreview({ text }: { text: string }) {
  const html = useMemo(() => renderMathToHtml(text), [text]);
  if (!text || !hasMathContent(text)) return null;
  return (
    <div className="mt-1 p-2 rounded border border-border/50 bg-muted/30">
      <p className="text-[10px] text-muted-foreground mb-1">Prévia matemática</p>
      <div className="text-sm leading-relaxed [&_.katex]:text-[115%]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const subjects = [
  "Física", "Matemática", "Química", "Biologia", "Português",
  "História", "Geografia", "Inglês", "Ciências", "Arte", "Ed. Física", "Geral",
];

type QuestionFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: any | null;
  onSaved: () => void;
};

export default function QuestionForm({ open, onOpenChange, question, onSaved }: QuestionFormProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medio");
  const [questionType, setQuestionType] = useState<"objetiva" | "dissertativa">("dissertativa");
  const [options, setOptions] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (question) {
      setText(question.text || "");
      setSubject(question.subject || "");
      setTopic(question.topic || "");
      setDifficulty(question.difficulty || "medio");
      setResolution(question.resolution || "");
      setImageUrl(question.image_url || null);
      setImagePreview(question.image_url || null);
      const hasOptions = Array.isArray(question.options) && question.options.length > 0;
      setOptions(hasOptions ? question.options : []);
      setCorrectAnswer(question.correct_answer ?? null);
      setQuestionType(hasOptions ? "objetiva" : "dissertativa");
    } else {
      setText(""); setSubject(""); setTopic(""); setDifficulty("medio");
      setQuestionType("dissertativa"); setOptions([]); setCorrectAnswer(null);
      setResolution(""); setImageUrl(null); setImagePreview(null);
    }
  }, [question, open]);

  const handleImageUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Imagem muito grande — máximo 5 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImagePreview(dataUrl);
        setImageUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleSave = async () => {
    if (!text.trim() || !subject) {
      toast.error("Preencha o enunciado e a matéria.");
      return;
    }
    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (finalImageUrl && finalImageUrl.startsWith("data:")) {
        const blob = dataUrlToBlob(finalImageUrl);
        const fileName = `${user!.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
        const { error: upErr } = await supabase.storage
          .from("question-images")
          .upload(fileName, blob, { contentType: "image/png" });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(fileName);
          finalImageUrl = publicUrl;
        } else {
          finalImageUrl = null;
        }
      }

      const payload: any = {
        text: text.trim(),
        subject,
        topic: topic || null,
        difficulty,
        options: questionType === "objetiva" && options.length > 0 ? options : null,
        correct_answer: questionType === "objetiva" ? correctAnswer : null,
        resolution: resolution || null,
        image_url: finalImageUrl,
        source: "manual",
      };

      let error;
      if (question?.id) {
        ({ error } = await (supabase.from as any)("question_bank").update(payload).eq("id", question.id));
      } else {
        payload.created_by = user!.id;
        ({ error } = await (supabase.from as any)("question_bank").insert(payload));
      }

      if (error) throw error;
      toast.success(question ? "Questão atualizada!" : "Questão adicionada!");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{question ? "Editar Questão" : "Adicionar Questão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Enunciado *</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Digite o enunciado da questão..." />
              <MathPreview text={text} />
            </div>

            <div>
              <Label>Imagem (opcional)</Label>
              {imagePreview ? (
                <div className="mt-1">
                  <img
                    src={imagePreview}
                    alt="Imagem da questão"
                    className="max-h-48 rounded border cursor-zoom-in hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewOpen(true)}
                  />
                  <div className="flex gap-1 mt-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => { setImageUrl(null); setImagePreview(null); }}>
                      <X className="w-3 h-3 mr-1" /> Remover
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={handleImageUpload}>
                      <Upload className="w-3 h-3 mr-1" /> Trocar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" className="mt-1" onClick={handleImageUpload}>
                  <Upload className="w-3 h-3 mr-1" /> Upload Imagem
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Matéria *</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tópico</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex: Frações" />
              </div>
              <div>
                <Label>Dificuldade</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facil">Fácil</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="dificil">Difícil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Tipo de Questão</Label>
              <Select value={questionType} onValueChange={(v) => setQuestionType(v as "objetiva" | "dissertativa")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dissertativa">Dissertativa</SelectItem>
                  <SelectItem value="objetiva">Objetiva (múltipla escolha)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {questionType === "objetiva" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Alternativas</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setOptions([...options, ""])}>
                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                  </Button>
                </div>
                {options.length === 0 && <p className="text-xs text-muted-foreground">Clique em "Adicionar" para criar alternativas.</p>}
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      value={opt}
                      onChange={(e) => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                      placeholder={`Alternativa ${String.fromCharCode(65 + i)}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={correctAnswer === i ? "default" : "outline"}
                      onClick={() => setCorrectAnswer(correctAnswer === i ? null : i)}
                      className="shrink-0"
                    >
                      {correctAnswer === i ? "✓" : String.fromCharCode(65 + i)}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setOptions(options.filter((_, j) => j !== i));
                        if (correctAnswer === i) setCorrectAnswer(null);
                        else if (correctAnswer !== null && correctAnswer > i) setCorrectAnswer(correctAnswer - 1);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label>Resolução (opcional)</Label>
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} placeholder="Explicação da resposta..." />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : question ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ImagePreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} imageUrl={imagePreview || ""} />
    </>
  );
}
