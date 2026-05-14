import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/* ============================================================
   Types — unchanged from original
   ============================================================ */

type Category = "upper" | "lower" | "cardio";
type ExerciseKind = "strength" | "cardio";
type View = "day" | "templates" | "progress" | "data";

type StrengthSet = {
  id: string;
  targetReps?: number;
  targetWeightKg?: number;
  actualReps?: number;
  actualWeightKg?: number;
  done?: boolean;
};

type CardioMetrics = {
  targetDistanceKm?: number;
  targetTimeMin?: number;
  targetCalories?: number;
  actualDistanceKm?: number;
  actualTimeMin?: number;
  actualCalories?: number;
};

type ExerciseEntry = {
  id: string;
  kind: ExerciseKind;
  category: Category;
  name: string;
  sets?: StrengthSet[];
  cardio?: CardioMetrics;
  notes?: string;
};

type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: ExerciseEntry[];
  createdAt: string;
  updatedAt: string;
};

type ScheduledWorkout = {
  id: string;
  date: string;
  templateId?: string;
  name: string;
  exercises: ExerciseEntry[];
  complete?: boolean;
  createdAt: string;
  updatedAt: string;
};

type AppData = {
  version: 1;
  templates: WorkoutTemplate[];
  workouts: ScheduledWorkout[];
};

type ExerciseDraft = {
  category: Category;
  name: string;
  customName: string;
  sets: number;
  reps: string;
  weightKg: string;
  distanceKm: string;
  timeMin: string;
  calories: string;
};

type ProgressPoint = {
  date: string;
  label: string;
  kind: ExerciseKind;
  weightKg?: number;
  reps?: number;
  volume?: number;
  distanceKm?: number;
  timeMin?: number;
  calories?: number;
};

/* ============================================================
   Constants & helpers — unchanged storage semantics
   ============================================================ */

const STORAGE_KEY = "zero-fuss-gym-log-v1";

const EXERCISES: Record<Category, string[]> = {
  upper: [
    "Bench Press",
    "Dumbbell Bench Press",
    "Chest Press",
    "Shoulder Press",
    "Lat Pulldown",
    "Seated Row",
    "Pull-up",
    "Push-up",
    "Bicep Curl",
    "Tricep Pushdown",
    "Lateral Raise",
    "Face Pull",
  ],
  lower: [
    "Squat",
    "Leg Press",
    "Romanian Deadlift",
    "Deadlift",
    "Leg Curl",
    "Leg Extension",
    "Walking Lunge",
    "Hip Thrust",
    "Calf Raise",
    "Glute Bridge",
  ],
  cardio: ["Treadmill", "Bike", "Rowing Machine", "Cross Trainer", "Stairmaster", "Outdoor Run"],
};

const EMPTY_DRAFT: ExerciseDraft = {
  category: "upper",
  name: EXERCISES.upper[0],
  customName: "",
  sets: 4,
  reps: "12",
  weightKg: "10",
  distanceKm: "",
  timeMin: "20",
  calories: "",
};

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoToDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(iso: string, options?: Intl.DateTimeFormatOptions) {
  const opts =
    options ?? { weekday: "short", day: "2-digit", month: "short" };
  return new Intl.DateTimeFormat("en-GB", opts).format(isoToDate(iso));
}

function dateChipLabel(iso: string) {
  const today = todayISO();
  const tomorrow = todayISO(addDays(new Date(), 1));
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tom";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(isoToDate(iso));
}

