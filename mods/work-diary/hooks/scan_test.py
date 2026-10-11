"""Tests of scan.py: python3 -I hooks/scan_test.py"""
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("scan", os.path.join(HERE, "scan.py"))
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

SECRET = "testo-segreto-del-messaggio"
BASE = datetime(2026, 10, 9, 9, 0, tzinfo=timezone.utc).astimezone()


def stamp(minutes):
    return (BASE + timedelta(minutes=minutes)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def user(minutes, content, **extra):
    return {"type": "user", "timestamp": stamp(minutes), "sessionId": "s1", "cwd": extra.pop("cwd", "/r/proj"),
            "gitBranch": extra.pop("branch", "HEAD"), "message": {"role": "user", "content": content}, **extra}


def assistant(minutes, *uses, **extra):
    blocks = [{"type": "text", "text": SECRET}] + [{"type": "tool_use", "id": "t", "name": n, "input": i} for n, i in uses]
    return {"type": "assistant", "timestamp": stamp(minutes), "sessionId": "s1", "cwd": "/r/proj",
            "gitBranch": extra.pop("branch", "feature/x"), "message": {"role": "assistant", "content": blocks}, **extra}


class ScanFile(unittest.TestCase):
    def write(self, lines):
        handle = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
        for line in lines:
            handle.write((line if isinstance(line, str) else json.dumps(line)) + "\n")
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_counts_prompts_commands_and_edits_without_any_text(self):
        path = self.write([
            user(0, SECRET),
            user(0, [{"type": "text", "text": SECRET}]),
            assistant(1, ("Bash", {"command": "echo " + SECRET}), ("Edit", {"file_path": "/r/proj/a.py", "old_string": SECRET})),
            user(2, [{"type": "tool_result", "content": SECRET}]),
            user(2, SECRET, isMeta=True),
            user(2, SECRET, isCompactSummary=True),
            assistant(3, ("Write", {"file_path": "/r/proj/b.py", "content": SECRET}), ("Edit", {"file_path": "/r/proj/a.py"}),
                      ("NotebookEdit", {"notebook_path": "/r/proj/n.ipynb"}), ("Read", {"file_path": "/r/proj/c.py"})),
            assistant(4, ("Bash", {"command": "ls"}), isSidechain=True),
            # A detached HEAD after a branch: the branch stays.
            user(5, [{"type": "tool_result", "content": SECRET}], branch="HEAD"),
            {"type": "ai-title", "aiTitle": "Primo titolo", "sessionId": "s1"},
            {"type": "ai-title", "aiTitle": "Titolo finale", "sessionId": "s1"},
            "{not json",
        ])
        [day] = scan.scan_file(path, "2026-01-01")

        self.assertNotIn(SECRET, json.dumps(day))
        self.assertEqual(day["prompts"], 2)
        self.assertEqual(day["commands"], 1)
        self.assertEqual(day["edits"], ["/r/proj/a.py", "/r/proj/b.py", "/r/proj/n.ipynb"])
        self.assertEqual(day["title"], "Titolo finale")
        self.assertEqual(day["branch"], "feature/x")
        self.assertEqual(day["project"], "/r/proj")

    def test_gaps_count_up_to_the_idle_cap_and_split_spans(self):
        # 0, 10, then 70 (an hour's pause is no work), 75: 10 + 5 minutes; two spans.
        path = self.write([user(0, "a"), user(10, "b"), user(70, "c"), user(75, "d")])
        [day] = scan.scan_file(path, "2026-01-01")

        self.assertEqual(day["activeMinutes"], 15)
        self.assertEqual(len(day["spans"]), 2)
        self.assertEqual(day["spans"][0][0], day["start"])
        self.assertEqual(day["spans"][1][1], day["end"])

    def test_a_session_over_midnight_is_two_days_and_days_before_since_are_left_out(self):
        midnight = (BASE.replace(hour=0, minute=0) + timedelta(days=1) - BASE).total_seconds() / 60
        path = self.write([user(0, "a"), user(midnight - 5, "b"), user(midnight + 5, "c")])
        days = scan.scan_file(path, "2026-01-01")
        self.assertEqual([d["day"] for d in days], ["2026-10-09", "2026-10-10"])
        self.assertEqual(days[1]["activeMinutes"], 0)

        later = scan.scan_file(path, "2026-10-10")
        self.assertEqual([d["day"] for d in later], ["2026-10-10"])


class Main(unittest.TestCase):
    def test_prints_today_sessions_and_the_persons_commits_once_per_repository(self):
        root = tempfile.mkdtemp()
        repo = os.path.join(root, "repo")
        os.makedirs(repo)
        env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null"}

        def git(*args, who="me@example.com"):
            subprocess.run(["git", "-C", repo, "-c", "user.email=" + who, "-c", "user.name=x", *args],
                           check=True, capture_output=True, env=env)

        git("init", "-q")
        subprocess.run(["git", "-C", repo, "config", "user.email", "me@example.com"], check=True, env=env)
        git("commit", "-q", "--allow-empty", "-m", "feat: mio")
        git("commit", "-q", "--allow-empty", "-m", "feat: di un collega", who="other@example.com")
        # A stash is commits too: none of them is work to show.
        with open(os.path.join(repo, "f.txt"), "w") as handle:
            handle.write("uno")
        git("add", "f.txt")
        git("commit", "-q", "-m", "feat: file")
        with open(os.path.join(repo, "f.txt"), "w") as handle:
            handle.write("due")
        git("stash", "-q")
        worktree = os.path.join(repo, ".claude", "worktrees", "w")
        git("worktree", "add", "-q", worktree)

        projects = os.path.join(root, "projects")
        os.makedirs(os.path.join(projects, "p"))
        now = datetime.now(timezone.utc)
        lines = [
            {"type": "user", "timestamp": now.isoformat(), "sessionId": "a", "cwd": repo, "message": {"content": "x"}},
            {"type": "user", "timestamp": now.isoformat(), "sessionId": "b", "cwd": worktree, "message": {"content": "x"}},
        ]
        lines.append({"type": "assistant", "timestamp": now.isoformat(), "sessionId": "c", "cwd": root,
                      "message": {"content": [{"type": "tool_use", "name": "Edit", "input": {"file_path": os.path.join(repo, "f.txt")}}]}})
        for name, line in zip("abc", lines):
            with open(os.path.join(projects, "p", name + ".jsonl"), "w") as handle:
                handle.write(json.dumps(line) + "\n")

        out = io.StringIO()
        with redirect_stdout(out):
            scan.main(projects, (now - timedelta(days=2)).strftime("%Y-%m-%d"))
        printed = json.loads(out.getvalue())

        self.assertEqual(printed["today"], datetime.now().astimezone().strftime("%Y-%m-%d"))
        self.assertEqual(sorted(s["sessionId"] for s in printed["sessions"]), ["a", "b", "c"])
        repos = {s["sessionId"]: os.path.realpath(s["repo"]) for s in printed["sessions"]}
        # The worktree's session is the repository's; the one above it, the repository it edited in.
        self.assertEqual(repos, {"a": os.path.realpath(repo), "b": os.path.realpath(repo), "c": os.path.realpath(repo)})
        self.assertEqual(sorted(c["subject"] for c in printed["commits"]), ["feat: file", "feat: mio"])
        self.assertEqual(os.path.realpath(printed["commits"][0]["project"]), os.path.realpath(repo))


if __name__ == "__main__":
    unittest.main()
