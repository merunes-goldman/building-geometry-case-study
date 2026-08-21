"""Database layer: the connection pool (`pool`), the schema (`schema.sql`) and the plain SQL (`storage`).

No ORM and no migration tool: the schema is applied on every start and is idempotent. A connection handed out by
the `pool.Connection` dependency is one transaction: committed when the request succeeds, rolled back when it raises.
"""
