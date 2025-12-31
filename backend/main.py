from fastapi import FastAPI
from celery import Celery

app = FastAPI()

celery_app = Celery(
    "backend",
    broker="redis://redis:6379/0",
    backend="redis://redis:6379/0"
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/trigger-task")
def trigger_task():
    celery_app.send_task("worker.test_task")
    return {"task": "sent"}
