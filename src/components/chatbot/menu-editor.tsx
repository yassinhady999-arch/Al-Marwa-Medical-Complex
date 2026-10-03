import { useId, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  MAX_MENU_DEPTH,
  MENU_KIND_META,
  addChild,
  countNodes,
  findPath,
  moveNode,
  newMenuNode,
  removeNode,
  updateNode,
  type MenuKind,
  type MenuNode,
} from "@/lib/chatbot";

const KIND_ORDER = Object.keys(MENU_KIND_META) as MenuKind[];
const ALL_SPECIALTIES = "all";

function AddMenu({
  label,
  compact,
  onAdd,
}: {
  label: string;
  compact?: boolean | undefined;
  onAdd: (kind: MenuKind) => void;
}) {
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button type="button" size="icon-sm" variant="ghost" aria-label={label} title={label}>
            <Plus />
          </Button>
        ) : (
          <Button type="button" variant="outline" className="w-full border-dashed">
            <Plus />
            {label}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64">
        <DropdownMenuLabel>نوع الرد</DropdownMenuLabel>
        {KIND_ORDER.map((kind) => {
          const meta = MENU_KIND_META[kind];
          return (
            <DropdownMenuItem key={kind} onClick={() => onAdd(kind)} className="items-start">
              <meta.icon className="mt-0.5 size-4" />
              <span>
                <span className="block font-medium">{meta.label}</span>
                <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The bot's choice tree: each choice answers, and may branch into more choices. */
export function MenuEditor({
  menu,
  onChange,
  specialties,
}: {
  menu: MenuNode[];
  onChange: (menu: MenuNode[]) => void;
  specialties: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<MenuNode | null>(null);
  const selectedPath = selected ? findPath(menu, selected) : null;
  const node = selectedPath?.[selectedPath.length - 1] ?? null;

  const add = (parentId: string | null, kind: MenuKind) => {
    const child = newMenuNode(kind);
    onChange(addChild(menu, parentId, child));
    if (parentId) setExpanded((e) => new Set(e).add(parentId));
    setSelected(child.id);
  };
  const remove = (target: MenuNode) => {
    onChange(removeNode(menu, target.id));
    if (selected && findPath([target], selected)) setSelected(null);
  };
  const toggle = (id: string) =>
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderList = (nodes: MenuNode[], depth: number) => (
    <ul className={cn("space-y-1.5", depth > 1 && "ms-4 mt-1.5 border-s border-border ps-3")}>
      {nodes.map((n, i) => {
        const meta = MENU_KIND_META[n.kind];
        const open = expanded.has(n.id);
        return (
          <li key={n.id}>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-xl border bg-surface px-2 py-1.5 transition-colors",
                selected === n.id ? "border-primary ring-2 ring-primary/25" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(n.id)}
                disabled={n.children.length === 0}
                aria-label={open ? "طي" : "توسيع"}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:invisible"
              >
                <ChevronDown className={cn("size-4 transition-transform", !open && "rotate-90")} />
              </button>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-emphasis">
                <meta.icon className="size-3.5" />
              </span>
              <button
                type="button"
                onClick={() => setSelected(n.id)}
                className="min-w-0 flex-1 truncate text-start text-sm font-medium text-foreground"
              >
                {n.label || "بدون عنوان"}
              </button>
              {n.children.length > 0 && (
                <span className="tabular shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                  {n.children.length}
                </span>
              )}
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="تعديل"
                  title="تعديل"
                  onClick={() => setSelected(n.id)}
                >
                  <Pencil />
                </Button>
                {depth < MAX_MENU_DEPTH && (
                  <AddMenu compact label="إضافة اختيار فرعي" onAdd={(kind) => add(n.id, kind)} />
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="تحريك لأعلى"
                  disabled={i === 0}
                  onClick={() => onChange(moveNode(menu, n.id, -1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="تحريك لأسفل"
                  disabled={i === nodes.length - 1}
                  onClick={() => onChange(moveNode(menu, n.id, 1))}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="حذف"
                  className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                  onClick={() => (n.children.length ? setPendingDelete(n) : remove(n))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {open && n.children.length > 0 && renderList(n.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      {node && (
        <NodeEditor
          key={node.id}
          node={node}
          depth={selectedPath!.length}
          specialties={specialties}
          onChange={(patch) => onChange(updateNode(menu, node.id, patch))}
          onAddChild={(kind) => add(node.id, kind)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="surface-raised space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">القائمة الرئيسية</p>
          <span className="text-xs text-muted-foreground">
            <span className="tabular">{countNodes(menu)}</span> اختيار
          </span>
        </div>
        {menu.length === 0 ? (
          <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
            لا توجد اختيارات بعد. أضف أول اختيار ليظهر للعميل عند فتح المحادثة.
          </p>
        ) : (
          renderList(menu, 1)
        )}
        <AddMenu label="إضافة اختيار رئيسي" onAdd={(kind) => add(null, kind)} />
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{pendingDelete?.label}» وكل ما تحته؟</AlertDialogTitle>
            <AlertDialogDescription>
              يتفرع من هذا الاختيار {pendingDelete ? countNodes(pendingDelete.children) : 0} اختيار
              آخر وستُحذف كلها. لن يُطبَّق الحذف على البوت حتى تضغط «حفظ القائمة».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove(pendingDelete);
                setPendingDelete(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NodeEditor({
  node,
  depth,
  specialties,
  onChange,
  onAddChild,
  onClose,
}: {
  node: MenuNode;
  depth: number;
  specialties: { id: string; name: string }[];
  onChange: (patch: Partial<MenuNode>) => void;
  onAddChild: (kind: MenuKind) => void;
  onClose: () => void;
}) {
  const meta = MENU_KIND_META[node.kind];
  const uid = useId();
  return (
    <div className="surface-raised animate-rise space-y-4 rounded-2xl border-primary/40 p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary-emphasis">
          <meta.icon className="size-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
          تعديل الاختيار: {node.label || "بدون عنوان"}
        </p>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="إغلاق" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-1`}>نص الزر الذي يضغطه العميل</Label>
          <Input
            id={`${uid}-1`}
            value={node.label}
            maxLength={60}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-2`}>نوع الرد</Label>
          <Select value={node.kind} onValueChange={(v) => onChange({ kind: v as MenuKind })}>
            <SelectTrigger id={`${uid}-2`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_ORDER.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {MENU_KIND_META[kind].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{meta.hint}</p>

      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-3`}>
          {node.kind === "text" ? "رد البوت" : "نص يظهر قبل المعلومات (اختياري)"}
        </Label>
        <Textarea
          id={`${uid}-3`}
          rows={node.kind === "text" ? 4 : 2}
          value={node.reply}
          maxLength={1500}
          placeholder={
            node.kind === "text"
              ? "مثال: نعم، نقبل التأمين من الشركات التالية…"
              : "مثال: هذه أسعارنا:"
          }
          onChange={(e) => onChange({ reply: e.target.value })}
        />
      </div>

      {node.kind === "link" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-4`}>الرابط</Label>
            <Input
              id={`${uid}-4`}
              dir="ltr"
              className="text-end"
              placeholder="https://maps.google.com/…"
              value={node.url ?? ""}
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-5`}>نص زر الرابط</Label>
            <Input
              id={`${uid}-5`}
              value={node.url_label ?? ""}
              maxLength={40}
              placeholder="فتح الموقع على الخريطة"
              onChange={(e) => onChange({ url_label: e.target.value })}
            />
          </div>
        </div>
      )}

      {(node.kind === "services" || node.kind === "doctors") && specialties.length > 0 && (
        <div className="grid gap-1.5 sm:w-1/2">
          <Label htmlFor={`${uid}-6`}>التخصص</Label>
          <Select
            value={node.specialty_id ?? ALL_SPECIALTIES}
            onValueChange={(v) => onChange({ specialty_id: v === ALL_SPECIALTIES ? null : v })}
          >
            <SelectTrigger id={`${uid}-6`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SPECIALTIES}>كل التخصصات</SelectItem>
              {specialties.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
        <p className="text-xs text-muted-foreground">
          {node.children.length
            ? `يتفرع منه ${node.children.length} اختيار يظهر للعميل بعد هذا الرد.`
            : "لا يتفرع منه شيء: بعد الرد يظهر للعميل زر الرجوع والقائمة الرئيسية."}
        </p>
        {depth < MAX_MENU_DEPTH && (
          <div className="w-52">
            <AddMenu label="إضافة اختيار فرعي" onAdd={onAddChild} />
          </div>
        )}
      </div>
    </div>
  );
}
