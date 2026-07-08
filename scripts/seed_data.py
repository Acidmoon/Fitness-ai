from app.database import SessionLocal
from app.services.exercise_catalog import seed_exercise_catalog


def seed_exercises():
    db = SessionLocal()
    try:
        summary = seed_exercise_catalog(db)
        print(
            "✅ 动作目录同步完成："
            f"新增 {summary.created}，更新 {summary.updated}，"
            f"跳过 {summary.skipped}，外部来源 {summary.total_source} 条，"
            f"无器械候选 {summary.bodyweight_count} 条"
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed_exercises()
