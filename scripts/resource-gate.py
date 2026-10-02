import fcntl
import json
import os
import re
import signal
import subprocess
import sys
import time
from contextlib import suppress
from pathlib import Path

PROFILES = {
    "ci": (4, 6144),
    "ci-build": (4, 4096),
    "ci-smoke": (4, 6144),
    "ci-integration": (2, 2048),
    "ci-types": (2, 3072),
    "ci-test": (2, 2048),
    "ci-dead-code": (2, 2048),
    "ci-secrets": (1, 1024),
    "ci-audit": (1, 512),
    "ci-scripts": (1, 1024),
}


def log(message):
    print(f"ci-resource-gate: {message}", file=sys.stderr, flush=True)


def snapshot():
    override = os.environ.get("CI_GATE_HOST_JSON")
    if override:
        return json.loads(override)
    if sys.platform == "darwin":
        vm = subprocess.check_output(["vm_stat"], text=True)
        page_size = int(re.search(r"page size of (\d+) bytes", vm)[1])
        pages = dict(re.findall(r"([^\n:]+):\s+(\d+)\.", vm))
        available = sum(
            int(pages.get(name, 0))
            for name in ["Pages free", "Pages inactive", "Pages speculative"]
        )
        memory = available * page_size / 1048576
        pressure = subprocess.check_output(
            ["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], text=True
        ).strip()
        total = (
            int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True))
            / 1048576
        )
    elif sys.platform == "linux":
        info = dict(
            re.findall(
                r"^(\w+):\s+(\d+)", Path("/proc/meminfo").read_text(), re.MULTILINE
            )
        )
        memory = int(info["MemAvailable"]) / 1024
        total = int(info["MemTotal"]) / 1024
        pressure = "4" if memory / total < 0.1 else "1"
    else:
        raise RuntimeError("Local resource scheduling supports macOS and Linux.")
    return {
        "cpus": os.cpu_count() or 1,
        "load": os.getloadavg()[0],
        "memory_mb": memory,
        "total_mb": total,
        "pressure": pressure,
    }


def process_table():
    output = subprocess.check_output(
        ["ps", "-axo", "pid=,ppid=,pcpu=,rss=,lstart="], text=True
    )
    result = {}
    for line in output.splitlines():
        parts = line.split(None, 4)
        if len(parts) == 5:
            pid, parent, cpu, rss, started = parts
            result[int(pid)] = {
                "parent": int(parent),
                "cpu": float(cpu) / 100,
                "memory_mb": float(rss) / 1024,
                "started": started,
            }
    return result


def usage(pid, processes):
    family = {pid}
    while True:
        children = {
            key for key, value in processes.items() if value["parent"] in family
        }
        if children.issubset(family):
            break
        family.update(children)
    return (
        sum(processes[key]["cpu"] for key in family if key in processes),
        sum(processes[key]["memory_mb"] for key in family if key in processes),
    )


def decide(host, jobs, request):
    reserve_cpu = sum(max(0, job["cpus"] - job.get("used_cpu", 0)) for job in jobs)
    reserve_memory = sum(
        max(0, job["memory_mb"] - job.get("used_memory_mb", 0)) for job in jobs
    )
    cpu = host["cpus"] - host["load"] - reserve_cpu
    memory = host["memory_mb"] - max(1024, host["total_mb"] * 0.1) - reserve_memory
    fits = (
        cpu >= request["cpus"]
        and memory >= request["memory_mb"]
        and str(host.get("pressure", "1")) == "1"
    )
    return {
        "fits": fits,
        "free_cpu": round(cpu, 1),
        "free_memory_mb": round(memory),
        "running": len(jobs),
    }


def execute(goals, command):
    profiles = [PROFILES[goal] for goal in goals if goal in PROFILES]
    if os.environ.get("GITHUB_ACTIONS") == "true" or not profiles:
        os.execvp(command[0], command)
    cpus, memory = max(profiles, key=lambda profile: (profile[1], profile[0]))
    directory = Path(
        os.environ.get(
            "CI_GATE_DIR", str(Path.home() / ".cache" / "kyzen" / "ci-slots")
        )
    )
    directory.mkdir(parents=True, exist_ok=True)
    slot = directory / f"{os.getpid()}.json"
    interval = max(0.05, float(os.environ.get("CI_GATE_INTERVAL", "5")))
    timeout = max(0, float(os.environ.get("CI_GATE_TIMEOUT", "900")))
    deadline = time.monotonic() + timeout
    child = None

    def interrupt(signum, _frame):
        if child is not None and child.poll() is None:
            with suppress(ProcessLookupError):
                os.killpg(child.pid, signum)
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    try:
        with (directory / ".lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            processes = process_table()
            host = snapshot()
            cpus = min(cpus, max(1, host["cpus"] - 1))
            request = {
                "pid": os.getpid(),
                "started": processes[os.getpid()]["started"],
                "queued": time.time_ns(),
                "goals": goals,
                "cpus": cpus,
                "memory_mb": memory,
                "state": "waiting",
            }
            slot.write_text(json.dumps(request))
        while True:
            with (directory / ".lock").open("a+") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                processes = process_table()
                jobs = []
                waiting = []
                for path in directory.glob("*.json"):
                    try:
                        job = json.loads(path.read_text())
                    except json.JSONDecodeError:
                        path.unlink(missing_ok=True)
                        continue
                    process = processes.get(job["pid"])
                    if not process or process["started"] != job["started"]:
                        path.unlink(missing_ok=True)
                        continue
                    if job["state"] == "running":
                        job["used_cpu"], job["used_memory_mb"] = usage(
                            job["pid"], processes
                        )
                        jobs.append(job)
                    else:
                        waiting.append(job)
                decision = decide(snapshot(), jobs, request)
                first = (
                    min(waiting, key=lambda job: job["queued"])["pid"] == os.getpid()
                )
                if decision["fits"] and first:
                    request["state"] = "running"
                    slot.write_text(json.dumps(request))
                    break
            if time.monotonic() >= deadline:
                log(f"timed out waiting for {' '.join(goals)}; command was not started")
                return 1
            log(
                f"waiting for {' '.join(goals)}: needs {cpus} CPUs and {memory} MB; available {decision['free_cpu']} CPUs and {decision['free_memory_mb']} MB; {decision['running']} running jobs"
            )
            time.sleep(min(interval, max(0, deadline - time.monotonic())))
        log(
            f"starting {' '.join(goals)} with a reservation of {cpus} CPUs and {memory} MB"
        )
        child = subprocess.Popen(command, start_new_session=True)
        code = child.wait()
        return code if code >= 0 else 128 - code
    finally:
        if child is not None and child.poll() is None:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        slot.unlink(missing_ok=True)


def main():
    if sys.argv[1:2] == ["decide"]:
        payload = json.loads(sys.argv[2])
        print(json.dumps(decide(payload["host"], payload["jobs"], payload["request"])))
        return 0
    if sys.argv[1:3] != ["exec", "--goals"] or "--" not in sys.argv[3:]:
        raise SystemExit("usage: resource-gate.py exec --goals TARGET... -- COMMAND...")
    split = sys.argv.index("--")
    goals, command = sys.argv[3:split], sys.argv[split + 1 :]
    if not goals or not command:
        raise SystemExit("A target and command are required.")
    return execute(goals, command)


if __name__ == "__main__":
    sys.exit(main())