function numberFromInput(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

function numberToInput(value?: number) {
  return value === undefined || Number.isNaN(value) ? "" : String(value);
}

function now() {
  return new Date().toISOString();
}

function freshStrengthSets(count: number, reps?: number, weightKg?: number): StrengthSet[] {
  return Array.from({ length: Math.max(1, count) }, () => ({
    id: uid(),
    targetReps: reps,
    targetWeightKg: weightKg,
    actualReps: undefined,
    actualWeightKg: undefined,
    done: false,
  }));
}

function deepCloneExerciseForSession(exercise: ExerciseEntry): ExerciseEntry {
  if (exercise.kind === "cardio") {
    return {
      ...exercise,
      id: uid(),
      cardio: {
        targetDistanceKm: exercise.cardio?.targetDistanceKm,
        targetTimeMin: exercise.cardio?.targetTimeMin,
        targetCalories: exercise.cardio?.targetCalories,
        actualDistanceKm: undefined,
        actualTimeMin: undefined,
        actualCalories: undefined,
      },
    };
  }

  return {
    ...exercise,
    id: uid(),
    sets: (exercise.sets ?? []).map((set) => ({
      id: uid(),
      targetReps: set.targetReps,
      targetWeightKg: set.targetWeightKg,
      actualReps: undefined,
      actualWeightKg: undefined,
      done: false,
    })),
  };
}

function cloneExerciseForTemplate(exercise: ExerciseEntry): ExerciseEntry {
  if (exercise.kind === "cardio") {
    return {
      ...exercise,
      id: uid(),
      cardio: {
        targetDistanceKm: exercise.cardio?.targetDistanceKm,
        targetTimeMin: exercise.cardio?.targetTimeMin,
        targetCalories: exercise.cardio?.targetCalories,
      },
    };
  }
  return {
    ...exercise,
    id: uid(),
    sets: (exercise.sets ?? []).map((set) => ({
      id: uid(),
      targetReps: set.targetReps,
      targetWeightKg: set.targetWeightKg,
    })),
  };
}

function exerciseFromDraft(draft: ExerciseDraft): ExerciseEntry {
  const name = draft.customName.trim() || draft.name.trim();
  if (draft.category === "cardio") {
    return {
      id: uid(),
      kind: "cardio",
      category: "cardio",
      name,
      cardio: {
        targetDistanceKm: numberFromInput(draft.distanceKm),
        targetTimeMin: numberFromInput(draft.timeMin),
        targetCalories: numberFromInput(draft.calories),
      },
    };
  }
  return {
    id: uid(),
    kind: "strength",
    category: draft.category,
    name,
    sets: freshStrengthSets(draft.sets, numberFromInput(draft.reps), numberFromInput(draft.weightKg)),
  };
}

function seedData(): AppData {
  const createdAt = now();
  const push: WorkoutTemplate = {
    id: uid(),
    name: "Push",
    createdAt,
    updatedAt: createdAt,
    exercises: [
      { id: uid(), kind: "strength", category: "upper", name: "Dumbbell Bench Press", sets: freshStrengthSets(4, 10, 20) },
      { id: uid(), kind: "strength", category: "upper", name: "Shoulder Press", sets: freshStrengthSets(3, 10, 12) },
      { id: uid(), kind: "strength", category: "upper", name: "Tricep Pushdown", sets: freshStrengthSets(3, 12, 20) },
    ],
  };
  const lower: WorkoutTemplate = {
    id: uid(),
    name: "Lower",
    createdAt,
    updatedAt: createdAt,
    exercises: [
      { id: uid(), kind: "strength", category: "lower", name: "Leg Press", sets: freshStrengthSets(4, 12, 80) },
      { id: uid(), kind: "strength", category: "lower", name: "Romanian Deadlift", sets: freshStrengthSets(3, 10, 40) },
      { id: uid(), kind: "strength", category: "lower", name: "Leg Curl", sets: freshStrengthSets(3, 12, 30) },
    ],
  };
  const cardio: WorkoutTemplate = {
    id: uid(),
    name: "Cardio",
    createdAt,
    updatedAt: createdAt,
    exercises: [
      {
        id: uid(),
        kind: "cardio",
        category: "cardio",
        name: "Treadmill",
        cardio: { targetDistanceKm: 3, targetTimeMin: 25, targetCalories: undefined },
      },
    ],
  };
  return { version: 1, templates: [push, lower, cardio], workouts: [] };
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw) as AppData;
    if (parsed.version !== 1) return seedData();
    return parsed;
  } catch {
    return seedData();
  }
}

/* ============================================================
   App
   ============================================================ */

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>("day");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [addExerciseFor, setAddExerciseFor] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const selectedWorkouts = useMemo(
    () =>
      data.workouts
        .filter((workout) => workout.date === selectedDate)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data.workouts, selectedDate],
  );

  function updateData(updater: (current: AppData) => AppData) {
    setData((current) => updater(current));
  }

  function scheduleTemplate(templateId: string) {
    const template = data.templates.find((item) => item.id === templateId);
    if (!template) return;
    const timestamp = now();
    const workout: ScheduledWorkout = {
      id: uid(),
      date: selectedDate,
      templateId: template.id,
      name: template.name,
      exercises: template.exercises.map(deepCloneExerciseForSession),
      complete: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    updateData((current) => ({ ...current, workouts: [...current.workouts, workout] }));
  }

  function createBlankWorkout() {
    const timestamp = now();
    const workout: ScheduledWorkout = {
      id: uid(),
      date: selectedDate,
      name: "Ad-hoc workout",
      exercises: [],
      complete: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    updateData((current) => ({ ...current, workouts: [...current.workouts, workout] }));
  }

  function updateWorkout(workoutId: string, updater: (workout: ScheduledWorkout) => ScheduledWorkout) {
    updateData((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.id === workoutId ? { ...updater(workout), updatedAt: now() } : workout,
      ),
    }));
  }

  function deleteWorkout(workoutId: string) {
    updateData((current) => ({ ...current, workouts: current.workouts.filter((workout) => workout.id !== workoutId) }));
  }

  function saveTemplate(template: WorkoutTemplate) {
    updateData((current) => {
      const exists = current.templates.some((item) => item.id === template.id);
      if (exists) {
        return {
          ...current,
          templates: current.templates.map((item) =>
            item.id === template.id ? { ...template, updatedAt: now() } : item,
          ),
        };
      }
      return { ...current, templates: [...current.templates, template] };
    });
  }

  function deleteTemplate(templateId: string) {
    updateData((current) => ({
      ...current,
      templates: current.templates.filter((template) => template.id !== templateId),
    }));
  }

  function importData(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData;
        if (parsed.version !== 1 || !Array.isArray(parsed.templates) || !Array.isArray(parsed.workouts)) {
          window.alert("That backup file does not look like a Zero Fuss Gym Log export.");
          return;
        }
        setData(parsed);
      } catch {
        window.alert("Could not import that file.");
      }
    };
    reader.readAsText(file);
  }

  function addExerciseToWorkout(exercise: ExerciseEntry) {
    if (!addExerciseFor) return;
    updateWorkout(addExerciseFor, (current) => ({
      ...current,
      exercises: [...current.exercises, exercise],
    }));
    setAddExerciseFor(null);
  }

  return (
    <div className="device-bg">
      <div className="wallpaper" aria-hidden="true">
        <div className="orb orb-a"></div>
        <div className="orb orb-b"></div>
        <div className="orb orb-c"></div>
        <div className="orb orb-d"></div>
        <div className="noise"></div>
      </div>

      <main className="app-scroll">
        {view === "day" && (
          <DayView
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            templates={data.templates}
            workouts={selectedWorkouts}
            onScheduleTemplate={scheduleTemplate}
            onCreateBlankWorkout={createBlankWorkout}
            updateWorkout={updateWorkout}
            deleteWorkout={deleteWorkout}
            openAddExercise={(id) => setAddExerciseFor(id)}
          />
        )}
        {view === "templates" && (
          <TemplatesView templates={data.templates} saveTemplate={saveTemplate} deleteTemplate={deleteTemplate} />
        )}
        {view === "progress" && <ProgressView workouts={data.workouts} />}
        {view === "data" && <DataView data={data} setData={setData} importData={importData} />}
        <div className="bottom-pad"></div>
      </main>

      <TabBar view={view} onChange={setView} />

      <Sheet
        open={!!addExerciseFor}
        onClose={() => setAddExerciseFor(null)}
        title="Add exercise"
        subtitle="Pick a category, then choose or type."
      >
        <ExerciseBuilder onAdd={addExerciseToWorkout} buttonLabel="Add to workout" />
      </Sheet>
    </div>
  );
}

