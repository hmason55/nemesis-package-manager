"""Cloud HTTP dispatch, separate from the existing serialized USB endpoints.

The handler authenticates the local session before calling these functions.
Only cloud downloads run in a background thread; USB selection remains owned by
the synchronous HTTP server and publication rechecks its selection capability.
"""

import json
from urllib.parse import parse_qs


def cloud_get(handler, route):
    """Handle a cloud read, returning False for an ordinary local UI route."""
    if not route.path.startswith("/api/cloud/"):
        return False
    query = parse_qs(route.query)
    jobs = handler.server.cloud
    if route.path == "/api/cloud/packages":
        result = jobs.registry().packages(
            query.get("q", [""])[0],
            query.get("category", [""])[0],
            int(query.get("page", ["1"])[0]),
        )
    elif route.path == "/api/cloud/package":
        result = jobs.registry().package(query.get("id", [""])[0])
    elif route.path == "/api/cloud/job":
        result = jobs.snapshot()
    elif route.path == "/api/cloud/updates":
        result = jobs.updates()
    else:
        handler.respond(404, {"error": "Not found."})
        return True
    handler.respond(200, result)
    return True


def cloud_post(handler, route, length):
    """Start/cancel jobs; reject local drive mutations until publication finishes.

    A running job owns the drive selection. Cancellation sets an event rather
    than terminating a thread in the middle of a data-preserving directory swap.
    """
    jobs = handler.server.cloud
    if route.path not in ("/api/cloud/start", "/api/cloud/cancel"):
        state = jobs.snapshot()
        if state and state["status"] == "running":
            raise ValueError(
                "Finish or cancel cloud preparation before changing drives or importing files."
            )
        return False
    if not 0 < length <= 65536:
        raise ValueError("Invalid cloud request size.")
    data = json.loads(handler.rfile.read(length))
    if not isinstance(data, dict):
        raise ValueError("Supply a cloud request object.")
    if route.path.endswith("cancel"):
        jobs.cancelled.set()
        result = jobs.snapshot()
    else:
        result = jobs.start(data.get("selection_id"), data.get("items"))
    handler.respond(202, result)
    return True
