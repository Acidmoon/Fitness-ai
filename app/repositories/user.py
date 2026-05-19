"""Repository for User database operations."""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    """Encapsulates common User queries."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> Optional[User]:
        """Get a user by primary key."""
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_username(self, username: str) -> Optional[User]:
        """Get a user by username."""
        return self.db.query(User).filter(User.username == username).first()

    def get_by_email(self, email: str) -> Optional[User]:
        """Get a user by email."""
        return self.db.query(User).filter(User.email == email).first()

    def username_exists(self, username: str, exclude_id: Optional[int] = None) -> bool:
        """Check if a username is already taken."""
        query = self.db.query(User).filter(User.username == username)
        if exclude_id is not None:
            query = query.filter(User.id != exclude_id)
        return query.first() is not None

    def email_exists(self, email: str, exclude_id: Optional[int] = None) -> bool:
        """Check if an email is already taken."""
        query = self.db.query(User).filter(User.email == email)
        if exclude_id is not None:
            query = query.filter(User.id != exclude_id)
        return query.first() is not None
