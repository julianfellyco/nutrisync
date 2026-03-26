"use client";

/**
 * Drag-and-drop weekly plan editor.
 *
 * Layout: 7 columns (one per day). Each item card is draggable within
 * and between days using @dnd-kit.
 *
 * Data shape mirrors Plan.content.days[].items[]
 */
import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plan, PlanDay, PlanItem } from "@/lib/api";

interface Props {
  plan: Plan;
  onChange: (p: Plan) => void;
  onSave: (p: Plan) => void;
  saving: boolean;
  saved: boolean;
}

export function PlanBuilder({ plan, onChange, onSave, saving, saved }: Props) {
  const [activeItem, setActiveItem] = useState<PlanItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function updateDays(days: PlanDay[]) {
    onChange({ ...plan, content: { ...plan.content, days } });
  }

  function findDayOfItem(itemId: string): PlanDay | undefined {
    return plan.content.days.find((d) => d.items.some((i) => i.id === itemId));
  }

  function onDragStart({ active }: DragStartEvent) {
    const day = findDayOfItem(active.id as string);
    setActiveItem(day?.items.find((i) => i.id === active.id) ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const srcDay = findDayOfItem(active.id as string);
    // over could be a day column (droppable) or another item (sortable)
    const dstDay =
      plan.content.days.find((d) => d.id === over.id) ??
      findDayOfItem(over.id as string);

    if (!srcDay || !dstDay || srcDay.id === dstDay.id) return;

    const item = srcDay.items.find((i) => i.id === active.id)!;
    const newDays = plan.content.days.map((d) => {
      if (d.id === srcDay.id) return { ...d, items: d.items.filter((i) => i.id !== active.id) };
      if (d.id === dstDay.id) return { ...d, items: [...d.items, item] };
      return d;
    });
    updateDays(newDays);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveItem(null);
    if (!over || active.id === over.id) return;

    const day = findDayOfItem(active.id as string);
    if (!day) return;

    const oldIdx = day.items.findIndex((i) => i.id === active.id);
    const newIdx = day.items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const newDays = plan.content.days.map((d) =>
      d.id === day.id ? { ...d, items: arrayMove(d.items, oldIdx, newIdx) } : d,
    );
    updateDays(newDays);
  }

  function addItem(dayId: string) {
    const newItem: PlanItem = {
      id: crypto.randomUUID(),
      title: "New item",
      time: "",
      detail: "",
    };
    updateDays(
      plan.content.days.map((d) =>
        d.id === dayId ? { ...d, items: [...d.items, newItem] } : d,
      ),
    );
  }

  function removeItem(dayId: string, itemId: string) {
    updateDays(
      plan.content.days.map((d) =>
        d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d,
      ),
    );
  }

  function updateItem(dayId: string, updated: PlanItem) {
    updateDays(
      plan.content.days.map((d) =>
        d.id === dayId
          ? { ...d, items: d.items.map((i) => (i.id === updated.id ? updated : i)) }
          : d,
      ),
    );
  }

  return (
    <div className="space-y-4">
      {/* Date range + save */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm text-gray-600">
          From
          <input
            type="date" value={plan.valid_from}
            onChange={(e) => onChange({ ...plan, valid_from: e.target.value })}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          To
          <input
            type="date" value={plan.valid_to}
            onChange={(e) => onChange({ ...plan, valid_to: e.target.value })}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>
        <button
          onClick={() => onSave(plan)}
          disabled={saving}
          className="ml-auto bg-green-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
        >
          {saved ? "Saved!" : saving ? "Saving…" : "Save plan"}
        </button>
      </div>

      {/* Day columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-7 gap-3 overflow-x-auto">
          {plan.content.days.map((day) => (
            <DayColumn
              key={day.id}
              day={day}
              onAddItem={() => addItem(day.id)}
              onRemoveItem={(id) => removeItem(day.id, id)}
              onUpdateItem={(item) => updateItem(day.id, item)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem && <ItemCard item={activeItem} overlay />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Day column ─────────────────────────────────────────────────────────────────

function DayColumn({
  day, onAddItem, onRemoveItem, onUpdateItem,
}: {
  day: PlanDay;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onUpdateItem: (item: PlanItem) => void;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-2 min-h-[200px] flex flex-col">
      <p className="text-xs font-semibold text-gray-500 text-center mb-2">{day.label}</p>

      <SortableContext items={day.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2">
          {day.items.map((item) => (
            <SortableItemCard
              key={item.id}
              item={item}
              onRemove={() => onRemoveItem(item.id)}
              onUpdate={onUpdateItem}
            />
          ))}
        </div>
      </SortableContext>

      <button
        onClick={onAddItem}
        className="mt-2 text-xs text-green-600 hover:text-green-700 w-full text-center py-1 rounded hover:bg-green-50 transition"
      >
        + Add
      </button>
    </div>
  );
}

// ── Sortable item card ─────────────────────────────────────────────────────────

function SortableItemCard({
  item, onRemove, onUpdate,
}: {
  item: PlanItem;
  onRemove: () => void;
  onUpdate: (item: PlanItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard
        item={item}
        onRemove={onRemove}
        onUpdate={onUpdate}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Item card ──────────────────────────────────────────────────────────────────

function ItemCard({
  item, onRemove, onUpdate, dragHandleProps, overlay,
}: {
  item: PlanItem;
  onRemove?: () => void;
  onUpdate?: (item: PlanItem) => void;
  dragHandleProps?: Record<string, unknown>;
  overlay?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && onUpdate) {
    return (
      <div className="bg-white rounded-lg border border-green-300 p-2 space-y-1 shadow">
        <input
          autoFocus
          value={item.title}
          onChange={(e) => onUpdate({ ...item, title: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded px-1 py-0.5"
          placeholder="Title"
        />
        <input
          value={item.time ?? ""}
          onChange={(e) => onUpdate({ ...item, time: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded px-1 py-0.5"
          placeholder="Time (e.g. 08:00)"
        />
        <textarea
          value={item.detail ?? ""}
          onChange={(e) => onUpdate({ ...item, detail: e.target.value })}
          rows={2}
          className="w-full text-xs border border-gray-200 rounded px-1 py-0.5 resize-none"
          placeholder="Notes…"
        />
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-green-600 font-medium"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-2 shadow-sm ${overlay ? "shadow-lg rotate-1" : ""}`}
    >
      <div className="flex items-start gap-1">
        {/* drag handle */}
        <span
          {...dragHandleProps}
          className="text-gray-300 cursor-grab active:cursor-grabbing select-none mt-0.5 text-base leading-none"
        >
          ⠿
        </span>
        <div className="flex-1 min-w-0" onClick={() => !overlay && setEditing(true)}>
          {item.time && <p className="text-[10px] text-gray-400">{item.time}</p>}
          <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
          {item.detail && <p className="text-[10px] text-gray-400 line-clamp-2">{item.detail}</p>}
          {item.macros && (
            <p className="text-[10px] text-green-600 mt-0.5">
              {item.macros.calories} kcal · {item.macros.protein_g}g P
            </p>
          )}
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-gray-300 hover:text-red-400 text-xs leading-none">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
