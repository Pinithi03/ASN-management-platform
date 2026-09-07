"""
ASN Management Platform — Backend Application (System A)

Business application serving the React frontend via REST API.
Architecture: 3-Layer (Presentation → Business Logic → Data Access)

Layers:
    - api/       : Presentation Layer (FastAPI routers & controllers)
    - services/  : Business Logic Layer (domain logic & orchestration)
    - repositories/ : Data Access Layer (database queries & external I/O)
"""