/* ============================================================
   Day view
   ============================================================ */

function DayView({
  selectedDate,
  setSelectedDate,
  templates,
  workouts,
  onScheduleTemplate,
  onCreateBlankWorkout,
  updateWorkout,
  deleteWorkout,
  openAddExercise,
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  templates: WorkoutTemplate[];
  workouts: ScheduledWorkout[];
  onScheduleTemplate: (templateId: string) => void;
  onCreateBlankWorkout: () => void;
  updateWorkout: (workoutId: string, updater: (workout: ScheduledWorkout) => ScheduledWorkout) => void;
  deleteWorkout: (workoutId: string) => void;
  openAddExercise: (workoutId: string) => void;
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const days = Array.from({ length: 7 }, (_, index) => todayISO(addDays(new Date(), index - 1)));

  useEffect(() => {
    if (!templateId && templates[0]) setTemplateId(templates[0].id);
  }, [templateId, templates]);

  function onSchedule() {
    if (templateId) onScheduleTemplate(templateId);
    setScheduleOpen(false);
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{formatDate(selectedDate, { weekday: "long" })}</p>
        <h1>{formatDate(selectedDate, { day: "numeric", month: "long" })}</h1>
        <p className="hero-sub">
          {workouts.length === 0
            ? "Rest day — nothing planned"
            : `${workouts.length} ${workouts.length === 1 ? "workout" : "workouts"} planned`}
        </p>
      </header>

      <div className="date-strip">
        {days.map((day) => {
          const dom = formatDate(day, { day: "2-digit" }).replace(/\D/g, "");
          return (
            <button
              key={day}
              className={`date-chip glass ${day === selectedDate ? "active" : ""}`}
              onClick={() => setSelectedDate(day)}
              aria-pressed={day === selectedDate}
            >
              <span className="dow">{dateChipLabel(day)}</span>
              <span className="dom">{dom}</span>
            </button>
          );
        })}
        <label className="date-chip glass date-pick" aria-label="Pick any date">
          <span className="dow">Pick</span>
          <span className="dom">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z M16 2v4M8 2v4M3 10h18"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="date-pick-input"
          />
        </label>
      </div>

      {workouts.length === 0 ? (
        <>
          <div className="section-head">
            <h2>Plan this day</h2>
          </div>
          <div className="quick-row">
            <button className="glass quick-card" onClick={() => setScheduleOpen(true)}>
              <div className="ic ic-green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h16M4 18h10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lbl">From template</div>
              <div className="sub">Push, Lower, Cardio…</div>
            </button>
            <button className="glass quick-card" onClick={onCreateBlankWorkout}>
              <div className="ic ic-blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="#5cc2ff" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lbl">Blank session</div>
              <div className="sub">Build as you go</div>
            </button>
          </div>
        </>
      ) : (
        workouts.map((workout) => (
          <WorkoutCard
            key={workout.id}
            workout={workout}
            updateWorkout={updateWorkout}
            deleteWorkout={deleteWorkout}
            openAddExercise={() => openAddExercise(workout.id)}
          />
        ))
      )}

      {workouts.length > 0 && (
        <button className="btn ghost full" style={{ marginTop: 8 }} onClick={() => setScheduleOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add another workout
        </button>
      )}

      <Sheet
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule a template"
        subtitle={`To ${formatDate(selectedDate, { weekday: "long", day: "2-digit", month: "long" })}`}
      >
        <div className="field">
          <label>Template</label>
          <select className="input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} — {template.exercises.length} exercises
              </option>
            ))}
          </select>
        </div>
        <button className="btn primary full" onClick={onSchedule} disabled={!templateId}>
          Add to day
        </button>
        <button
          className="btn ghost full"
          style={{ marginTop: 10 }}
          onClick={() => {
            onCreateBlankWorkout();
            setScheduleOpen(false);
          }}
        >
          Start a blank session instead
        </button>
      </Sheet>
    </>
  );
}

/* ============================================================
   Workout card
   ============================================================ */

