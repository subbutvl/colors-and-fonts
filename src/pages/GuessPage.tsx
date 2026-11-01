import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { StarButton } from "../components/StarButton";
import { copyText } from "../lib/colors";
import {
  AXIS_LABELS,
  dailySeed,
  dailyStreak,
  distance,
  EMPTY_STATS,
  makeRound,
  parseStats,
  points,
  recordRound,
  shareLine,
  today,
  type GuessStats,
  type Puzzle,
} from "../lib/guess";
import { getRawSettings, setRawSetting } from "../lib/settings";
import type { Section } from "../sections";
import { useStarred } from "../useStarred";

const STATS_KEY = "guess.stats";

type Mode = "daily" | "practice";

interface Answer {
  pick: string;
  points: number;
}

function verdict(a: Answer, answer: string): string {
  if (a.points === 100) return "Exactly right";
  const d = distance(a.pick, answer);
  return d < 5 ? "Very close" : d < 10 ? "Close" : "Not quite";
}

/** Guess the color (12): pick the next color in a sequence. */
export function GuessPage({ section }: { section: Section }) {
  const date = today();
  const [mode, setMode] = useState<Mode>("daily");
  const [seed, setSeed] = useState(() => dailySeed(date));
  const round = useMemo(() => makeRound(seed), [seed]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [stats, setStats] = useState<GuessStats>(EMPTY_STATS);
  const [status, setStatus] = useState<string | null>(null);
  const { isStarred, toggle } = useStarred();

  useEffect(() => {
    getRawSettings(STATS_KEY)
      .then((s) => setStats(parseStats(s[STATS_KEY])))
      .catch(() => setStats(EMPTY_STATS));
  }, []);

  const puzzle: Puzzle | undefined = round[index];
  const answered = answers[index];
  const finished = answers.length === round.length && !puzzle;
  const score = answers.reduce((s, a) => s + a.points, 0);
  const streak = (() => {
    let n = 0;
    for (let i = answers.length - 1; i >= 0 && answers[i].points === 100; i--) n++;
    return n;
  })();
  const bestStreakThisRound = answers.reduce(
    (acc, a) => {
      const run = a.points === 100 ? acc.run + 1 : 0;
      return { run, best: Math.max(acc.best, run) };
    },
    { run: 0, best: 0 },
  ).best;
  const playedToday = stats.daily[date];

  const start = useCallback(
    (m: Mode) => {
      setMode(m);
      setSeed(m === "daily" ? dailySeed(date) : (Math.random() * 2 ** 32) >>> 0);
      setIndex(0);
      setAnswers([]);
      setStatus(null);
    },
    [date],
  );

  const choose = (pick: string) => {
    if (!puzzle || answered) return;
    setAnswers((list) => [...list, { pick, points: points(pick, puzzle.answer) }]);
  };

  const finish = useCallback(
    async (all: Answer[]) => {
      const total = all.reduce((s, a) => s + a.points, 0);
      const best = all.reduce((acc, a) => (a.points === 100 ? { run: acc.run + 1, best: Math.max(acc.best, acc.run + 1) } : { run: 0, best: acc.best }), { run: 0, best: 0 }).best;
      const next = recordRound(stats, { score: total, bestStreak: best, date: mode === "daily" ? date : undefined });
      setStats(next);
      try {
        await setRawSetting(STATS_KEY, JSON.stringify(next));
      } catch (e) {
        setStatus(`Could not save your stats: ${e}`);
      }
    },
    [stats, mode, date],
  );

  const next = useCallback(() => {
    if (!answered) return;
    const n = index + 1;
    setIndex(n);
    if (n === round.length) void finish(answers);
  }, [answered, index, round.length, finish, answers]);

  // Keys: 1 to 5 pick an option, Enter or Space goes on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (!puzzle) return;
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= puzzle.options.length) {
        e.preventDefault();
        choose(puzzle.options[n - 1]);
      } else if (answered && (e.key === "Enter" || (e.key === " " && t?.tagName !== "BUTTON"))) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const share = () =>
    copyText(`${shareLine(score, round.length, mode === "daily" ? date : undefined)}\n${answers.map((a) => (a.points === 100 ? "🟩" : a.points >= 60 ? "🟨" : "⬛")).join("")}`)
      .then(() => setStatus("Copied your result"))
      .catch((e) => setStatus(`Copy failed: ${e}`));

  return (
    <div className="page">
      <PageHead section={section} />

      <div className="toolbar-row">
        <div className="font-cats" role="group" aria-label="Mode">
          <button type="button" className={`chip-btn${mode === "daily" ? " on" : ""}`} aria-pressed={mode === "daily"} onClick={() => start("daily")}>
            Daily round
          </button>
          <button type="button" className={`chip-btn${mode === "practice" ? " on" : ""}`} aria-pressed={mode === "practice"} onClick={() => start("practice")}>
            Practice
          </button>
        </div>
        <span className="spacer" />
        <dl className="guess-stats">
          <div>
            <dt>Best round</dt>
            <dd>{stats.bestScore}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{stats.bestStreak}</dd>
          </div>
          <div>
            <dt>Daily streak</dt>
            <dd>{dailyStreak(stats, date)}</dd>
          </div>
        </dl>
      </div>

      {puzzle ? (
        <section className="guess-card" aria-label="Puzzle">
          <div className="guess-head">
            <span>
              Puzzle {index + 1} of {round.length} · <b>{AXIS_LABELS[puzzle.axis]}</b>
              {mode === "daily" && playedToday !== undefined && <small> · replay, not counted</small>}
            </span>
            <span className="guess-score">
              Score <b>{score}</b>
              {streak > 1 && <span className="badge pass">{streak} in a row</span>}
            </span>
          </div>
          <p className="help">Which color comes next? The {AXIS_LABELS[puzzle.axis].toLowerCase()} changes by the same amount each step.</p>

          <ol className="guess-seq" aria-label="Sequence">
            {puzzle.shown.map((c, i) => (
              <li key={i} style={{ background: c }} aria-label={c} />
            ))}
            <li className={`guess-next${answered ? " shown" : ""}`} style={answered ? { background: puzzle.answer } : undefined} aria-label={answered ? `Answer ${puzzle.answer}` : "Next color"}>
              {!answered && "?"}
            </li>
          </ol>

          <div className="guess-options" role="group" aria-label="Options">
            {puzzle.options.map((c, i) => {
              const state = !answered ? "" : c === puzzle.answer ? " right" : c === answered.pick ? " wrong" : " dim";
              return (
                <button key={c} type="button" className={`guess-option${state}`} style={{ background: c }} onClick={() => choose(c)} disabled={!!answered} aria-label={`Option ${i + 1}${answered ? `, ${c}` : ""}`}>
                  <kbd>{i + 1}</kbd>
                </button>
              );
            })}
          </div>

          <div className="guess-result" role="status">
            {answered ? (
              <>
                <span>
                  <b>{verdict(answered, puzzle.answer)}</b> · +{answered.points}
                  {answered.points < 100 && <span className="mono"> · ΔE {distance(answered.pick, puzzle.answer).toFixed(1)}</span>}
                  <span className="mono"> · answer {puzzle.answer}</span>
                </span>
                <button type="button" className="primary-btn" onClick={next} autoFocus>
                  {index + 1 === round.length ? "See results" : "Next"} <kbd>Enter</kbd>
                </button>
              </>
            ) : (
              <span className="help">Click an option or press 1 to {puzzle.options.length}. A near miss still scores.</span>
            )}
          </div>
        </section>
      ) : (
        finished && (
          <section className="guess-card" aria-label="Results">
            <div className="guess-head">
              <span>
                {mode === "daily" ? `Daily round, ${date}` : "Practice round"} · <b>{score}</b> / {round.length * 100}
              </span>
              <span className="guess-score">Longest run of exact answers: {bestStreakThisRound}</span>
            </div>
            <ol className="guess-summary">
              {round.map((p, i) => {
                const a = answers[i];
                return (
                  <li key={i}>
                    <span className="guess-mini">
                      {p.shown.map((c, k) => (
                        <span key={k} style={{ background: c }} />
                      ))}
                      <span className="guess-mini-answer" style={{ background: p.answer }} title={`Answer ${p.answer}`} />
                    </span>
                    <span className="guess-mini-pick" style={{ background: a.pick }} title={`Your pick ${a.pick}`} />
                    <small>{AXIS_LABELS[p.axis]}</small>
                    <b>+{a.points}</b>
                    <StarButton on={isStarred(p.answer)} onClick={() => toggle(p.answer)} />
                  </li>
                );
              })}
            </ol>
            <div className="toolbar-row">
              <button type="button" className="secondary-btn" onClick={() => void share()}>
                Copy result
              </button>
              <span className="spacer" />
              <button type="button" className="primary-btn" onClick={() => start("practice")}>
                {mode === "daily" ? "Practice round" : "Play again"}
              </button>
            </div>
            <p className="help" role="status">
              {status ??
                (mode === "daily"
                  ? playedToday !== undefined && playedToday !== score
                    ? `Today's counted score is ${playedToday}. A new daily round starts tomorrow.`
                    : "Saved as today's score. A new daily round starts tomorrow."
                  : "Star a color to keep it in Saved.")}
            </p>
          </section>
        )
      )}

      <p className="note">
        Colors step evenly in OKLCH, so each step looks about the same size. Points come from the CIEDE2000 difference between your pick and the answer: 100 for the answer, fewer the further away it is. The daily round is the same for everyone on a given date.
      </p>
    </div>
  );
}
