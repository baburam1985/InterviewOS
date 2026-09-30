"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleHelp,
  Code2,
  Play,
  Sparkles,
  Mic,
  Square,
  Volume2,
  Download,
  Plus,
  Check,
  ChevronRight,
  Search,
  Trash2,
  Settings2,
  Clock3,
  Pause,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import {
  Profile,
  Story,
  Session,
  Review,
  emptyProfile,
  questions,
  categories,
  evaluate,
  guidance,
  capabilities,
} from "../lib/interview";
import { api, ApiError } from "../lib/client-api";
import {
  clearPracticeHandoff,
  readPracticeHandoff,
  writePracticeHandoff,
  type PracticeDraft,
} from "../lib/practice-handoff";
import { QuickPractice, QuickHistory } from "../components/quick-practice";
import { MockRecap } from "../components/mock-recap";
import {
  beginMockRun,
  captureMockAnswer,
  advanceMockRun,
  endMockRun,
  recordMockSave,
  describeMockRun,
  type MockRun,
} from "../lib/mock-practice";
import type { SpeechRecognition, SpeechWindow } from "../lib/speech";
type WorkspaceRecord =
  | { kind: "profile"; data: Profile }
  | { kind: "story"; data: Story }
  | { kind: "session"; data: Session };

const ANSWER_SAVED_NOTICE = "Answer and review saved to your progress.";

