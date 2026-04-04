import {
  type ReactNode,
  createContext,
  useContext,
  useRef,
  useState,
} from "react";
import {
  type ChapterContent,
  type ChapterOutline,
  type PathwayResult,
  createPathwaySubject,
  generatePathwayChapter,
} from "../../lib/tauri";

type PathwayGenerationStage = "chapters" | "finalizing" | "done";
type PathwayGenerationStatus = "running" | "completed" | "error";

export interface PathwayGenerationJob {
  topic: string;
  mastery: string;
  scope: string;
  subjectName: string;
  chapters: ChapterOutline[];
  status: PathwayGenerationStatus;
  stage: PathwayGenerationStage;
  generatingIndex: number;
  totalChapters: number;
  percent: number;
  currentChapterTitle?: string;
  result?: PathwayResult;
  error?: string;
}

type StartPathwayGenerationInput = {
  topic: string;
  mastery: string;
  scope: string;
  subjectName: string;
  chapters: ChapterOutline[];
};

const PathwayGenerationContext = createContext<{
  job: PathwayGenerationJob | null;
  startJob: (input: StartPathwayGenerationInput) => void;
  clearJob: () => void;
}>({
  job: null,
  startJob: () => {},
  clearJob: () => {},
});

export function usePathwayGeneration() {
  return useContext(PathwayGenerationContext);
}

export function PathwayGenerationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [job, setJob] = useState<PathwayGenerationJob | null>(null);
  const runIdRef = useRef(0);

  const startJob = (input: StartPathwayGenerationInput) => {
    if (job?.status === "running") {
      throw new Error("A curriculum is already generating.");
    }

    const totalChapters = input.chapters.length;
    const nextRunId = runIdRef.current + 1;
    runIdRef.current = nextRunId;

    setJob({
      topic: input.topic,
      mastery: input.mastery,
      scope: input.scope,
      subjectName: input.subjectName,
      chapters: input.chapters,
      status: "running",
      stage: "chapters",
      generatingIndex: 0,
      totalChapters,
      percent: totalChapters > 0 ? Math.round((1 / totalChapters) * 100) : 0,
      currentChapterTitle: input.chapters[0]?.title,
    });

    void (async () => {
      const contents: [ChapterOutline, ChapterContent][] = [];

      try {
        for (let i = 0; i < input.chapters.length; i++) {
          if (runIdRef.current !== nextRunId) return;

          const chapter = input.chapters[i];
          setJob((current) => {
            if (!current || runIdRef.current !== nextRunId) return current;
            return {
              ...current,
              generatingIndex: i,
              percent: Math.round(((i + 1) / totalChapters) * 100),
              currentChapterTitle: chapter.title,
            };
          });

          const content = await generatePathwayChapter(
            input.topic,
            input.mastery,
            chapter.title,
            chapter.description,
            i,
            totalChapters,
          );
          contents.push([chapter, content]);
        }

        if (runIdRef.current !== nextRunId) return;

        setJob((current) => {
          if (!current || runIdRef.current !== nextRunId) return current;
          return {
            ...current,
            stage: "finalizing",
            percent: 100,
            currentChapterTitle: undefined,
          };
        });

        const result = await createPathwaySubject(input.subjectName, contents);
        if (runIdRef.current !== nextRunId) return;

        setJob((current) => {
          if (!current || runIdRef.current !== nextRunId) return current;
          return {
            ...current,
            status: "completed",
            stage: "done",
            percent: 100,
            result,
            currentChapterTitle: undefined,
            error: undefined,
          };
        });
      } catch (error) {
        if (runIdRef.current !== nextRunId) return;

        setJob((current) => {
          if (!current || runIdRef.current !== nextRunId) return current;
          return {
            ...current,
            status: "error",
            stage: "chapters",
            error: String(error),
          };
        });
      }
    })();
  };

  const clearJob = () => {
    runIdRef.current += 1;
    setJob(null);
  };

  return (
    <PathwayGenerationContext.Provider
      value={{
        job,
        startJob,
        clearJob,
      }}
    >
      {children}
    </PathwayGenerationContext.Provider>
  );
}
