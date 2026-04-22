import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  selectActivePersona,
  selectOrderedPersonas,
  usePersonaStore,
  type Persona,
  type PersonaId,
} from "../../personaStore";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type EditingTarget =
  | { kind: "create" }
  | { kind: "edit"; personaId: PersonaId; initialName: string; initialPrompt: string };

export const PersonaPicker = memo(function PersonaPicker() {
  const personas = usePersonaStore(useShallow(selectOrderedPersonas));
  const activePersona = usePersonaStore(selectActivePersona);
  const setActivePersona = usePersonaStore((store) => store.setActivePersona);
  const deletePersona = usePersonaStore((store) => store.deletePersona);
  const createPersona = usePersonaStore((store) => store.createPersona);
  const updatePersona = usePersonaStore((store) => store.updatePersona);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);

  const closeEditor = useCallback(() => setEditingTarget(null), []);

  const handleCreatePersona = useCallback(() => {
    setEditingTarget({ kind: "create" });
  }, []);

  const handleEditPersona = useCallback((persona: Persona) => {
    setEditingTarget({
      kind: "edit",
      personaId: persona.id,
      initialName: persona.name,
      initialPrompt: persona.systemPrompt,
    });
  }, []);

  const handleDeletePersona = useCallback(
    (persona: Persona) => {
      if (persona.isDefault) return;
      deletePersona(persona.id);
    },
    [deletePersona],
  );

  return (
    <>
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                data-testid="sidebar-persona-picker-trigger"
                className="inline-flex h-5 max-w-[55%] cursor-pointer items-center gap-1 rounded-md px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 outline-hidden ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2"
              >
                <span className="truncate normal-case tracking-normal">{activePersona.name}</span>
                <ChevronDownIcon className="size-3 shrink-0" />
              </MenuTrigger>
            }
          />
          <TooltipPopup side="bottom">Persona — system prompt for new chats</TooltipPopup>
        </Tooltip>
        <MenuPopup align="start" side="bottom" className="w-64 p-1">
          <div className="px-2 pt-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Persona for new chats
          </div>
          <ul className="flex flex-col gap-0.5">
            {personas.map((persona) => (
              <PersonaRow
                key={persona.id}
                persona={persona}
                isActive={persona.id === activePersona.id}
                onSelect={() => setActivePersona(persona.id)}
                onEdit={() => handleEditPersona(persona)}
                onDelete={() => handleDeletePersona(persona)}
              />
            ))}
          </ul>
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={handleCreatePersona}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PlusIcon className="size-3.5" />
              <span>New persona</span>
            </button>
          </div>
        </MenuPopup>
      </Menu>

      <PersonaEditorDialog
        target={editingTarget}
        onClose={closeEditor}
        onCreate={(input) => {
          createPersona(input);
          closeEditor();
        }}
        onUpdate={(personaId, input) => {
          updatePersona(personaId, input);
          closeEditor();
        }}
      />
    </>
  );
});

interface PersonaRowProps {
  readonly persona: Persona;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

const PersonaRow = memo(function PersonaRow({
  persona,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: PersonaRowProps) {
  return (
    <li className="group/persona-row flex items-stretch">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-l-sm px-2 py-1.5 text-left text-xs transition-colors",
          isActive
            ? "bg-accent/80 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
            isActive ? "border-primary bg-primary/90" : "border-muted-foreground/30",
          )}
        >
          {isActive ? <CheckIcon className="size-2.5 text-primary-foreground" /> : null}
        </span>
        <span className="min-w-0 flex-1 truncate">{persona.name}</span>
        {persona.isDefault ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            Default
          </span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5 pr-0.5 opacity-0 transition-opacity group-hover/persona-row:opacity-100 group-focus-within/persona-row:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Edit ${persona.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onEdit();
                }}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              />
            }
          >
            <PencilIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="top">Edit persona</TooltipPopup>
        </Tooltip>
        {persona.isDefault ? null : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Delete ${persona.name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete();
                  }}
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                />
              }
            >
              <Trash2Icon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="top">Delete persona</TooltipPopup>
          </Tooltip>
        )}
      </div>
    </li>
  );
});

interface PersonaEditorDialogProps {
  readonly target: EditingTarget | null;
  readonly onClose: () => void;
  readonly onCreate: (input: { name: string; systemPrompt: string }) => void;
  readonly onUpdate: (personaId: PersonaId, input: { name: string; systemPrompt: string }) => void;
}

const PersonaEditorDialog = memo(function PersonaEditorDialog({
  target,
  onClose,
  onCreate,
  onUpdate,
}: PersonaEditorDialogProps) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const open = target !== null;

  useEffect(() => {
    if (!target) return;
    if (target.kind === "create") {
      setName("");
      setSystemPrompt("");
    } else {
      setName(target.initialName);
      setSystemPrompt(target.initialPrompt);
    }
  }, [target]);

  useEffect(() => {
    if (!open) return;
    const handle = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, [open]);

  const title = useMemo(() => {
    if (!target) return "Persona";
    return target.kind === "create" ? "New persona" : `Edit ${target.initialName}`;
  }, [target]);

  const canSubmit = name.trim().length > 0;

  const submit = useCallback(() => {
    if (!target) return;
    if (!canSubmit) return;
    if (target.kind === "create") {
      onCreate({ name: name.trim(), systemPrompt });
    } else {
      onUpdate(target.personaId, { name: name.trim(), systemPrompt });
    }
  }, [canSubmit, name, onCreate, onUpdate, systemPrompt, target]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Give your persona a name and a system prompt that will be prepended to the first message
            of every new chat you start with it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">Name</span>
            <Input
              ref={nameInputRef}
              aria-label="Persona name"
              placeholder="e.g. Terse reviewer"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">System prompt</span>
            <Textarea
              aria-label="Persona system prompt"
              placeholder="Describe tone, format, constraints…"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              rows={8}
            />
            <span className="text-[10px] text-muted-foreground">
              Leave empty to disable the system prompt for this persona.
            </span>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Save
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
});
