"""Create every table in whatever DATABASE_URL points at (Railway Postgres when
set, local SQLite otherwise). Idempotent — safe to re-run.

    cd Backend && python push_schema.py
"""
from sqlalchemy import inspect

from database import Base, engine, ensure_columns


def main() -> None:
    print("target:", engine.url.render_as_string(hide_password=True))
    Base.metadata.create_all(bind=engine)
    ensure_columns()
    print("tables:", sorted(inspect(engine).get_table_names()))


if __name__ == "__main__":
    main()