const navigation = [
  ["Practice room", Play],
  ["Story library", BookOpen],
  ["Role & resume", BriefcaseBusiness],
  ["Question bank", CircleHelp],
  ["Technical lab", Code2],
  ["Progress", ChartNoAxesCombined],
  ["Research & settings", Settings2],
] as const;
const blankStory = (): Story => ({
  id: crypto.randomUUID(),
  title: "",
  tag: "Leadership",
  situation: "",
  task: "",
  action: "",
  result: "",
});
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function time(n: number) {
  return (
    Math.floor(n / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (n % 60).toString().padStart(2, "0")
  );
}
export default function Workspace() {
  const [mode, setMode] = useState<"quick" | "advanced">("quick");
  const [quickStarted, setQuickStarted] = useState(false);
  const [quickGoal, setQuickGoal] = useState("Recruiter");
  const [quickHistoryOpen, setQuickHistoryOpen] = useState(false);
  const [practiceFocus, setPracticeFocus] = useState("");
  const [pendingPractice, setPendingPractice] = useState<PracticeDraft | null>(
    null,
  );
  const [signInDraftError, setSignInDraftError] = useState("");
  const [mockRun, setMockRun] = useState<MockRun | null>(null);
  const signInNavigation = useRef(false);
  const [tab, setTab] = useState("Practice room"),
    [profile, setProfile] = useState<Profile>(emptyProfile),
    [stories, setStories] = useState<Story[]>([]),
    [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true),
    [signedIn, setSignedIn] = useState(true),
    [workspaceReady, setWorkspaceReady] = useState(false),
    [loadError, setLoadError] = useState(false),
    [savedProfile, setSavedProfile] = useState<Profile>(emptyProfile),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("Behavioral"),
    [question, setQuestion] = useState(questions[0].text),
    [answer, setAnswer] = useState(""),
    [custom, setCustom] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [aiText, setAiText] = useState(""),
    [aiAvailable, setAiAvailable] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [aiEnabled, setAiEnabled] = useState(false);
  const [running, setRunning] = useState(false),
    [seconds, setSeconds] = useState(0),
    [listening, setListening] = useState(false),
    [interim, setInterim] = useState(""),
    [language, setLanguage] = useState("en-US"),
    [voiceSeconds, setVoiceSeconds] = useState(0),
    [voiceOnly, setVoiceOnly] = useState(false);
  const recognition = useRef<SpeechRecognition | null>(null),
    busyRef = useRef(false),
    mockQuestions = useRef<{ text: string; category: string }[]>([]),
    voiceStart = useRef(0),
    activeVoice = useRef(false),
    aiAbort = useRef<AbortController | null>(null),
    sessionId = useRef(""),
    [savedId, setSavedId] = useState(""),
    [storyDraft, setStoryDraft] = useState<Story | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [selectedSession, setSelectedSession] = useState<Session | null>(null),
    [mock, setMock] = useState(false),
    [round, setRound] = useState(1);
  const load = useCallback(
    () =>
      api<{ records: WorkspaceRecord[]; warning?: string }>("/api/workspace")
        .then((d) => {
          const loadedProfile =
            d.records.find((r) => r.kind === "profile")?.data || emptyProfile;
          setSignedIn(true);
          setProfile(loadedProfile);
          setSavedProfile(loadedProfile);
          setStories(
            d.records.flatMap((r) => (r.kind === "story" ? [r.data] : [])),
          );
          setSessions(
            d.records
              .flatMap((r) => (r.kind === "session" ? [r.data] : []))
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          );
          setWorkspaceReady(true);
          setLoadError(false);
          if (d.warning) setNotice(d.warning);
        })
        .catch((e: unknown) => {
          setNotice((e as Error).message);
          setWorkspaceReady(false);
          setLoadError(true);
          setSignedIn(!(e instanceof ApiError && e.status === 401));
        })
        .finally(() => {
          setPendingPractice(readPracticeHandoff());
          setLoading(false);
        }),
    [],
  );
  useEffect(() => {
    void load();
    api<{ available: boolean }>("/api/coach")
      .then((d) => setAiAvailable(d.available))
      .catch(() => {});
    return () => {
      const rec = recognition.current;
      recognition.current = null;
      rec?.abort();
      aiAbort.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const storyDirty =
    !!storyDraft &&
    JSON.stringify(storyDraft) !==
      JSON.stringify(
        stories.find((s) => s.id === storyDraft.id) ?? {
          ...storyDraft,
          title: "",
          situation: "",
          task: "",
          action: "",
          result: "",
          tag: "Leadership",
        },
      );
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile);
  const answerDirty = !!answer.trim() && !savedId;
  useEffect(() => {
    if (!answerDirty && !storyDirty && !profileDirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      const leavingForSignIn = signInNavigation.current;
      signInNavigation.current = false;
      if (leavingForSignIn && !storyDirty && !profileDirty && !busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [answerDirty, storyDirty, profileDirty, busy]);
  const notes = guidance(category, profile, stories, question),
    metrics = evaluate(answer, voiceOnly ? voiceSeconds : 0, category);
  const roleQuestions = profile.role
    ? [
        {
          category: "Role-specific",
          text:
            "What makes you a strong fit for " +
            profile.role +
            (profile.company ? " at " + profile.company : "") +
            "?",
        },
        {
          category: "Role-specific",
          text:
            "How would you measure success in your first 90 days as " +
            profile.role +
            "?",
        },
      ]
    : [];
  const bank = [...roleQuestions, ...questions];
  const filtered = bank.filter(
    (q) =>
      (filter === "All" || q.category === filter) &&
      (q.text + " " + q.category).toLowerCase().includes(search.toLowerCase()),
  );
  const completed = sessions.length,
    average = completed
      ? Math.round(sessions.reduce((n, s) => n + s.review.score, 0) / completed)
      : 0;
  function retryLoad() {
    if (
      profileDirty &&
      !window.confirm(
        "Reload your saved workspace? Unsaved profile changes will be lost.",
      )
    )
      return;
    setLoading(true);
    setNotice("");
    void load();
  }
  function prepareSignIn(event: React.MouseEvent<HTMLAnchorElement>) {
    // A modified click may open a different tab while this draft stays here.
    // Never suppress this document's next unsaved-work warning in that case.
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    if (busyRef.current || loading) {
      event.preventDefault();
      return;
    }
    if (listening) {
      event.preventDefault();
      stopVoice();
      setNotice(
        "Microphone stopped. Check your transcript, then choose Sign in again.",
      );
      return;
    }
    if (answer.trim()) {
      if (window.top !== window.self) {
        event.preventDefault();
        setSignInDraftError(
          "Signing in leaves this view, so the draft may not carry over. Download your answer first, or continue without the draft.",
        );
        return;
      }
      const kept = writePracticeHandoff({
        question,
        category: category as PracticeDraft["category"],
        answer,
        seconds: voiceOnly ? voiceSeconds : 0,
        reviewed: !!review,
        focus: practiceFocus,
        mode,
      });
      if (!kept) {
        event.preventDefault();
        setSignInDraftError(
          "Your browser couldn’t keep a temporary copy. Download your answer before signing in, or continue without the draft.",
        );
        return;
      }
    } else if (!pendingPractice) {
      clearPracticeHandoff();
    }
    signInNavigation.current = answerDirty;
    setSignInDraftError("");
  }
  function resumePractice() {
    if (!pendingPractice || busyRef.current || loading) return;
    // Re-read the expiry at use time, including when the page has been left open.
    const draft = readPracticeHandoff();
    if (!draft) {
      setPendingPractice(null);
      setNotice(
        "This temporary draft has expired or is unavailable. You can start a new answer.",
      );
      return;
    }
    if (!resetQuestion(draft.question, draft.category)) return;
    setAnswer(draft.answer);
    setVoiceSeconds(draft.seconds);
    setVoiceOnly(draft.seconds > 0);
    setReview(
      draft.reviewed
        ? evaluate(draft.answer, draft.seconds, draft.category)
        : null,
    );
    setPracticeFocus(draft.focus);
    setMode(draft.mode);
    setQuickStarted(true);
    setTab(
      ["Technical", "System design"].includes(draft.category)
        ? "Technical lab"
        : "Practice room",
    );
    clearPracticeHandoff();
    setPendingPractice(null);
    setSignInDraftError("");
    setNotice("Practice answer restored. It is not saved to your history yet.");
  }
  function cancelAI() {
    aiAbort.current?.abort();
    aiAbort.current = null;
    setAiBusy(false);
  }
  function stopVoice() {
    recognition.current?.stop();
    setRunning(false);
  }
  function discardVoice() {
    const rec = recognition.current;
    recognition.current = null;
    activeVoice.current = false;
    rec?.abort();
    setListening(false);
    setInterim("");
    setRunning(false);
  }
  function resetQuestion(
    q: string,
    c: string,
    continueMock = false,
    retainsAnswer = false,
  ) {
    if (busyRef.current) return false;
    if (
      answerDirty &&
      !retainsAnswer &&
      !window.confirm("Replace this unsaved answer?")
    )
      return false;
    if (mockRun?.activeAnswer) {
      const captured = captureMockAnswer(mockRun, answer, savedId);
      setMockRun(continueMock ? captured : endMockRun(captured, false, false));
    }
    discardVoice();
    cancelAI();
    window.speechSynthesis?.cancel();
    setPracticeFocus("");
    setQuestion(q);
    setCategory(c);
    setAnswer("");
    setReview(null);
    setAiText("");
    setSeconds(0);
    setVoiceSeconds(0);
    setVoiceOnly(false);
    setSavedId("");
    sessionId.current = "";
    if (!continueMock) setMock(false);
    setNotice("");
    return true;
  }
  function changeTab(t: string) {
    if (busyRef.current) return;
    if (
      t === "Technical lab" &&
      !["Technical", "System design"].includes(category)
    ) {
      if (
        !resetQuestion(
          questions.find((q) => q.category === "Technical")!.text,
          "Technical",
        )
      )
        return;
    }
    if (
      t === "Practice room" &&
      ["Technical", "System design"].includes(category)
    ) {
      if (!resetQuestion(questions[0].text, "Behavioral")) return;
    }
    if (t !== "Practice room" && t !== "Technical lab") {
      stopVoice();
      cancelAI();
      window.speechSynthesis?.cancel();
    }
    setTab(t);
  }
  function switchMode(nextMode: "quick" | "advanced") {
    if (busyRef.current || loading) return;
    stopVoice();
    cancelAI();
    setMode(nextMode);
    if (nextMode === "quick") {
      if (tab === "Progress") setQuickHistoryOpen(!!selectedSession);
      if (mock) {
        if (mockRun)
          setMockRun(
            endMockRun(captureMockAnswer(mockRun, answer, savedId), false),
          );
        setMock(false);
        setNotice(
          "Mock interview ended. Your current answer and saved history are kept.",
        );
      }
      setQuickStarted((current) => current || !!answer.trim() || !!review);
      if (tab !== "Progress")
        setTab(
          ["Technical", "System design"].includes(category)
            ? "Technical lab"
            : "Practice room",
        );
    }
  }
  function startQuickPractice() {
    const nextQuestion = bank.find((q) => q.category === quickGoal)!;
    if (!resetQuestion(nextQuestion.text, nextQuestion.category)) return;
    setQuickStarted(true);
    setTab(quickGoal === "Technical" ? "Technical lab" : "Practice room");
  }
  function retryPractice(session?: Session) {
    const previous = session ?? { question, category, answer, review };
    if (!resetQuestion(previous.question, previous.category, false, !session))
      return;
    setAnswer(previous.answer);
    setPracticeFocus(
      previous.review?.next ||
        "Make one clear improvement, then practice again.",
    );
    setQuickStarted(true);
    setTab(
      ["Technical", "System design"].includes(previous.category)
        ? "Technical lab"
        : "Practice room",
    );
  }
  function showQuickPractice() {
    if (answer.trim() || review) setQuickStarted(true);
    stopVoice();
    cancelAI();
    setTab(
      ["Technical", "System design"].includes(category)
        ? "Technical lab"
        : "Practice room",
    );
  }
  function toggleMock() {
    if (mock) {
      stopVoice();
      cancelAI();
      if (mockRun)
        setMockRun(
          endMockRun(captureMockAnswer(mockRun, answer, savedId), false),
        );
      setMock(false);
      setTab("Progress");
      setNotice(
        "Mock interview ended. Your current answer is still here; saved answers are in Progress.",
      );
      return;
    }
    const items = bank.filter((q) => q.category === category);
    const currentIndex = Math.max(
      0,
      items.findIndex((q) => q.text === question),
    );
    const sequence = [
      ...items.slice(currentIndex),
      ...items.slice(0, currentIndex),
    ].slice(0, 5);
    if (!resetQuestion(sequence[0].text, sequence[0].category, true)) return;
    mockQuestions.current = sequence;
    setMockRun(beginMockRun(sequence));
    setMock(true);
    setRound(1);
    setNotice(
      "Mock interview started. Answer, review, then advance through five distinct questions.",
    );
  }
  function next() {
    if (listening) {
      stopVoice();
      setNotice("Microphone stopped. Check your transcript before continuing.");
      return;
    }
    if (mock && round >= mockQuestions.current.length) {
      if (answerDirty && !window.confirm("Finish without saving this answer?"))
        return;
      discardVoice();
      cancelAI();
      const finished = mockRun
        ? endMockRun(captureMockAnswer(mockRun, answer, savedId), true)
        : null;
      if (finished) setMockRun(finished);
      setMock(false);
      setTab("Progress");
      setNotice(
        `Mock interview complete. ${finished ? describeMockRun(finished, sessions).savedCount : 0} of ${mockQuestions.current.length} answers saved to Progress.`,
      );
      return;
    }
    const items = mock
      ? mockQuestions.current
      : bank.filter((q) => q.category === category);
    const index = mock
      ? round - 1
      : items.findIndex((q) => q.text === question);
    const nextQuestion = items[(index + 1) % items.length];
    if (resetQuestion(nextQuestion.text, nextQuestion.category, mock) && mock) {
      setMockRun((run) => (run ? advanceMockRun(run) : run));
      setRound((r) => r + 1);
    }
  }
  async function save<T extends Profile | Story | Omit<Session, "review">>(
    kind: string,
    data: T,
  ) {
    if (busyRef.current || !workspaceReady) return null;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      return await api<{ data: T }>("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, data }),
      });
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function saveAnswer() {
    if (!answer.trim() || listening || busyRef.current) return;
    stopVoice();
    const r = evaluate(answer, voiceOnly ? voiceSeconds : 0, category);
    setReview(r);
    if (!workspaceReady) {
      setNotice(
        signedIn
          ? "Feedback ready. This answer is not saved; retry loading your workspace to save it."
          : "Feedback ready. Sign in if you want to save this answer, or export it now.",
      );
      return;
    }
    sessionId.current ||= crypto.randomUUID();
    const s: Session = {
      id: sessionId.current,
      question,
      answer,
      category,
      seconds: voiceOnly ? voiceSeconds : 0,
      createdAt: new Date().toISOString(),
      review: r,
      ai: aiText || undefined,
    };
    const result = await save("session", s);
    if (result) {
      setSessions((prev) => [
        result.data,
        ...prev.filter((x) => x.id !== s.id),
      ]);
      setSelectedSession((current) =>
        current?.id === s.id ? result.data : current,
      );
      setReview(result.data.review);
      setSavedId(s.id);
      setMockRun((run) => (run ? recordMockSave(run, result.data) : run));
      setNotice(ANSWER_SAVED_NOTICE);
    }
  }
  function openStory(story: Story) {
    if (storyDirty && !window.confirm("Replace this unsaved story?")) return;
    setStoryDraft({ ...story });
    changeTab("Story library");
  }
  async function saveStory() {
    if (!storyDraft?.title.trim()) {
      setNotice("Give this story a title.");
      return;
    }
    const result = await save("story", storyDraft);
    if (result) {
      setStories((s) => [
        result.data,
        ...s.filter((x) => x.id !== storyDraft.id),
      ]);
      setStoryDraft(null);
      setNotice("Story saved.");
    }
  }
  async function remove(id: string, kind: "story" | "session") {
    if (
      busyRef.current ||
      !workspaceReady ||
      !window.confirm("Delete this " + kind + " permanently?")
    )
      return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api(
        "/api/workspace?id=" + encodeURIComponent(id) + "&kind=" + kind,
        { method: "DELETE" },
      );
      if (kind === "story") {
        setStories((s) => s.filter((x) => x.id !== id));
        if (storyDraft?.id === id) setStoryDraft(null);
      } else {
        setSessions((s) => s.filter((x) => x.id !== id));
        setSelectedSession(null);
        if (savedId === id) setSavedId("");
      }
      setNotice("Deleted.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function askAI() {
    if (!aiEnabled || !aiAvailable || listening || aiAbort.current) return;
    setAiBusy(true);
    setNotice("");
    const controller = new AbortController();
    aiAbort.current = controller;
    try {
      const d = await api<{ text: string }>("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          answer,
          category,
          profile,
          stories: stories.slice(0, 5),
        }),
        signal: controller.signal,
      });
      if (aiAbort.current === controller && !controller.signal.aborted) {
        setAiText(d.text);
        setSavedId("");
      }
    } catch (e) {
      if (aiAbort.current === controller && !controller.signal.aborted)
        setNotice((e as Error).message);
    } finally {
      if (aiAbort.current === controller) {
        aiAbort.current = null;
        setAiBusy(false);
      }
    }
  }
  function listen() {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const SR =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SR) {
      setNotice(
        "Voice transcription is unavailable in this browser. Try Chrome or Edge, or type your answer.",
      );
      return;
    }
    cancelAI();
    window.speechSynthesis?.cancel();
    const rec = new SR();
    recognition.current = rec;
    setListening(true);
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => {
      if (recognition.current !== rec) return;
      voiceStart.current = Date.now();
      activeVoice.current = true;
      setRunning(true);
      if (!answer.trim()) setVoiceOnly(true);
    };
    rec.onresult = (e) => {
      if (recognition.current !== rec) return;
      let final = "",
        partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else partial += e.results[i][0].transcript;
      }
      if (final) {
        setAnswer((a) => (a + " " + final).trim().slice(0, 30000));
        setReview(null);
        setSavedId("");
        setAiText("");
      }
      setInterim(partial);
    };
    rec.onerror = (e) => {
      if (recognition.current !== rec) return;
      setNotice(
        e.error === "not-allowed"
          ? "Microphone permission was denied. Enable it in your browser or type your answer."
          : "Transcription stopped (" +
              e.error +
              "). You can retry or continue typing.",
      );
      rec.onend?.();
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      if (activeVoice.current) {
        setVoiceSeconds((s) => s + (Date.now() - voiceStart.current) / 1000);
        activeVoice.current = false;
      }
      recognition.current = null;
      setListening(false);
      setInterim("");
      setRunning(false);
    };
    try {
      rec.start();
    } catch {
      recognition.current = null;
      setListening(false);
      setNotice(
        "Could not start the microphone. Try again or type your answer.",
      );
    }
  }
  function speak() {
    if (!window.speechSynthesis) {
      setNotice("Read-aloud is unavailable in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(question);
    u.lang = language;
    window.speechSynthesis.speak(u);
  }
  function answerEdit(value: string) {
    cancelAI();
    setAnswer(value);
    setVoiceOnly(false);
    setReview(null);
    setSavedId("");
    setAiText("");
  }
  function sessionExport(s: Session) {
    download(
      "interview-review-" + s.id.slice(0, 8) + ".md",
      "# Interview review\n\n" +
        s.question +
        "\n\n" +
        s.answer +
        "\n\n## Built-in rubric\n\n" +
        s.review.score +
        "% checks met. This is a keyword-based coaching aid, not a hiring prediction.\n\n" +
        s.review.checks
          .map((c) => (c.pass ? "✓ " : "○ ") + c.label + ": " + c.advice)
          .join("\n") +
        "\n\nNext step: " +
        s.review.next +
        (s.ai ? "\n\n## AI feedback\n" + s.ai : ""),
    );
  }
  const isRoom = tab === "Practice room" || tab === "Technical lab";
  const visibleMockRun = mockRun?.ended
    ? captureMockAnswer(mockRun, answer, savedId)
    : null;
  const recap = visibleMockRun ? (
    <MockRecap
      run={visibleMockRun}
      sessions={sessions}
      currentDraft={visibleMockRun.activeAnswer && answerDirty}
      onReturn={showQuickPractice}
      onRetry={retryPractice}
      onSelect={(session) => {
        setSelectedSession(session);
        setQuickHistoryOpen(true);
        requestAnimationFrame(() => {
          const detail = document.getElementById("saved-answer-detail");
          detail?.focus({ preventScroll: true });
          detail?.scrollIntoView({ block: "start" });
        });
      }}
    />
  ) : null;
  return (
    <div
      className={"shell " + (mode === "quick" ? "quick-mode" : "advanced-mode")}
    >
      {mode === "advanced" && (
        <aside>
          <div className="brand">
            <AudioLines /> Interview<span>OS</span>
          </div>
          <div className="workspace-label">YOUR WORKSPACE</div>
          <nav>
            {navigation.map(([label, Icon]) => (
              <button
                key={label}
                disabled={busy || loading}
                aria-current={label === tab ? "page" : undefined}
                onClick={() => changeTab(label)}
                className={label === tab ? "selected" : ""}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
          <div className="aside-bottom">
            <div className="private-label">
              <span className="avatar">YO</span>
              <div>
                Your workspace
                <small>
                  {workspaceReady
                    ? "Private · saved to your account"
                    : "Practice mode · not connected"}
                </small>
              </div>
            </div>
            <p>One good answer at a time.</p>
          </div>
        </aside>
      )}
      <main>
        <header className="workspace-header">
          <span className="header-brand">
            {mode === "quick" ? (
              <>
                <AudioLines size={21} />
                InterviewOS
              </>
            ) : (
              <>
                Workspace / <b>{tab}</b>
              </>
            )}
          </span>
          <div className="mode-switch" role="group" aria-label="Workspace mode">
            <button
              disabled={busy || loading}
              aria-pressed={mode === "quick"}
              onClick={() => switchMode("quick")}
            >
              Quick practice
            </button>
            <button
              disabled={busy || loading}
              aria-pressed={mode === "advanced"}
              onClick={() => switchMode("advanced")}
            >
              Advanced workspace
            </button>
          </div>
        </header>
        {mode === "quick" && (
          <nav className="quick-nav" aria-label="Quick practice navigation">
            <button
              disabled={busy || loading}
              aria-current={isRoom ? "page" : undefined}
              onClick={showQuickPractice}
            >
              Practice
            </button>
            <button
              disabled={busy || loading}
              aria-current={tab === "Progress" ? "page" : undefined}
              onClick={() => {
                setQuickHistoryOpen(false);
                changeTab("Progress");
              }}
            >
              Saved answers{sessions.length > 0 ? ` (${sessions.length})` : ""}
            </button>
          </nav>
        )}
        <section className="page">
          {loading && (
            <div className="banner" role="status">
              Loading your saved workspace…
            </div>
          )}
          {notice &&
            !(
              notice === ANSWER_SAVED_NOTICE &&
              mode === "quick" &&
              isRoom &&
              quickStarted &&
              review &&
              savedId
            ) && (
              <div className="banner" role="status">
                <span>{notice}</span>
                <button
                  onClick={() => setNotice("")}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </div>
            )}
          {!signedIn && (
            <div className="banner">
              <span>
                You can try practice now. Sign in to save your stories and
                progress.
              </span>
              <a
                href="/signin-with-chatgpt?return_to=/"
                target="_top"
                onClick={prepareSignIn}
              >
                Sign in
              </a>
              <button disabled={loading} onClick={retryLoad}>
                Retry
              </button>
            </div>
          )}
          {!signedIn &&
            !!answer.trim() &&
            !pendingPractice &&
            !signInDraftError && (
              <p className="micro-copy">
                Where supported, sign-in keeps this practice answer in this tab
                for up to 30 minutes. Otherwise, download it before continuing.
                Other unsaved edits are not included.
              </p>
            )}
          {signInDraftError && !signedIn && (
            <div className="banner" role="alert">
              <span>{signInDraftError}</span>
              <button
                onClick={() =>
                  download("answer-draft.txt", question + "\n\n" + answer)
                }
              >
                Download draft
              </button>
              <a
                href="/signin-with-chatgpt?return_to=/"
                target="_top"
                onClick={(event) => {
                  if (
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey ||
                    event.button !== 0
                  )
                    return;
                  clearPracticeHandoff();
                  signInNavigation.current = answerDirty;
                }}
              >
                Continue without draft
              </a>
            </div>
          )}
          {!loading && pendingPractice && (
            <div
              className="banner"
              role="region"
              aria-label="Resume practice after sign-in"
            >
              <span>
                Your practice answer is ready to resume. It was kept temporarily
                in this tab for sign-in and has not been saved to your history.
              </span>
              <button disabled={busy} onClick={resumePractice}>
                Resume answer
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  clearPracticeHandoff();
                  setPendingPractice(null);
                }}
              >
                Discard draft
              </button>
            </div>
          )}
          {loadError && signedIn && (
            <div className="banner" role="alert">
              <span>
                Your saved workspace is unavailable. You can practice and export
                a draft. Retry before saving to avoid overwriting existing data.
              </span>
              <button disabled={loading} onClick={retryLoad}>
                Retry loading workspace
              </button>
            </div>
          )}
          <fieldset
            className="workspace-content"
            disabled={loading || busy}
            aria-busy={loading || busy}
          >
            {mode === "quick" && isRoom && (
              <QuickPractice
                started={quickStarted}
                canSave={workspaceReady}
                canResume={!!answer.trim() || !!review}
                onResume={() => setQuickStarted(true)}
                goal={quickGoal}
                onGoal={setQuickGoal}
                onStart={startQuickPractice}
                question={question}
                category={category}
                answer={answer}
                onAnswer={answerEdit}
                review={review}
                saved={!!savedId}
                busy={busy || aiBusy}
                listening={listening}
                interim={interim}
                language={language}
                onLanguage={setLanguage}
                onListen={listen}
                onSpeak={speak}
                onReview={saveAnswer}
                onRetry={() => retryPractice()}
                onNext={next}
                onChooseGoal={() => {
                  stopVoice();
                  cancelAI();
                  setQuickStarted(false);
                }}
                onAdvanced={() => switchMode("advanced")}
                onExport={() =>
                  download("answer-draft.txt", question + "\n\n" + answer)
                }
                focus={practiceFocus}
                guidance={notes.steps}
                detailedReview={review ? <ReviewPanel review={review} /> : null}
              />
            )}
            {mode === "quick" && tab === "Progress" && (
              <QuickHistory
                canSave={workspaceReady}
                signedIn={signedIn}
                sessions={sessions}
                selected={quickHistoryOpen ? selectedSession : null}
                onSelect={(session) => {
                  setSelectedSession(session);
                  setQuickHistoryOpen(true);
                }}
                onBack={() => setQuickHistoryOpen(false)}
                onRetry={retryPractice}
                onExport={sessionExport}
                onDelete={(s) => remove(s.id, "session")}
                onPractice={showQuickPractice}
                recap={recap}
                detailedReview={
                  selectedSession ? (
                    <ReviewPanel review={selectedSession.review} />
                  ) : null
                }
              />
            )}
            {mode === "advanced" && isRoom && (
              <>
                <div className="heading">
                  <div>
                    <div className="eyebrow">
                      {tab === "Technical lab"
                        ? "THINK IT THROUGH. TALK IT THROUGH."
                        : "A LITTLE PRACTICE. A BIG DIFFERENCE."}
                    </div>
                    <h1>
                      {tab === "Technical lab"
                        ? "Show your thinking."
                        : "Your next great answer."}
                    </h1>
                    <p>
                      {profile.role
                        ? profile.role +
                          (profile.company ? " · " + profile.company : "")
                        : "Make your experience the strongest thing in the room."}
                    </p>
                  </div>
                  <button onClick={toggleMock}>
                    <Play size={16} />
                    {mock ? "End mock interview" : "Start mock interview"}
                  </button>
                </div>
                <div className="toolbar">
                  <div className="tabs">
                    {(tab === "Technical lab"
                      ? ["Technical", "System design"]
                      : [
                          "Behavioral",
                          "Leadership",
                          "Role-specific",
                          "Recruiter",
                          "Negotiation",
                        ]
                    ).map((c) => (
                      <button
                        key={c}
                        aria-pressed={category === c}
                        className={category === c ? "active" : ""}
                        onClick={() =>
                          resetQuestion(
                            bank.find((q) => q.category === c)!.text,
                            c,
                          )
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <span className="timer">
                    <Clock3 size={16} />
                    {time(seconds)}
                    <button
                      aria-label={running ? "Pause timer" : "Start timer"}
                      onClick={() => {
                        if (listening) stopVoice();
                        else setRunning(!running);
                      }}
                    >
                      {running ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  </span>
                </div>
                {mock && (
                  <div className="mock-progress">
                    <span>
                      Mock interview · Question {Math.min(round, 5)} of 5
                    </span>
                    <progress max={5} value={Math.min(round - 1, 5)} />
                    <span>
                      Only reviewed and saved answers count toward your
                      progress.
                    </span>
                  </div>
                )}
                <div className="room">
                  <div className="practice">
                    <div className="panel-top">
                      <span className="tag">{category.toUpperCase()}</span>
                      <button
                        className="icon-button"
                        disabled={listening}
                        aria-label="Read question aloud"
                        onClick={speak}
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>
                    <h2>{question}</h2>
                    <p className="muted">
                      {category === "Technical" || category === "System design"
                        ? "Explain your approach, trade-offs, and how you would test it."
                        : "Take a breath. Set the scene, then focus on what you did."}
                    </p>
                    <label htmlFor="answer">
                      {tab === "Technical lab"
                        ? "Your solution & explanation"
                        : "Your answer"}
                    </label>
                    <textarea
                      id="answer"
                      className={tab === "Technical lab" ? "code-input" : ""}
                      maxLength={30000}
                      value={answer}
                      disabled={listening}
                      onChange={(e) => answerEdit(e.target.value)}
                      placeholder={
                        tab === "Technical lab"
                          ? "Write your approach or paste code here. Code is reviewed, not executed."
                          : "Start with the situation. What was at stake?"
                      }
                    />
                    <div className="interim" aria-live="polite">
                      {interim || (listening ? "Listening…" : "")}
                    </div>
                    <div className="voice-row">
                      <button
                        onClick={listen}
                        className={listening ? "recording" : ""}
                      >
                        {listening ? <Square size={16} /> : <Mic size={16} />}{" "}
                        {listening ? "Stop microphone" : "Speak your answer"}
                      </button>
                      <select
                        aria-label="Speech language"
                        value={language}
                        disabled={listening}
                        onChange={(e) => setLanguage(e.target.value)}
                      >
                        <option value="en-US">English</option>
                        <option value="es-ES">Español</option>
                        <option value="fr-FR">Français</option>
                        <option value="de-DE">Deutsch</option>
                        <option value="hi-IN">हिन्दी</option>
                        <option value="ja-JP">日本語</option>
                      </select>
                    </div>
                    <p className="micro-copy">
                      Microphone starts only when you choose. Your browser may
                      send audio to its speech service. Transcripts are saved
                      only with your review.
                    </p>
                    <div className="panel-bottom">
                      <span>
                        {metrics.words} words · {metrics.fillers} filler words
                      </span>
                      <button
                        disabled={
                          !answer.trim() ||
                          busy ||
                          listening ||
                          loading ||
                          !workspaceReady ||
                          aiBusy
                        }
                        className="primary"
                        onClick={saveAnswer}
                      >
                        {busy
                          ? "Saving…"
                          : savedId
                            ? "Update review"
                            : "Review & save"}{" "}
                        <Sparkles size={16} />
                      </button>
                    </div>
                    {review && <ReviewPanel review={review} />}
                    <div className="room-footer">
                      <button onClick={next}>
                        {mock && round === 5
                          ? "Finish mock interview"
                          : mock && !answer.trim()
                            ? "Skip question"
                            : "Next question"}{" "}
                        <ChevronRight size={16} />
                      </button>
                      {answer && (
                        <button
                          onClick={() =>
                            download(
                              "answer-draft.txt",
                              question + "\n\n" + answer,
                            )
                          }
                        >
                          <Download size={15} />
                          Export draft
                        </button>
                      )}
                    </div>
                    <details className="custom">
                      <summary>Use your own interview question</summary>
                      <label htmlFor="custom">Question</label>
                      <input
                        id="custom"
                        maxLength={3000}
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder="Paste a question to practice"
                      />
                      <button
                        disabled={!custom.trim()}
                        onClick={() => resetQuestion(custom.trim(), category)}
                      >
                        Use question
                      </button>
                    </details>
                  </div>
                  <div className="coach">
                    <div className="coach-title">
                      <Sparkles size={20} />
                      <h3>Your coaching notes</h3>
                    </div>
                    <p>Give your answer a clear shape.</p>
                    {notes.steps.map((x, i) => (
                      <div className="step" key={x}>
                        <span>{notes.labels[i]}</span>
                        <p>{x}</p>
                      </div>
                    ))}
                    <div className="context-note">
                      <BriefcaseBusiness size={17} />
                      <p>{notes.context}</p>
                    </div>
                    {notes.story ? (
                      <div className="story-match">
                        <small>FROM YOUR STORY LIBRARY</small>
                        <h3>{notes.story.title}</h3>
                        <p>{notes.story.action}</p>
                        <button onClick={() => openStory(notes.story!)}>
                          Review story <ChevronRight size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="tip">
                        Build a few real stories you can adapt to different
                        questions.
                        <button
                          className="text-button"
                          onClick={() => changeTab("Story library")}
                        >
                          Open story library <ArrowUpRight size={15} />
                        </button>
                      </div>
                    )}
                    {aiAvailable && aiEnabled ? (
                      <>
                        <button
                          className="primary full"
                          disabled={aiBusy || listening || !signedIn}
                          onClick={askAI}
                        >
                          <Sparkles size={16} />
                          {aiBusy ? "Thinking…" : "Get AI coaching"}
                        </button>
                        <p className="micro-copy">
                          Sends this answer, your role, resume, and up to five
                          stories to OpenAI.
                        </p>
                      </>
                    ) : (
                      <p className="micro-copy">
                        Built-in coach · framework guidance and transparent
                        keyword checks. Optional AI can add personalized
                        feedback.
                      </p>
                    )}
                    {aiText && (
                      <div className="ai-feedback">
                        <h3>AI coaching</h3>
                        <p>{aiText}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bottom-strip">
                  <div>
                    <span className="metric-value">{completed}</span>
                    <span>answers practiced</span>
                  </div>
                  <div>
                    <span className="metric-value">{stories.length}</span>
                    <span>stories ready to use</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => changeTab("Progress")}
                  >
                    See your progress <ArrowUpRight size={16} />
                  </button>
                </div>
              </>
            )}
            {tab === "Role & resume" && (
              <>
                <PageHeading
                  eyebrow="MAKE IT PERSONAL"
                  title="Your experience. Your next role."
                  text="Give your preparation a clear target."
                />
                <div className="two-col">
                  <div className="card">
                    <h3>Target opportunity</h3>
                    <label htmlFor="role">Role</label>
                    <input
                      id="role"
                      maxLength={150}
                      value={profile.role}
                      onChange={(e) =>
                        setProfile({ ...profile, role: e.target.value })
                      }
                      placeholder="e.g. Senior Product Manager"
                    />
                    <label htmlFor="company">Company</label>
                    <input
                      id="company"
                      maxLength={150}
                      value={profile.company}
                      onChange={(e) =>
                        setProfile({ ...profile, company: e.target.value })
                      }
                      placeholder="Company name"
                    />
                    <label htmlFor="job">Job description</label>
                    <textarea
                      id="job"
                      maxLength={30000}
                      value={profile.job}
                      onChange={(e) =>
                        setProfile({ ...profile, job: e.target.value })
                      }
                      placeholder="Paste the responsibilities and requirements…"
                    />
                    <p className="micro-copy">
                      Used as context for optional AI coaching. Company facts
                      are not automatically researched.
                    </p>
                  </div>
                  <div className="card">
                    <h3>Your background</h3>
                    <label htmlFor="resume">Resume or experience notes</label>
                    <textarea
                      id="resume"
                      className="tall"
                      maxLength={30000}
                      value={profile.resume}
                      onChange={(e) =>
                        setProfile({ ...profile, resume: e.target.value })
                      }
                      placeholder="Paste your resume text, projects, skills, and achievements…"
                    />
                    <label className="file-label">
                      Import plain text (.txt)
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        onChange={async (e) => {
                          const input = e.currentTarget;
                          const f = input.files?.[0];
                          if (!f || busyRef.current) return;
                          busyRef.current = true;
                          setBusy(true);
                          try {
                            if (!f.name.toLowerCase().endsWith(".txt")) {
                              setNotice(
                                "Choose a plain text (.txt) file, or paste your resume text.",
                              );
                              return;
                            }
                            if (f.size > 100000) {
                              setNotice("Use a text file smaller than 100 KB.");
                              return;
                            }
                            const text = await f.text();
                            if (text.length > 30000) {
                              setNotice(
                                "Please limit your resume to 30,000 characters.",
                              );
                              return;
                            }
                            setProfile((p) => ({ ...p, resume: text }));
                          } catch {
                            setNotice(
                              "This file could not be read. Try again or paste its text.",
                            );
                          } finally {
                            input.value = "";
                            busyRef.current = false;
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    <p className="micro-copy">
                      Saved privately to your account. Paste text from PDF or
                      Word files.
                    </p>
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={busy || loading || !workspaceReady}
                    onClick={async () => {
                      const result = await save("profile", profile);
                      if (result) {
                        setProfile(result.data);
                        setSavedProfile(result.data);
                        setNotice("Role and resume saved.");
                      }
                    }}
                  >
                    Save profile <Check size={16} />
                  </button>
                  <button
                    onClick={() => {
                      changeTab("Question bank");
                      setFilter("Role-specific");
                    }}
                  >
                    Practice for this role <ArrowUpRight size={16} />
                  </button>
                </div>
              </>
            )}
            {tab === "Story library" && (
              <>
                <PageHeading
                  eyebrow="YOUR EXPERIENCE, READY TO TELL"
                  title="Build your story bank."
                  text="Keep the real examples that make your answers memorable."
                  action={
                    <button
                      className="primary"
                      onClick={() => openStory(blankStory())}
                    >
                      <Plus size={17} />
                      New story
                    </button>
                  }
                />
                {storyDraft && (
                  <div className="card story-editor">
                    <h3>
                      {stories.some((s) => s.id === storyDraft.id)
                        ? "Edit story"
                        : "A new STAR story"}
                    </h3>
                    <div className="two-col">
                      <div>
                        <label htmlFor="story-title">Story title</label>
                        <input
                          id="story-title"
                          maxLength={200}
                          value={storyDraft.title}
                          onChange={(e) =>
                            setStoryDraft({
                              ...storyDraft,
                              title: e.target.value,
                            })
                          }
                          placeholder="e.g. Turned a delayed launch around"
                        />
                      </div>
                      <div>
                        <label htmlFor="story-tag">Theme</label>
                        <select
                          id="story-tag"
                          value={storyDraft.tag}
                          onChange={(e) =>
                            setStoryDraft({
                              ...storyDraft,
                              tag: e.target.value,
                            })
                          }
                        >
                          {[
                            "Leadership",
                            "Conflict",
                            "Impact",
                            "Failure",
                            "Growth",
                            "Collaboration",
                            "Technical",
                          ].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="two-col">
                      {(["situation", "task", "action", "result"] as const).map(
                        (field, i) => (
                          <div key={field}>
                            <label htmlFor={field}>
                              {"STAR"[i]} ·{" "}
                              {field[0].toUpperCase() + field.slice(1)}
                            </label>
                            <textarea
                              id={field}
                              maxLength={6000}
                              value={storyDraft[field]}
                              onChange={(e) =>
                                setStoryDraft({
                                  ...storyDraft,
                                  [field]: e.target.value,
                                })
                              }
                              placeholder={
                                [
                                  "What was happening? Why did it matter?",
                                  "What were you responsible for?",
                                  "What did you do and why?",
                                  "What changed? Include real results and lessons.",
                                ][i]
                              }
                            />
                          </div>
                        ),
                      )}
                    </div>
                    <div className="actions">
                      <button
                        className="primary"
                        disabled={
                          busy || !workspaceReady || !storyDraft.title.trim()
                        }
                        onClick={saveStory}
                      >
                        Save story <Check size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            !storyDirty ||
                            window.confirm(
                              "Close this story editor? Unsaved changes will be lost.",
                            )
                          )
                            setStoryDraft(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {stories.length === 0 && !storyDraft ? (
                  <Empty
                    icon={<BookOpen />}
                    title="Your best examples belong here."
                    text="Start with a project you are proud of, a challenge you overcame, or a lesson that changed how you work."
                  />
                ) : (
                  <div className="story-grid">
                    {stories.map((s) => (
                      <article className="card" key={s.id}>
                        <span className="tag">{s.tag}</span>
                        <h3>{s.title}</h3>
                        <p>
                          {s.situation ||
                            "Add the situation to complete this story."}
                        </p>
                        <div className="story-result">
                          <strong>RESULT</strong>
                          <p>{s.result || "Add your outcome."}</p>
                        </div>
                        <div className="actions">
                          <button onClick={() => openStory(s)}>
                            Edit story
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Delete " + s.title}
                            onClick={() => remove(s.id, "story")}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
            {tab === "Question bank" && (
              <>
                <PageHeading
                  eyebrow="PREPARE FOR THE MOMENTS THAT MATTER"
                  title="Find your next question."
                  text="Explore the library or bring a question of your own."
                />
                <div className="search-row">
                  <div className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Search questions"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search questions or topics"
                    />
                  </div>
                  <select
                    aria-label="Filter by interview type"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {["All", ...categories].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <p className="muted">{filtered.length} questions</p>
                <div className="question-list">
                  {filtered.map((q, i) => (
                    <button
                      key={q.text}
                      onClick={() => {
                        if (resetQuestion(q.text, q.category))
                          setTab(
                            q.category === "Technical" ||
                              q.category === "System design"
                              ? "Technical lab"
                              : "Practice room",
                          );
                      }}
                    >
                      <span className="question-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <small>{q.category}</small>
                        <strong>{q.text}</strong>
                      </span>
                      <ArrowUpRight size={19} />
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <Empty
                    icon={<Search />}
                    title="No matching questions."
                    text="Try another search or choose a different category."
                  />
                )}
              </>
            )}
            {mode === "advanced" && tab === "Progress" && (
              <>
                <PageHeading
                  eyebrow="SMALL IMPROVEMENTS ADD UP"
                  title="See how far you’ve come."
                  text="Your actual practice history, with a clear next step."
                  action={
                    <button
                      disabled={
                        !sessions.length &&
                        !stories.length &&
                        !Object.values(profile).some(Boolean)
                      }
                      onClick={() =>
                        download(
                          "interviewos-export.json",
                          JSON.stringify(
                            { profile, stories, sessions },
                            null,
                            2,
                          ),
                          "application/json",
                        )
                      }
                    >
                      <Download size={16} />
                      Export workspace
                    </button>
                  }
                />
                {recap}
                <div className="stats">
                  <div className="card">
                    <small>Answers practiced</small>
                    <strong>{completed}</strong>
                  </div>
                  <div className="card">
                    <small>Average rubric coverage</small>
                    <strong>{completed ? average + "%" : "—"}</strong>
                  </div>
                  <div className="card">
                    <small>Stories in your library</small>
                    <strong>{stories.length}</strong>
                  </div>
                </div>
                {sessions.length ? (
                  <>
                    <div className="card trend">
                      <div className="section-heading">
                        <h3>Last {Math.min(10, sessions.length)} answers</h3>
                        <small>Built-in rubric coverage</small>
                      </div>
                      <div className="bars">
                        {sessions
                          .slice(0, 10)
                          .reverse()
                          .map((s, i) => (
                            <button
                              aria-label={
                                "Review answer " +
                                (i + 1) +
                                ", " +
                                s.review.score +
                                " percent"
                              }
                              key={s.id}
                              onClick={() => setSelectedSession(s)}
                            >
                              <span>{s.review.score}%</span>
                              <div
                                style={{
                                  height: Math.max(3, s.review.score) + "%",
                                }}
                              />
                              <small>{i + 1}</small>
                            </button>
                          ))}
                      </div>
                      <p className="micro-copy">
                        Keyword checks indicate structure and detail; they do
                        not measure correctness, predict hiring, or replace
                        human feedback. English checks may undercount other
                        languages.
                      </p>
                    </div>
                    <div className="two-col history">
                      <div>
                        <h3>Session history</h3>
                        {sessions.map((s) => (
                          <button
                            className="history-row"
                            key={s.id}
                            onClick={() => setSelectedSession(s)}
                          >
                            <span className="score-mini">
                              {s.review.score}%
                            </span>
                            <span>
                              <strong>{s.question}</strong>
                              <small>
                                {s.category} ·{" "}
                                {new Date(s.createdAt).toLocaleDateString()}
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      </div>
                      <div
                        className="card"
                        id="saved-answer-detail"
                        tabIndex={-1}
                      >
                        {selectedSession ? (
                          <>
                            <div className="section-heading">
                              <span className="tag">
                                {selectedSession.category}
                              </span>
                              <button
                                className="icon-button"
                                aria-label="Delete session"
                                onClick={() =>
                                  remove(selectedSession.id, "session")
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <h3>{selectedSession.question}</h3>
                            <p className="saved-answer">
                              {selectedSession.answer}
                            </p>
                            <ReviewPanel review={selectedSession.review} />
                            <button
                              className="primary"
                              onClick={() => retryPractice(selectedSession)}
                            >
                              Practice this question again{" "}
                              <RotateCcw size={16} />
                            </button>
                            {selectedSession.ai && (
                              <div className="ai-feedback">
                                <h3>AI feedback</h3>
                                <p>{selectedSession.ai}</p>
                              </div>
                            )}
                            <button
                              onClick={() => sessionExport(selectedSession)}
                            >
                              <Download size={16} />
                              Export review
                            </button>
                          </>
                        ) : (
                          <>
                            <Sparkles className="blue" />
                            <h3>Your next step</h3>
                            <p>{sessions[0].review.next}</p>
                            <button
                              onClick={() => {
                                if (
                                  resetQuestion(
                                    sessions[0].question,
                                    sessions[0].category,
                                  )
                                )
                                  setTab(
                                    ["Technical", "System design"].includes(
                                      sessions[0].category,
                                    )
                                      ? "Technical lab"
                                      : "Practice room",
                                  );
                              }}
                            >
                              Practice again <RotateCcw size={16} />
                            </button>
                            <p className="micro-copy">
                              Select an answer to see its full transcript and
                              review.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <Empty
                    icon={<ChartNoAxesCombined />}
                    title="Your progress starts with one answer."
                    text="Practice a question and choose Review & save. Your feedback and history will appear here."
                  />
                )}
              </>
            )}
            {tab === "Research & settings" && (
              <>
                <PageHeading
                  eyebrow="RESEARCH INTO PRACTICE"
                  title="Ten capabilities. One workspace."
                  text="A practical synthesis of existing interview assistants, researched September 20, 2026."
                />
                <div className="card settings">
                  <h3>Coaching engine</h3>
                  <p>
                    {aiAvailable
                      ? "An AI provider is connected. Enable it to request personalized coaching."
                      : "Built-in coaching is active. No AI API key is configured for this app."}
                  </p>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      disabled={!aiAvailable}
                      checked={aiEnabled}
                      onChange={(e) => {
                        setAiEnabled(e.target.checked);
                        if (!e.target.checked) {
                          cancelAI();
                          setAiText("");
                        }
                      }}
                    />
                    Enable optional AI coaching
                  </label>
                  <p className="micro-copy">
                    When you request AI coaching, your selected context is sent
                    to OpenAI. The key stays on the server. Built-in guidance
                    works without an account with an AI provider.
                  </p>
                  <details>
                    <summary>AI setup and current scope</summary>
                    <p>
                      To enable AI, the site owner must connect an OpenAI API
                      key as the OPENAI_API_KEY site secret and publish the app
                      again. OPENAI_MODEL can select a compatible Responses API
                      model. This build has no provider credentials and its AI
                      responses have not been live-tested.
                    </p>
                    <p>
                      Voice uses browser speech recognition, not direct meeting
                      audio capture. Technical answers are reviewed, not
                      executed. This web app does not include a desktop overlay,
                      screen solving, meeting integrations, or video recording.
                    </p>
                  </details>
                </div>
                <div className="capabilities">
                  {capabilities.map((c, i) => (
                    <div className="capability" key={c.title}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{c.title}</h3>
                        <p>{c.detail}</p>
                        <a href={c.url} target="_blank" rel="noreferrer">
                          Source: {c.source} <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h3>About your data</h3>
                  <p>
                    Your role, stories, and saved reviews are stored in your
                    private workspace. Microphone audio is not stored by this
                    app. You can export your workspace from Progress and delete
                    individual stories or reviews.
                  </p>
                  <p className="micro-copy">
                    These capabilities are selected for preparation value and
                    recurrence across products, not a measured market-share
                    ranking. Vendor claims are not independent performance
                    benchmarks.
                  </p>
                </div>
              </>
            )}
          </fieldset>
        </section>
      </main>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty card">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ReviewPanel({ review }: { review: Review }) {
  return (
    <div className="review">
      <div className="section-heading">
        <h3>Answer review</h3>
        <strong>{review.score}% checks met</strong>
      </div>
      <div className="review-metrics">
        <span>{review.words} words</span>
        <span>{review.fillers} fillers</span>
        {review.pace !== null && <span>{review.pace} words/min</span>}
      </div>
      {review.checks.map((c) => (
        <div className={"check " + (c.pass ? "pass" : "")} key={c.label}>
          <span>{c.pass ? <Check size={15} /> : <CircleHelp size={15} />}</span>
          <div>
            <strong>{c.label}</strong>
            {!c.pass && <p>{c.advice}</p>}
          </div>
        </div>
      ))}
      <p className="micro-copy">
        Rule-based English keyword checks, not an assessment of accuracy or
        hiring potential. Speaking pace is shown only for unedited voice answers
        with at least 10 seconds of audio.
      </p>
    </div>
  );
}
