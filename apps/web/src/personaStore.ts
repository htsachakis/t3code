import { create } from "zustand";

import { randomUUID } from "./lib/utils";

const PERSISTED_STATE_KEY = "t3code:personas:v1";
const DEFAULT_PERSONA_NAME = "Default";

export type PersonaId = string;

export interface Persona {
  readonly id: PersonaId;
  readonly name: string;
  readonly systemPrompt: string;
  /**
   * Built-in default persona. There is exactly one, it cannot be deleted,
   * but it may be renamed and its system prompt may be edited.
   */
  readonly isDefault: boolean;
}

interface PersistedPersonaState {
  readonly personas: Record<PersonaId, Persona>;
  readonly personaIds: ReadonlyArray<PersonaId>;
  readonly defaultPersonaId: PersonaId;
  readonly activePersonaId: PersonaId;
  readonly personaIdByThreadKey: Record<string, PersonaId>;
}

interface PersonaStoreState extends PersistedPersonaState {
  /** Returns the persona associated with a thread, falling back to default. */
  readonly getPersonaForThread: (threadKey: string | null | undefined) => Persona;
  /** Returns the currently active persona (the default selection for new chats). */
  readonly getActivePersona: () => Persona;
  /** Set the currently active persona. Ignores unknown IDs. */
  readonly setActivePersona: (personaId: PersonaId) => void;
  /**
   * Associate a thread with the currently active persona. Called at thread
   * creation so the system prompt is pinned for that conversation.
   */
  readonly associateActivePersonaWithThread: (threadKey: string) => void;
  /** Create a new user-defined persona and return its id. */
  readonly createPersona: (input: { name: string; systemPrompt: string }) => PersonaId;
  /**
   * Update a persona's name and/or system prompt. Works for any persona,
   * including the default one.
   */
  readonly updatePersona: (
    personaId: PersonaId,
    patch: { name?: string; systemPrompt?: string },
  ) => void;
  /**
   * Delete a user-defined persona. No-op for the default persona. Any thread
   * associations pointing at the deleted persona are rolled back to default.
   */
  readonly deletePersona: (personaId: PersonaId) => void;
}

function makeInitialDefaultPersona(): Persona {
  return {
    id: randomUUID(),
    name: DEFAULT_PERSONA_NAME,
    systemPrompt: "",
    isDefault: true,
  };
}

function initialPersistedState(): PersistedPersonaState {
  const defaultPersona = makeInitialDefaultPersona();
  return {
    personas: { [defaultPersona.id]: defaultPersona },
    personaIds: [defaultPersona.id],
    defaultPersonaId: defaultPersona.id,
    activePersonaId: defaultPersona.id,
    personaIdByThreadKey: {},
  };
}

function readPersistedState(): PersistedPersonaState {
  if (typeof window === "undefined") {
    return initialPersistedState();
  }
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) {
      return initialPersistedState();
    }
    const parsed = JSON.parse(raw) as Partial<PersistedPersonaState>;
    const fallback = initialPersistedState();
    const personas = (parsed.personas ?? fallback.personas) as Record<PersonaId, Persona>;
    const personaIds =
      Array.isArray(parsed.personaIds) && parsed.personaIds.length > 0
        ? parsed.personaIds.filter(
            (id): id is PersonaId => typeof id === "string" && id in personas,
          )
        : (fallback.personaIds as Array<PersonaId>);
    // Ensure exactly one default persona exists.
    const defaultCandidates = personaIds.filter((id) => personas[id]?.isDefault);
    let defaultPersonaId: PersonaId;
    let personasById = { ...personas } as Record<PersonaId, Persona>;
    if (defaultCandidates.length === 0) {
      const synthesized = makeInitialDefaultPersona();
      personasById[synthesized.id] = synthesized;
      personaIds.unshift(synthesized.id);
      defaultPersonaId = synthesized.id;
    } else {
      defaultPersonaId = defaultCandidates[0] as PersonaId;
      // Normalize so only the first default is marked.
      for (const id of defaultCandidates.slice(1)) {
        const existing = personasById[id];
        if (existing) {
          personasById = { ...personasById, [id]: { ...existing, isDefault: false } };
        }
      }
    }
    const activePersonaId =
      typeof parsed.activePersonaId === "string" && parsed.activePersonaId in personasById
        ? parsed.activePersonaId
        : defaultPersonaId;
    const rawThreadMap = (parsed.personaIdByThreadKey ?? {}) as Record<string, PersonaId>;
    const personaIdByThreadKey: Record<string, PersonaId> = {};
    for (const [threadKey, personaId] of Object.entries(rawThreadMap)) {
      if (typeof personaId === "string" && personaId in personasById) {
        personaIdByThreadKey[threadKey] = personaId;
      }
    }

    return {
      personas: personasById,
      personaIds,
      defaultPersonaId,
      activePersonaId,
      personaIdByThreadKey,
    };
  } catch {
    return initialPersistedState();
  }
}

