import sys, os, traceback, json
from http.server import BaseHTTPRequestHandler, HTTPServer

errors = []

def try_import(name):
    try:
        __import__(name)
        errors.append(f"OK: {name}")
    except Exception as e:
        errors.append(f"FAIL {name}: {e}")

for pkg in ["fastapi", "pydantic", "uvicorn", "groq", "dotenv", "database", "rag", "nlp_adapter", "mcp_tools"]:
    try_import(pkg)

try:
    from main import app
    errors.append("OK: main imported")
    import uvicorn
    port = int(os.environ.get("PORT") or "8000")
    errors.append(f"OK: starting uvicorn on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
except Exception as e:
    errors.append(f"CRASH: {traceback.format_exc()}")
    body = json.dumps({"startup_errors": errors}, indent=2).encode()

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *a):
            pass

    port = int(os.environ.get("PORT") or "8000")
    errors.append(f"Fallback HTTP on port {port}")
    HTTPServer(("0.0.0.0", port), H).serve_forever()