function WorkoutCard({
  workout,
  updateWorkout,
  deleteWorkout,
  openAddExercise,
}: {
  workout: ScheduledWorkout;
  updateWorkout: (workoutId: string, updater: (workout: ScheduledWorkout) => ScheduledWorkout) => void;
  deleteWorkout: (workoutId: string) => void;
  openAddExercise: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const totalSets = workout.exercises.reduce(
    (sum, exercise) => (exercise.kind === "strength" ? sum + (exercise.sets?.length ?? 0) : sum),
    0,
  );
  const doneSets = workout.exercises.reduce(
    (sum, exercise) =>
      exercise.kind === "strength" ? sum + (exercise.sets ?? []).filter((set) => set.done).length : sum,
    0,
  );
  const cardioCount = workout.exercises.filter((exercise) => exercise.kind === "cardio").length;
  const progress =
    totalSets > 0 ? doneSets / totalSets : cardioCount > 0 && workout.complete ? 1 : 0;

  function updateExercise(exerciseId: string, updater: (exercise: ExerciseEntry) => ExerciseEntry) {
    updateWorkout(workout.id, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => (exercise.id === exerciseId ? updater(exercise) : exercise)),
    }));
  }

  function removeExercise(exerciseId: string) {
    updateWorkout(workout.id, (current) => ({
      ...current,
      exercises: current.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
  }

  return (
    <section className="glass workout-card">
      <div className="workout-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            className="workout-title"
            value={workout.name}
            onChange={(event) =>
              updateWorkout(workout.id, (current) => ({ ...current, name: event.target.value }))
            }
            aria-label="Workout name"
          />
          <div className="workout-sub">
            <span>{workout.exercises.length} {workout.exercises.length === 1 ? "exercise" : "exercises"}</span>
            {totalSets > 0 && (
              <>
                <span className="dot"></span>
                <span>{doneSets}/{totalSets} sets</span>
              </>
            )}
            {cardioCount > 0 && (
              <>
                <span className="dot"></span>
                <span>{cardioCount} cardio</span>
              </>
            )}
          </div>
        </div>
        <Ring value={progress} />
        <button
          className="icon-btn"
          aria-label="Workout options"
          onClick={() => setMenuOpen(true)}
          style={{ marginLeft: 4 }}
        >
          <svg width="18" height="4" viewBox="0 0 18 4">
            <circle cx="2" cy="2" r="2" fill="currentColor" />
            <circle cx="9" cy="2" r="2" fill="currentColor" />
            <circle cx="16" cy="2" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>

      {workout.exercises.length === 0 && (
        <div className="exercise-empty">No exercises yet. Add one to get going.</div>
      )}

      {workout.exercises.map((exercise) => (
        <ExerciseRow
          key={exercise.id}
          exercise={exercise}
          updateExercise={updateExercise}
          removeExercise={removeExercise}
        />
      ))}

      <button className="add-ex" onClick={openAddExercise}>
        <span className="plus" aria-hidden="true">+</span>
        Add exercise on the day
      </button>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={workout.name}>
        <button
          className="btn full"
          onClick={() => {
            updateWorkout(workout.id, (current) => ({ ...current, complete: !current.complete }));
            setMenuOpen(false);
          }}
        >
          {workout.complete ? "Mark as in progress" : "Mark workout complete"}
        </button>
        <button
          className="btn full danger"
          style={{ marginTop: 10 }}
          onClick={() => {
            deleteWorkout(workout.id);
            setMenuOpen(false);
          }}
        >
          Delete workout
        </button>
      </Sheet>
    </section>
  );
}

/* ============================================================
   Exercise row (set table or cardio)
   ============================================================ */

function ExerciseRow({
  exercise,
  updateExercise,
  removeExercise,
}: {
  exercise: ExerciseEntry;
  updateExercise: (exerciseId: string, updater: (exercise: ExerciseEntry) => ExerciseEntry) => void;
  removeExercise: (exerciseId: string) => void;
}) {
  function updateSet(setId: string, patch: Partial<StrengthSet>) {
    updateExercise(exercise.id, (current) => ({
      ...current,
      sets: (current.sets ?? []).map((set) => (set.id === setId ? { ...set, ...patch } : set)),
    }));
  }
  function addSet() {
    updateExercise(exercise.id, (current) => {
      const last = current.sets?.[current.sets.length - 1];
      return {
        ...current,
        sets: [
          ...(current.sets ?? []),
          {
            id: uid(),
            targetReps: last?.targetReps,
            targetWeightKg: last?.targetWeightKg,
            done: false,
          },
        ],
      };
    });
  }
  function updateCardio(patch: Partial<CardioMetrics>) {
    updateExercise(exercise.id, (current) => ({
      ...current,
      cardio: { ...(current.cardio ?? {}), ...patch },
    }));
  }

  return (
    <div className="exercise">
      <div className="ex-head">
        <CategoryBadge category={exercise.category} />
        <input
          className="ex-name"
          value={exercise.name}
          onChange={(event) =>
            updateExercise(exercise.id, (current) => ({ ...current, name: event.target.value }))
          }
          aria-label="Exercise name"
        />
        <button
          className="icon-btn"
          aria-label="Remove exercise"
          onClick={() => removeExercise(exercise.id)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {exercise.kind === "strength" ? (
        <>
          <div className="set-header">
            <div></div>
            <div>Reps</div>
            <div>Weight</div>
            <div></div>
          </div>
          {(exercise.sets ?? []).map((set, index) => (
            <SetRow
              key={set.id}
              index={index}
              set={set}
              onChange={(patch) =>
                updateSet(set.id, {
                  ...patch,
                  ...(patch.done === true && set.actualReps === undefined
                    ? { actualReps: set.targetReps }
                    : {}),
                  ...(patch.done === true && set.actualWeightKg === undefined
                    ? { actualWeightKg: set.targetWeightKg }
                    : {}),
                })
              }
              onRemove={() =>
                updateExercise(exercise.id, (current) => ({
                  ...current,
                  sets: (current.sets ?? []).filter((s) => s.id !== set.id),
                }))
              }
            />
          ))}
          <button className="btn small ghost" style={{ marginTop: 6, marginLeft: 30 }} onClick={addSet}>
            + Add set
          </button>
        </>
      ) : (
        <CardioFields metrics={exercise.cardio} onChange={updateCardio} />
      )}
    </div>
  );
}

function SetRow({
  index,
  set,
  onChange,
  onRemove,
}: {
  index: number;
  set: StrengthSet;
  onChange: (patch: Partial<StrengthSet>) => void;
  onRemove: () => void;
}) {
  const live = set.actualReps !== undefined || set.actualWeightKg !== undefined;
  return (
    <div className="set-row">
      <div className="idx">{index + 1}</div>
      <div className={`set-pair ${live ? "live" : ""}`}>
        <input
          inputMode="decimal"
          placeholder={numberToInput(set.targetReps) || "–"}
          value={numberToInput(set.actualReps)}
          onChange={(event) => onChange({ actualReps: numberFromInput(event.target.value) })}
          aria-label={`Set ${index + 1} reps`}
        />
        <span className="unit">reps</span>
      </div>
      <div className={`set-pair ${live ? "live" : ""}`}>
        <input
          inputMode="decimal"
          placeholder={numberToInput(set.targetWeightKg) || "–"}
          value={numberToInput(set.actualWeightKg)}
          onChange={(event) => onChange({ actualWeightKg: numberFromInput(event.target.value) })}
          aria-label={`Set ${index + 1} weight`}
        />
        <span className="unit">kg</span>
      </div>
      <button
        className={`check ${set.done ? "done" : ""}`}
        onClick={() => onChange({ done: !set.done })}
        aria-pressed={!!set.done}
        aria-label={`Mark set ${index + 1} done`}
      >
        {set.done && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-6" stroke="#052e16" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button className="set-remove" onClick={onRemove} aria-label={`Remove set ${index + 1}`}>
        ×
      </button>
    </div>
  );
}

function CardioFields({
  metrics,
  onChange,
}: {
  metrics?: CardioMetrics;
  onChange: (patch: Partial<CardioMetrics>) => void;
}) {
  const m = metrics ?? {};
  return (
    <div className="cardio-grid">
      <Tile
        label={`Target ${m.targetDistanceKm ?? "–"}km`}
        live={m.actualDistanceKm !== undefined}
        placeholder={numberToInput(m.targetDistanceKm) || "–"}
        value={numberToInput(m.actualDistanceKm)}
        onChange={(value) => onChange({ actualDistanceKm: numberFromInput(value) })}
      />
      <Tile
        label={`Target ${m.targetTimeMin ?? "–"}min`}
        live={m.actualTimeMin !== undefined}
        placeholder={numberToInput(m.targetTimeMin) || "–"}
        value={numberToInput(m.actualTimeMin)}
        onChange={(value) => onChange({ actualTimeMin: numberFromInput(value) })}
      />
      <Tile
        label={`Target ${m.targetCalories ?? "–"}cal`}
        live={m.actualCalories !== undefined}
        placeholder={numberToInput(m.targetCalories) || "–"}
        value={numberToInput(m.actualCalories)}
        onChange={(value) => onChange({ actualCalories: numberFromInput(value) })}
      />
    </div>
  );
}

function Tile({
  label,
  live,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  live: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`field-tile ${live ? "live" : ""}`}>
      <label>{label}</label>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/* ============================================================
   Templates view
   ============================================================ */

function TemplatesView({
  templates,
  saveTemplate,
  deleteTemplate,
}: {
  templates: WorkoutTemplate[];
  saveTemplate: (template: WorkoutTemplate) => void;
  deleteTemplate: (templateId: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const editingTemplate = editing && editing !== "new" ? templates.find((t) => t.id === editing) ?? null : null;
  const isNew = editing === "new";

  function newTemplate() {
    setEditing("new");
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Reusable sessions</p>
        <h1>Templates</h1>
        <p className="hero-sub">Drop them onto any day to plan ahead.</p>
      </header>

      <div className="section-head">
        <h2>Your templates</h2>
        <span className="meta">{templates.length} saved</span>
      </div>

      {templates.length === 0 ? (
        <div className="glass empty-card">
          <h3>No templates yet</h3>
          <p>Save reusable workouts so you can plan a day in two taps.</p>
        </div>
      ) : (
        templates.map((template) => {
          const cats = new Set(template.exercises.map((exercise) => exercise.category));
          const tagColor =
            cats.has("cardio") && cats.size === 1
              ? "#ff8a73"
              : cats.has("lower") && !cats.has("upper")
              ? "#a78bfa"
              : "#4ade80";
          return (
            <button key={template.id} className="glass template-card" onClick={() => setEditing(template.id)}>
              <div className="tag" style={{ color: tagColor }}>
                {Array.from(cats).join(" · ") || "Mixed"}
              </div>
              <h3>{template.name}</h3>
              <div className="ex-pills">
                {template.exercises.slice(0, 5).map((exercise) => (
                  <span className="template-pill" key={exercise.id}>
                    {exercise.name}
                  </span>
                ))}
                {template.exercises.length > 5 && (
                  <span className="template-pill">+{template.exercises.length - 5} more</span>
                )}
                {template.exercises.length === 0 && <span className="template-pill">No exercises yet</span>}
              </div>
            </button>
          );
        })
      )}

      <button className="btn primary full" style={{ marginTop: 6 }} onClick={newTemplate}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        New template
      </button>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New template" : editingTemplate?.name || "Edit template"}
        subtitle={isNew ? "Build a reusable session." : "Edit details, or remove from your library."}
      >
        {editing !== null && (
          <TemplateEditor
            template={editingTemplate}
            onSave={(template) => {
              saveTemplate(template);
              setEditing(null);
            }}
            onDelete={
              editingTemplate
                ? () => {
                    deleteTemplate(editingTemplate.id);
                    setEditing(null);
                  }
                : null
            }
          />
        )}
      </Sheet>
    </>
  );
}

function blankTemplate(): WorkoutTemplate {
  const timestamp = now();
  return {
    id: uid(),
    name: "",
    exercises: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function TemplateEditor({
  template,
  onSave,
  onDelete,
}: {
  template: WorkoutTemplate | null;
  onSave: (template: WorkoutTemplate) => void;
  onDelete: (() => void) | null;
}) {
  const [draft, setDraft] = useState<WorkoutTemplate>(() =>
    template
      ? { ...template, exercises: template.exercises.map(cloneExerciseForTemplate) }
      : blankTemplate(),
  );
  const [adding, setAdding] = useState(false);

  function addExercise(exercise: ExerciseEntry) {
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, cloneExerciseForTemplate(exercise)],
    }));
    setAdding(false);
  }

  function removeExercise(exerciseId: string) {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
  }

  function save() {
    const name = draft.name.trim() || "Untitled workout";
    onSave({ ...draft, name, updatedAt: now() });
  }

  return (
    <>
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="e.g. Push, Pull, Legs"
        />
      </div>
      <div className="field">
        <label>Exercises</label>
        {draft.exercises.length === 0 ? (
          <div className="dashed-empty">No exercises yet.</div>
        ) : (
          <div className="template-ex-list">
            {draft.exercises.map((exercise) => (
              <div key={exercise.id} className="template-ex-row">
                <CategoryBadge category={exercise.category} />
                <span className="ex-row-name">{exercise.name}</span>
                <span className="ex-row-meta">
                  {exercise.kind === "strength" ? `${exercise.sets?.length ?? 0} sets` : "cardio"}
                </span>
                <button className="icon-btn" onClick={() => removeExercise(exercise.id)} aria-label="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="btn full" onClick={() => setAdding(true)}>
        + Add exercise
      </button>
      <div style={{ height: 14 }}></div>
      <button className="btn primary full" onClick={save}>
        Save template
      </button>
      {onDelete && (
        <button className="btn full danger" style={{ marginTop: 10 }} onClick={onDelete}>
          Delete template
        </button>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add exercise"
        subtitle="Pick a category, then choose or type."
      >
        <ExerciseBuilder onAdd={addExercise} buttonLabel="Add to template" />
      </Sheet>
    </>
  );
}

/* ============================================================
   Exercise builder (sheet-only)
   ============================================================ */

function ExerciseBuilder({
  onAdd,
  buttonLabel,
}: {
  onAdd: (exercise: ExerciseEntry) => void;
  buttonLabel: string;
}) {
  const [draft, setDraft] = useState<ExerciseDraft>(EMPTY_DRAFT);

  function updateDraft(patch: Partial<ExerciseDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  function switchCategory(category: Category) {
    setDraft((current) => ({
      ...current,
      category,
      name: EXERCISES[category][0],
      customName: "",
    }));
  }
  function add() {
    const exercise = exerciseFromDraft(draft);
    if (!exercise.name.trim()) return;
    onAdd(exercise);
    setDraft((current) => ({ ...current, customName: "" }));
  }

  return (
    <>
      <div className="segmented" role="group" aria-label="Exercise category">
        {(["upper", "lower", "cardio"] as Category[]).map((category) => (
          <button
            key={category}
            className={`seg-btn ${draft.category === category ? "active" : ""}`}
            onClick={() => switchCategory(category)}
            aria-pressed={draft.category === category}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="field">
        <label>Pick</label>
        <select
          className="input"
          value={draft.name}
          onChange={(event) => updateDraft({ name: event.target.value, customName: "" })}
        >
          {EXERCISES[draft.category].map((exercise) => (
            <option key={exercise} value={exercise}>
              {exercise}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Or type your own</label>
        <input
          className="input"
          value={draft.customName}
          onChange={(event) => updateDraft({ customName: event.target.value })}
          placeholder="Manual exercise"
        />
      </div>

      {draft.category === "cardio" ? (
        <div className="builder-row">
          <Field label="km" value={draft.distanceKm} onChange={(v) => updateDraft({ distanceKm: v })} />
          <Field label="min" value={draft.timeMin} onChange={(v) => updateDraft({ timeMin: v })} />
          <Field label="cal" value={draft.calories} onChange={(v) => updateDraft({ calories: v })} />
        </div>
      ) : (
        <div className="builder-row">
          <Field
            label="Sets"
            value={String(draft.sets)}
            onChange={(v) => updateDraft({ sets: Math.max(1, Number(v) || 1) })}
            mode="numeric"
          />
          <Field label="Reps" value={draft.reps} onChange={(v) => updateDraft({ reps: v })} />
          <Field label="Kg" value={draft.weightKg} onChange={(v) => updateDraft({ weightKg: v })} />
        </div>
      )}

      <button className="btn primary full" onClick={add}>
        {buttonLabel}
      </button>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  mode = "decimal",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: "decimal" | "numeric";
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label>{label}</label>
      <input
        className="input"
        inputMode={mode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/* ============================================================
   Progress view
   ============================================================ */

function ProgressView({ workouts }: { workouts: ScheduledWorkout[] }) {
  const exerciseNames = useMemo(() => {
    const set = new Set<string>();
    workouts.forEach((workout) =>
      workout.exercises.forEach((exercise) => set.add(exercise.name)),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [workouts]);

  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!selected && exerciseNames[0]) setSelected(exerciseNames[0]);
  }, [exerciseNames, selected]);

  const points = useMemo(() => buildProgressPoints(workouts, selected), [workouts, selected]);
  const kind = points[0]?.kind;
  const latest = points[points.length - 1];
  const first = points[0];

  let bestVal: number | undefined;
  let bestLabel = "Best weight";
  let latestVal = "—";
  let deltaTxt: string | undefined;
  let deltaPos = true;

  if (kind === "strength") {
    bestVal = Math.max(...points.map((point) => point.weightKg ?? 0));
    bestLabel = "Best weight";
    latestVal = latest?.weightKg !== undefined ? `${latest.weightKg}kg` : "—";
    if (first?.weightKg !== undefined && latest?.weightKg !== undefined) {
      const diff = latest.weightKg - first.weightKg;
      deltaPos = diff >= 0;
      deltaTxt = `${deltaPos ? "+" : ""}${diff.toFixed(1)}kg since start`;
    }
  } else if (kind === "cardio") {
    bestVal = Math.max(...points.map((point) => point.distanceKm ?? 0));
    bestLabel = "Furthest";
    latestVal = latest?.distanceKm !== undefined ? `${latest.distanceKm}km` : "—";
    if (first?.distanceKm !== undefined && latest?.distanceKm !== undefined) {
      const diff = latest.distanceKm - first.distanceKm;
      deltaPos = diff >= 0;
      deltaTxt = `${deltaPos ? "+" : ""}${diff.toFixed(1)}km since start`;
    }
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Dashboard</p>
        <h1>Progress</h1>
        <p className="hero-sub">{exerciseNames.length} exercises logged.</p>
      </header>

      {exerciseNames.length === 0 ? (
        <div className="glass empty-card">
          <div className="glyph">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 18l5-6 4 3 8-9"
                stroke="#5cc2ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 6h6v6"
                stroke="#5cc2ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3>No data yet</h3>
          <p>Log actual reps, weight, distance or time on a workout day and it shows up here.</p>
        </div>
      ) : (
        <>
          <div className="field" style={{ marginTop: 4 }}>
            <label>Exercise</label>
            <select className="input" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {exerciseNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {points.length === 0 ? (
            <div className="glass empty-card">
              <h3>No logged values yet</h3>
              <p>Tap the green check on a set or fill an actual to populate this chart.</p>
            </div>
          ) : (
            <>
              <div className="stat-grid">
                <Stat label="Sessions" value={String(points.length)} />
                <Stat
                  label={bestLabel}
                  value={kind === "strength" ? `${bestVal}kg` : `${bestVal}km`}
                />
                <Stat
                  label="Latest"
                  value={latestVal}
                  delta={deltaTxt}
                  positive={deltaPos}
                />
                <Stat
                  label={kind === "strength" ? "Total volume" : "Total km"}
                  value={
                    kind === "strength"
                      ? `${Math.round(
                          points.reduce((sum, point) => sum + (point.volume ?? 0), 0),
                        ).toLocaleString()}kg`
                      : `${points.reduce((sum, point) => sum + (point.distanceKm ?? 0), 0).toFixed(1)}`
                  }
                />
              </div>

              <div className="glass chart-card">
                <h3>{kind === "strength" ? "Top weight per session" : "Distance per session"}</h3>
                <MiniChart
                  points={points}
                  metric={kind === "strength" ? "weightKg" : "distanceKm"}
                  unit={kind === "strength" ? "kg" : "km"}
                />
              </div>

              <div className="glass history-card">
                <div className="section-head" style={{ padding: "12px 0 8px" }}>
                  <h2>History</h2>
                  <span className="meta">{points.length} sessions</span>
                </div>
                {points
                  .slice()
                  .reverse()
                  .map((point, index) => (
                    <div className="history-row" key={`${point.date}-${index}`}>
                      <span className="h-date">{point.label}</span>
                      <span className="h-val">
                        {point.kind === "strength"
                          ? `${point.weightKg ?? "–"}kg · ${point.reps ?? "–"} reps`
                          : `${point.distanceKm ?? "–"}km · ${point.timeMin ?? "–"} min`}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function buildProgressPoints(workouts: ScheduledWorkout[], selected: string): ProgressPoint[] {
  if (!selected) return [];
  return workouts
    .filter((workout) => workout.exercises.some((exercise) => exercise.name === selected))
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.name === selected)
        .map((exercise): ProgressPoint | undefined => {
          if (exercise.kind === "cardio") {
            const hasValue =
              exercise.cardio?.actualDistanceKm !== undefined ||
              exercise.cardio?.actualTimeMin !== undefined ||
              exercise.cardio?.actualCalories !== undefined;
            if (!hasValue) return undefined;
            return {
              date: workout.date,
              label: formatDate(workout.date),
              kind: "cardio",
              distanceKm: exercise.cardio?.actualDistanceKm,
              timeMin: exercise.cardio?.actualTimeMin,
              calories: exercise.cardio?.actualCalories,
            };
          }
          const sets = exercise.sets ?? [];
          const completed = sets.filter(
            (set) =>
              set.actualReps !== undefined || set.actualWeightKg !== undefined || set.done,
          );
          if (completed.length === 0) return undefined;
          const best = completed.reduce(
            (top, set) => ((set.actualWeightKg ?? 0) > (top.actualWeightKg ?? 0) ? set : top),
            completed[0],
          );
          const volume = completed.reduce(
            (sum, set) => sum + (set.actualReps ?? 0) * (set.actualWeightKg ?? 0),
            0,
          );
          return {
            date: workout.date,
            label: formatDate(workout.date),
            kind: "strength",
            weightKg: best.actualWeightKg,
            reps: best.actualReps,
            volume,
          };
        })
        .filter((point): point is ProgressPoint => Boolean(point)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function Stat({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="glass stat-tile">
      <div className="stat-lbl">{label}</div>
      <div className="stat-val">{value}</div>
      {delta && (
        <div className={`stat-delta ${positive === false ? "neg" : ""}`}>{delta}</div>
      )}
    </div>
  );
}

function MiniChart({
  points,
  metric,
  unit,
}: {
  points: ProgressPoint[];
  metric: "weightKg" | "distanceKm";
  unit: string;
}) {
  if (points.length === 0) {
    return <div className="empty-chart">No data yet.</div>;
  }
  const W = 320;
  const H = 140;
  const P = 16;
  const values = points.map((point) => point[metric] ?? 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const n = points.length;
  const x = (i: number) =>
    P + (n === 1 ? (W - 2 * P) / 2 : (i / (n - 1)) * (W - 2 * P));
  const y = (value: number) =>
    H - P - ((value - min) / range) * (H - 2 * P - 8);

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point[metric] ?? 0)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(n - 1)} ${H - P} L ${x(0)} ${H - P} Z`;
  const last = points[points.length - 1];
  const lx = x(n - 1);
  const ly = y(last[metric] ?? 0);
  const labelTxt = `${last[metric]}${unit}`;
  const tx = Math.min(lx, W - P - 4);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#5cc2ff" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={P}
            y1={P + t * (H - 2 * P - 8)}
            x2={W - P}
            y2={P + t * (H - 2 * P - 8)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="url(#chartArea)" />
        <path
          d={linePath}
          stroke="url(#chartLine)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={x(index)}
            cy={y(point[metric] ?? 0)}
            r="3.5"
            fill="#0a0d18"
            stroke="url(#chartLine)"
            strokeWidth="2"
          />
        ))}
        <g>
          <rect
            x={tx - 30}
            y={ly - 26}
            width="56"
            height="20"
            rx="6"
            fill="rgba(74,222,128,0.18)"
            stroke="rgba(74,222,128,0.4)"
          />
          <text
            x={tx - 2}
            y={ly - 12}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#fff"
          >
            {labelTxt}
          </text>
        </g>
      </svg>
    </div>
  );
}

/* ============================================================
   Data view
   ============================================================ */

function DataView({
  data,
  setData,
  importData,
}: {
  data: AppData;
  setData: (data: AppData) => void;
  importData: (file: File) => void;
}) {
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gym-log-backup-${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) importData(file);
    event.target.value = "";
  }

  function reset() {
    if (window.confirm("Reset everything on this device? Export a backup first if you need it.")) {
      setData(seedData());
    }
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Local storage</p>
        <h1>Your data</h1>
        <p className="hero-sub">Stays in this browser. Back it up before clearing.</p>
      </header>

      <div className="glass summary-card">
        <div className="summary-ic">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <ellipse cx="12" cy="6" rx="8" ry="3" stroke="#4ade80" strokeWidth="1.7" />
            <path
              d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"
              stroke="#5cc2ff"
              strokeWidth="1.7"
            />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="summary-headline">
            {data.templates.length} templates · {data.workouts.length} sessions
          </div>
          <div className="summary-sub">
            ≈ {Math.round(JSON.stringify(data).length / 1024)} KB on this device
          </div>
        </div>
      </div>

      <button className="btn primary full" onClick={exportData}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Export backup (JSON)
      </button>
      <label className="btn full file-label" style={{ marginTop: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 20V8m0 0l-5 5m5-5l5 5M5 4h14"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Import backup
        <input type="file" accept="application/json" onChange={onImport} />
      </label>
      <button className="btn full danger" style={{ marginTop: 10 }} onClick={reset}>
        Reset demo data
      </button>

      <div className="glass info-card">
        <strong>Local-first PWA.</strong> Your data is saved in this browser only — no account, no sync.
        Export before switching devices or clearing browser data.
      </div>
    </>
  );
}

/* ============================================================
   Shared components
   ============================================================ */

function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`cat-badge ${category}`}>
      <span className="dot"></span>
      {category}
    </span>
  );
}

function Ring({ value, size = 54, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#5cc2ff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      <div className="ring-text">{Math.round(value * 100)}%</div>
    </div>
  );
}

function TabBar({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const tabs: { id: View; label: string; icon: ReactNode }[] = [
    {
      id: "day",
      label: "Today",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "templates",
      label: "Templates",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "progress",
      label: "Progress",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 18l5-6 4 3 8-9"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M15 6h6v6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: "data",
      label: "Data",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"
            stroke="currentColor"
            strokeWidth="1.7"
          />
        </svg>
      ),
    },
  ];
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${view === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
          aria-current={view === tab.id ? "page" : undefined}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title ?? "Sheet"}>
        <div className="grabber" aria-hidden="true"></div>
        {title && <h2>{title}</h2>}
        {subtitle && <p className="sheet-sub">{subtitle}</p>}
        {children}
      </div>
    </>,
    document.body,
  );
}

export default App;
