// Inline run with optional color, used for word-level coloring.
export type InlineRun = { text: string; color?: string; bold?: boolean; italic?: boolean };

export type ContentBlock =
  | { id: string; type: "text"; content: string; richContent?: InlineRun[] }
  | {
      id: string;
      type: "image";
      src: string;
      width: number;
      alignment: "left" | "center" | "right";
      caption?: string;
    }
  | { id: string; type: "scaffolding"; items: string[] }
  | { id: string; type: "page_break" };

export type QuestionType =
  | "multiple_choice"
  | "multiple_answer"
  | "open_ended"
  | "fill_blank"
  | "true_false"
  | "matching"
  | "ordering"
  | "table";

export interface Alternative {
  letter: string;
  text: string;
  is_correct?: boolean;
}

export interface CheckItem {
  text: string;
  checked?: boolean;
}

export interface TrueFalseItem {
  text: string;
  marked?: boolean | null;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface OrderItem {
  n: number;
  text: string;
}

export interface StructuredQuestion {
  id?: string;
  number: number;
  type: QuestionType;
  statement: string;
  instruction?: string;
  alternatives?: Alternative[];
  check_items?: CheckItem[];
  tf_items?: TrueFalseItem[];
  match_pairs?: MatchPair[];
  order_items?: OrderItem[];
  table_rows?: string[][];
  blank_placeholder?: string;
  scaffolding?: string[];
  images?: string[];
  content?: ContentBlock[];
  trailingContent?: ContentBlock[];
  answerLines?: number;
}

export interface ActivitySection {
  title?: string;
  introduction?: string;
  questions: StructuredQuestion[];
}

export interface StructuredActivity {
  sections: ActivitySection[];
  general_instructions?: string;
  visual_supports?: string[];
}

export interface StructuredAdaptationResult {
  version_universal: StructuredActivity;
  version_directed: StructuredActivity;
  strategies_applied: string[];
  pedagogical_justification: string;
  implementation_tips: string[];
}

export function isStructuredActivity(data: unknown): data is StructuredActivity {
  if (typeof data !== "object" || data === null || !("sections" in data)) return false;
  const sections = (data as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return false;
  return sections.length > 0 && sections.every(
    (s) => typeof s === "object" && s !== null && Array.isArray((s as Record<string, unknown>).questions)
  );
}
