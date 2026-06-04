/**
 * AnswerView — dispatches a canonical `QuestionAnswer` to the matching
 * read-only answer view. The `kind` discriminant is exhaustive; the default
 * branch is unreachable given the typed union.
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { OpenAnswerView } from "./OpenAnswerView";
import { MultipleChoiceView } from "./MultipleChoiceView";
import { TrueFalseView } from "./TrueFalseView";
import { CheckboxView } from "./CheckboxView";
import { MatchingView } from "./MatchingView";
import { OrderingView } from "./OrderingView";
import { FillBlankView } from "./FillBlankView";
import { TableView } from "./TableView";

export function AnswerView({ answer }: { answer: QuestionAnswer }) {
  switch (answer.kind) {
    case "open":
      return <OpenAnswerView answer={answer} />;
    case "multipleChoice":
      return <MultipleChoiceView answer={answer} />;
    case "trueFalse":
      return <TrueFalseView answer={answer} />;
    case "checkbox":
      return <CheckboxView answer={answer} />;
    case "matching":
      return <MatchingView answer={answer} />;
    case "ordering":
      return <OrderingView answer={answer} />;
    case "fillBlank":
      return <FillBlankView answer={answer} />;
    case "table":
      return <TableView answer={answer} />;
  }
}

export default AnswerView;
