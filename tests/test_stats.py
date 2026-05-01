from fastapi import status
from datetime import datetime
from unittest.mock import patch


class TestStats:
    """统计功能测试"""

    def test_get_stats_summary_requires_auth(self, client, db_session):
        """测试获取统计摘要需要认证"""
        response = client.get("/api/stats/summary")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_stats_summary(self, client, db_session, test_user):
        """测试获取统计摘要"""
        # 先创建一些测试数据
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="标准俯卧撑", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        record = ExerciseRecord(
            user_id=test_user["user"].id,
            exercise_id=exercise.id,
            score=85.5,
            count=20,
            duration=120,
        )
        db_session.add(record)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/stats/summary", headers=headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "exercise_stats" in data
        assert "category_stats" in data
        assert "recent_records" in data

    def test_get_weekly_stats_requires_auth(self, client, db_session):
        """测试获取周统计需要认证"""
        response = client.get("/api/stats/weekly")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_weekly_stats(self, client, db_session, test_user):
        """测试获取周统计"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/stats/weekly", headers=headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)

    def test_get_weekly_stats_uses_utc_day_boundaries(
        self, client, db_session, test_user
    ):
        """测试周统计按 UTC 日期边界分组"""
        from app.models.exercise import Exercise, ExerciseRecord

        exercise = Exercise(name="测试动作", category="上肢")
        db_session.add(exercise)
        db_session.commit()

        records = [
            ExerciseRecord(
                user_id=test_user["user"].id,
                exercise_id=exercise.id,
                score=80,
                count=10,
                duration=60,
                created_at=datetime(2026, 1, 2, 23, 59, 59),
            ),
            ExerciseRecord(
                user_id=test_user["user"].id,
                exercise_id=exercise.id,
                score=85,
                count=12,
                duration=65,
                created_at=datetime(2026, 1, 3, 0, 0, 0),
            ),
        ]
        db_session.add_all(records)
        db_session.commit()

        headers = {"Authorization": f"Bearer {test_user['token']}"}
        with patch("app.api.stats.utc_now", return_value=datetime(2026, 1, 5, 12, 0, 0)):
            response = client.get("/api/stats/weekly", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert [entry["date"] for entry in data] == ["2026-01-02", "2026-01-03"]

    def test_get_personal_best_requires_auth(self, client, db_session):
        """测试获取个人最佳需要认证"""
        response = client.get("/api/stats/personal-best")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_personal_best(self, client, db_session, test_user):
        """测试获取个人最佳"""
        headers = {"Authorization": f"Bearer {test_user['token']}"}
        response = client.get("/api/stats/personal-best", headers=headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)

    def test_inactive_user_cannot_access_stats(
        self, client, db_session, inactive_test_user
    ):
        """测试已注销账户无法访问统计接口"""
        headers = {"Authorization": f"Bearer {inactive_test_user['token']}"}

        summary_response = client.get("/api/stats/summary", headers=headers)
        weekly_response = client.get("/api/stats/weekly", headers=headers)
        best_response = client.get("/api/stats/personal-best", headers=headers)

        assert summary_response.status_code == status.HTTP_403_FORBIDDEN
        assert weekly_response.status_code == status.HTTP_403_FORBIDDEN
        assert best_response.status_code == status.HTTP_403_FORBIDDEN
