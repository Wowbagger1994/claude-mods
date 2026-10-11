"""Reads Claude Code transcripts, and the commits of their projects, into facts per day.

python3 scan.py <projectsDir> <sinceDay YYYY-MM-DD>

Prints one JSON object: {"today": day, "sessions": [SessionDay], "commits": [Commit]} (types/index.d.ts),
days in the Mac's time zone.

Only facts leave this script: times, counts, the session's title, the paths of files edited.
Never a message's text, a tool's input other than a file path, or a tool's output.
"""
import glob
import json
import os
import subprocess
import sys
from datetime import datetime

# A pause longer than this is not work: it ends a span of work.
IDLE_CAP_MINUTES = 15
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def local_time(stamp):
    """An ISO timestamp (UTC `Z` or with offset) in the Mac's time zone; None when unreadable."""
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone()
    except (AttributeError, ValueError):
        return None


def is_persons_prompt(line):
    """A user line the person typed: not a tool's result, not one Claude Code added."""
    if line.get("isMeta") or line.get("isCompactSummary") or line.get("isVisibleInTranscriptOnly"):
        return False
    content = (line.get("message") or {}).get("content")
    if isinstance(content, str):
        return content.strip() != ""
    if isinstance(content, list):
        return any(isinstance(b, dict) and b.get("type") == "text" for b in content)
    return False


def tool_uses(line):
    content = (line.get("message") or {}).get("content")
    if not isinstance(content, list):
        return []
    return [b for b in content if isinstance(b, dict) and b.get("type") == "tool_use"]


def new_day(session_id, day, line):
    return {
        "sessionId": session_id,
        "day": day,
        "project": line.get("cwd") or "",
        "branch": None,
        "title": None,
        "times": [],
        "prompts": 0,
        "edits": [],
        "commands": 0,
    }


def add_line(day_facts, when, line):
    day_facts["times"].append(when)
    if not day_facts["project"] and line.get("cwd"):
        day_facts["project"] = line["cwd"]
    if line.get("gitBranch") and line.get("gitBranch") != "HEAD":
        day_facts["branch"] = line["gitBranch"]
    if line.get("type") == "user" and is_persons_prompt(line):
        day_facts["prompts"] += 1
    if line.get("type") == "assistant":
        for use in tool_uses(line):
            name = use.get("name")
            given = use.get("input") or {}
            if name == "Bash":
                day_facts["commands"] += 1
            elif name in EDIT_TOOLS:
                path = given.get("file_path") or given.get("notebook_path")
                if isinstance(path, str) and path not in day_facts["edits"]:
                    day_facts["edits"].append(path)


def spans_of(times):
    """The stretches of work: lines closer than the idle cap join one span. Sessions in parallel overlap here,
    so a day's time is the union of its spans, not the sum of its sessions."""
    spans = []
    for when in sorted(times):
        if spans and (when - spans[-1][1]).total_seconds() / 60 <= IDLE_CAP_MINUTES:
            spans[-1][1] = when
        else:
            spans.append([when, when])
    return [[a.isoformat(timespec="seconds"), b.isoformat(timespec="seconds")] for a, b in spans]


def scan_file(path, since):
    days = {}
    title = None
    session_id = os.path.splitext(os.path.basename(path))[0]
    with open(path, encoding="utf-8", errors="replace") as handle:
        for raw in handle:
            try:
                line = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(line, dict) or line.get("isSidechain"):
                continue
            if line.get("type") == "ai-title" and isinstance(line.get("aiTitle"), str):
                title = line["aiTitle"]
                continue
            if line.get("type") not in ("user", "assistant"):
                continue
            when = local_time(line.get("timestamp"))
            if when is None:
                continue
            day = when.strftime("%Y-%m-%d")
            if day < since:
                continue
            if day not in days:
                days[day] = new_day(line.get("sessionId") or session_id, day, line)
            add_line(days[day], when, line)
    for facts in days.values():
        times = facts.pop("times")
        facts["title"] = title
        facts["start"] = min(times).isoformat(timespec="seconds")
        facts["end"] = max(times).isoformat(timespec="seconds")
        facts["spans"] = spans_of(times)
        # The spans' own length, as the day's time is their union: the two never disagree.
        facts["activeMinutes"] = round(
            sum((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() for a, b in facts["spans"]) / 60
        )
    return list(days.values())


GIT_TIMEOUT_S = 10


def git(directory, *args):
    """A git command's output, stripped; None when git fails or the directory is no repository."""
    try:
        done = subprocess.run(
            ["git", "-C", directory, *args], capture_output=True, text=True, timeout=GIT_TIMEOUT_S, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout.strip() if done.returncode == 0 else None


def repo_of(directory):
    """The repository's main directory, the same for each of its worktrees; None outside a repository."""
    common = git(directory, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if common is None:
        return None
    return os.path.dirname(common) if os.path.basename(common) == ".git" else common


def commits_of(repo, since):
    """The person's commits since the first day, on every branch, as git config names the person."""
    email = git(repo, "config", "user.email")
    if not email:
        return []
    out = git(
        # Branches, remotes and tags, not --all: a stash's commits are no work of the day.
        repo, "log", "--branches", "--remotes", "--tags", "--no-merges", "--since=" + since + " 00:00", "--author=" + email,
        "--date=format-local:%Y-%m-%d %H:%M", "--pretty=format:%h%x09%ad%x09%s",
    )
    commits = []
    for row in (out or "").splitlines():
        parts = row.split("\t", 2)
        if len(parts) != 3 or " " not in parts[1]:
            continue
        day, time = parts[1].split(" ", 1)
        if day >= since:
            commits.append({"project": repo, "day": day, "time": time, "hash": parts[0], "subject": parts[2]})
    return commits


def repo_for(session, repo_at):
    """The repository the session worked in: its directory's, else the one most of its edits are in, else its directory."""
    own = repo_at.get(session["project"])
    if own:
        return own
    edited = [repo_at.get(os.path.dirname(e)) for e in session["edits"]]
    counts = {}
    for repo in filter(None, edited):
        counts[repo] = counts.get(repo, 0) + 1
    return max(sorted(counts), key=lambda r: counts[r]) if counts else session["project"]


def main(projects_dir, since):
    since_ms = datetime.strptime(since, "%Y-%m-%d").timestamp()
    sessions = []
    for path in sorted(glob.glob(os.path.join(projects_dir, "*", "*.jsonl"))):
        try:
            # A transcript last written before the first day holds nothing of it.
            if os.path.getmtime(path) < since_ms:
                continue
            sessions.extend(scan_file(path, since))
        except OSError:
            continue
    # A session started above its repositories (a folder of repos) still edits files in them.
    places = {s["project"] for s in sessions} | {os.path.dirname(e) for s in sessions for e in s["edits"]}
    repo_at = {d: repo_of(d) for d in sorted(places) if os.path.isdir(d)}
    for s in sessions:
        s["repo"] = repo_for(s, repo_at)
    repos = {r for r in repo_at.values() if r}
    commits = [c for repo in sorted(repos) for c in commits_of(repo, since)]
    today = datetime.now().astimezone().strftime("%Y-%m-%d")
    print(json.dumps({"today": today, "sessions": sessions, "commits": commits}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("uso: scan.py <projectsDir> <sinceDay YYYY-MM-DD>")
    main(sys.argv[1], sys.argv[2])
