/**
 * BlockInserterMenu — the "+" affordance and its menu (plano §6.4, Fase 5a).
 *
 * A Popover (NOT a DropdownMenu: the latter does not open under jsdom, so the
 * menu would be untestable) anchored on a circular "+" button. The menu lists
 * the two sections from `blockInserterItems`: a grid of the 8 question types and
 * a list of text/media blocks. Picking an item closes the popover and calls
 * `onPick` — the parent overlay turns that into an editor transaction.
 *
 * "Quebra de página" only shows when a block follows the gap (§6.6).
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { INSERTER_SECTIONS, type InserterItem } from "./blockInserterItems";
import type { BlockGap } from "./topLevelGaps";

type Props = {
  gap: BlockGap;
  onPick: (item: InserterItem) => void;
};

/** Whether an item is offered at this gap (pageBreak needs a following block). */
function isVisible(item: InserterItem, gap: BlockGap): boolean {
  return !item.needsFollowing || gap.followingPos != null;
}

export function BlockInserterMenu({ gap, onPick }: Props) {
  const [open, setOpen] = useState(false);

  const pick = (item: InserterItem) => {
    setOpen(false);
    onPick(item);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label="Inserir bloco"
          className="h-6 w-6 rounded-full bg-surface-accent text-white shadow-sm hover:bg-surface-accent-ink"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 space-y-3">
        {INSERTER_SECTIONS.map((section) => {
          const items = section.items.filter((item) => isVisible(item, gap));
          /* v8 ignore next -- both sections always have visible items */
          if (items.length === 0) return null;
          return (
            <div key={section.id} className="space-y-1.5">
              <p className="text-xs font-medium text-surface-ink-soft">{section.label}</p>
              <div className={section.id === "question" ? "grid grid-cols-2 gap-1" : "flex flex-col gap-0.5"}>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(item)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-surface-ink hover:bg-surface-accent-soft"
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0 text-surface-ink-soft" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export default BlockInserterMenu;
