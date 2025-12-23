"""
Simple in-memory Job manager for background tasks (mod installation)
"""
import threading
import uuid
import time
from typing import Any, Dict, Callable, List, Optional
from dataclasses import dataclass, field


@dataclass
class Job:
    id: str
    type: str
    status: str = "pending"  # pending, running, completed, failed, cancelled
    progress: int = 0
    logs: List[str] = field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    created_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None


class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        self.lock = threading.Lock()

    def create_job(self, job_type: str, target: Callable[..., Any], *args, **kwargs) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(id=job_id, type=job_type)
        with self.lock:
            self.jobs[job_id] = job

        # Start worker thread
        t = threading.Thread(target=self._run_job, args=(job, target, args, kwargs), daemon=True)
        t.start()
        return job

    def _run_job(self, job: Job, target: Callable[..., Any], args, kwargs):
        job.status = "running"
        self._append_log(job, "Job started")
        try:
            result = target(job, *args, **kwargs)
            job.result = result
            if job.status != "cancelled":
                job.status = "completed"
                job.progress = 100
                self._append_log(job, "Job completed")
        except Exception as e:
            job.status = "failed"
            job.result = {"error": str(e)}
            self._append_log(job, f"Job failed: {e}")
        finally:
            job.finished_at = time.time()

    def _append_log(self, job: Job, message: str):
        ts = int(time.time())
        entry = f"[{ts}] {message}"
        with self.lock:
            job.logs.append(entry)
            if len(job.logs) > 1000:
                job.logs = job.logs[-1000:]

    def get_job(self, job_id: str) -> Optional[Job]:
        with self.lock:
            return self.jobs.get(job_id)

    def list_jobs(self) -> List[Job]:
        with self.lock:
            return list(self.jobs.values())

    def cancel_job(self, job_id: str) -> bool:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return False
            if job.status in ("completed", "failed", "cancelled"):
                return False
            job.status = "cancelled"
            self._append_log(job, "Job cancelled by user")
            return True


# Singleton
_job_manager: Optional[JobManager] = None

def get_job_manager() -> JobManager:
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
    return _job_manager