function persistState(state: PersistedPersonaState): void {
  if (typeof window === "undefined") return;
  try {
    const snapshot: PersistedPersonaState = {
      personas: state.personas,
      personaIds: state.personaIds,
      defaultPersonaId: state.defaultPersonaId,
      activePersonaId: state.activePersonaId,
      personaIdByThreadKey: state.personaIdByThreadKey,
    };
    window.localStorage.setItem(PERSISTED_STATE_KEY, JSON.stringify(snapshot));
  } catch {
    // Best-effort persistence; ignore quota / private-mode failures.
  }
}

function normalizeName(input: string, fallback: string): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const usePersonaStore = create<PersonaStoreState>((set, get) => {
  const initial = readPersistedState();

  const commit = (next: PersistedPersonaState): void => {
    persistState(next);
    set(next);
  };

  const selectPersonaForThread = (
    state: PersistedPersonaState,
    threadKey: string | null | undefined,
  ): Persona => {
    const defaultPersona = state.personas[state.defaultPersonaId];
    if (!defaultPersona) {
      throw new Error("personaStore invariant: default persona missing");
    }
    if (!threadKey) return defaultPersona;
    const mappedId = state.personaIdByThreadKey[threadKey];
    if (!mappedId) return defaultPersona;
    return state.personas[mappedId] ?? defaultPersona;
  };

  return {
    ...initial,
    getPersonaForThread: (threadKey) => selectPersonaForThread(get(), threadKey),
    getActivePersona: () => {
      const state = get();
      return state.personas[state.activePersonaId] ?? state.personas[state.defaultPersonaId]!;
    },
    setActivePersona: (personaId) => {
      const state = get();
      if (!(personaId in state.personas) || state.activePersonaId === personaId) return;
      commit({ ...state, activePersonaId: personaId });
    },
    associateActivePersonaWithThread: (threadKey) => {
      if (threadKey.length === 0) return;
      const state = get();
      const existing = state.personaIdByThreadKey[threadKey];
      if (existing === state.activePersonaId) return;
      commit({
        ...state,
        personaIdByThreadKey: {
          ...state.personaIdByThreadKey,
          [threadKey]: state.activePersonaId,
        },
      });
    },
    createPersona: ({ name, systemPrompt }) => {
      const state = get();
      const id = randomUUID();
      const persona: Persona = {
        id,
        name: normalizeName(name, "Untitled persona"),
        systemPrompt,
        isDefault: false,
      };
      commit({
        ...state,
        personas: { ...state.personas, [id]: persona },
        personaIds: [...state.personaIds, id],
        activePersonaId: id,
      });
      return id;
    },
    updatePersona: (personaId, patch) => {
      const state = get();
      const existing = state.personas[personaId];
      if (!existing) return;
      const nextName =
        patch.name === undefined ? existing.name : normalizeName(patch.name, existing.name);
      const nextPrompt =
        patch.systemPrompt === undefined ? existing.systemPrompt : patch.systemPrompt;
      if (nextName === existing.name && nextPrompt === existing.systemPrompt) return;
      commit({
        ...state,
        personas: {
          ...state.personas,
          [personaId]: { ...existing, name: nextName, systemPrompt: nextPrompt },
        },
      });
    },
    deletePersona: (personaId) => {
      const state = get();
      const existing = state.personas[personaId];
      if (!existing || existing.isDefault) return;
      const { [personaId]: _removed, ...remainingPersonas } = state.personas;
      const remainingIds = state.personaIds.filter((id) => id !== personaId);
      const rolledBackThreadMap: Record<string, PersonaId> = {};
      for (const [threadKey, mappedPersonaId] of Object.entries(state.personaIdByThreadKey)) {
        if (mappedPersonaId === personaId) continue;
        rolledBackThreadMap[threadKey] = mappedPersonaId;
      }
      const nextActive =
        state.activePersonaId === personaId ? state.defaultPersonaId : state.activePersonaId;
      commit({
        ...state,
        personas: remainingPersonas as Record<PersonaId, Persona>,
        personaIds: remainingIds,
        activePersonaId: nextActive,
        personaIdByThreadKey: rolledBackThreadMap,
      });
    },
  };
});

export function selectOrderedPersonas(state: PersonaStoreState): ReadonlyArray<Persona> {
  return state.personaIds.flatMap((id) => {
    const persona = state.personas[id];
    return persona ? [persona] : [];
  });
}

export function selectActivePersona(state: PersonaStoreState): Persona {
  return state.personas[state.activePersonaId] ?? state.personas[state.defaultPersonaId]!;
}

export function selectPersonaById(
  state: PersonaStoreState,
  personaId: PersonaId | null | undefined,
): Persona | null {
  if (!personaId) return null;
  return state.personas[personaId] ?? null;
}
