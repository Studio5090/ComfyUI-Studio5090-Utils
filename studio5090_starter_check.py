# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Alan Rosenfeld
# Studio5090 — see LICENSE at the repository root for full terms.
# Provided "AS IS", without warranty of any kind.
"""Studio5090 starter project check (v1.7.57, v1.7.58, v1.7.59).

Studio5090 needs its starter project at ComfyUI/output/STUDIO5090/STUDIO5090/.
At startup this writes a clear warning to the ComfyUI log when it is missing,
and the browser shows a popup with the download link (js/studio5090_starter_check.js).

v1.7.59: the popup can install the starter project itself.  It downloads
STUDIO5090.zip from the latest GitHub release and unpacks it into the ComfyUI
output folder.  Files that already exist are never overwritten.
"""

import logging
import os
import threading
import zipfile

DOWNLOAD_URL = "https://github.com/Studio5090/ComfyUI-Studio5090-Utils/releases/latest"
ZIP_URL = DOWNLOAD_URL + "/download/STUDIO5090.zip"
DOCS_URL = DOWNLOAD_URL + "/download/Studio5090.Documentation.pdf"
ZIP_PREFIX = "STUDIO5090/STUDIO5090/"   # every file in the zip sits under this


def starter_path():
    import folder_paths
    return os.path.join(folder_paths.get_output_directory(), "STUDIO5090", "STUDIO5090")


def starter_present():
    try:
        return os.path.isdir(starter_path())
    except Exception:
        return True   # never block anything on a check that failed


def _has_files(path, skip=None):
    """True when path holds any file (empty folders do not count).  Studio5090
    makes empty project folders at startup, so only real files show where the
    project actually is."""
    for root, dirs, files in os.walk(path):
        if skip and os.path.abspath(root) == os.path.abspath(path):
            dirs[:] = [d for d in dirs if d != skip]
        if files:
            return True
    return False


def status():
    """{"present", "nested", "path", "nested_path", "url"}.
    present: the project is where it belongs.  nested: it is one folder too deep."""
    path = starter_path()
    deep = os.path.join(path, "STUDIO5090")
    nested = (os.path.isdir(deep) and _has_files(deep)
              and not _has_files(path, skip="STUDIO5090"))
    present = os.path.isdir(path) and not nested
    return {"present": present, "nested": nested, "path": path,
            "nested_path": deep if nested else "", "url": DOWNLOAD_URL}


def log_startup():
    st = status()
    if st["present"]:
        return
    bar = "=" * 72
    if st["nested"]:
        logging.warning(
            f"\n{bar}\n[Studio5090] The starter project is one folder too deep.\n"
            f"  Found:    {st['nested_path']}\n"
            f"  Expected: {st['path']}\n"
            f"  Move everything inside the inner STUDIO5090 folder up one level into the\n"
            f"  expected folder, delete the empty inner folder, then restart ComfyUI.\n{bar}")
        return
    logging.warning(
        f"\n{bar}\n[Studio5090] The starter project is missing.\n"
        f"  Expected folder: {st['path']}\n"
        f"  Download STUDIO5090.zip from:\n  {DOWNLOAD_URL}\n"
        f"  Extract it into your ComfyUI output folder, then restart ComfyUI.\n{bar}")


# ---------------------------------------------------------------- install (v1.7.59)

_install_lock = threading.Lock()
_install = {"state": "idle", "done": 0, "total": 0, "message": "",
            "written": 0, "skipped": 0}


def install_status():
    with _install_lock:
        return dict(_install)


def _set(**kw):
    with _install_lock:
        _install.update(kw)


def _ssl_context():
    import ssl
    ctx = ssl.create_default_context()
    try:
        import certifi   # ComfyUI installs usually have it; helps embedded Python
        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    return ctx


def _download(dest):
    import urllib.request
    req = urllib.request.Request(ZIP_URL, headers={"User-Agent": "Studio5090"})
    with urllib.request.urlopen(req, timeout=60, context=_ssl_context()) as r:
        total = int(r.headers.get("Content-Length") or 0)
        _set(total=total, done=0)
        done = 0
        with open(dest, "wb") as f:
            while True:
                chunk = r.read(1024 * 256)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                _set(done=done)
    if total and done != total:
        raise IOError(f"download stopped early ({done} of {total} bytes)")


def _safe_target(output_dir, name):
    """Where a zip entry goes, or None if it should be skipped."""
    name = name.replace("\\", "/")
    if name.startswith("/") or ":" in name:
        return None
    parts = [p for p in name.split("/") if p]
    if not parts or any(p in (".", "..") for p in parts):
        return None
    if not (name + "/").startswith(ZIP_PREFIX) and name.rstrip("/") + "/" != "STUDIO5090/":
        return None
    return os.path.join(output_dir, *parts)


def _extract(zip_path, output_dir):
    written = skipped = 0
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        if not any(n.startswith(ZIP_PREFIX) for n in names):
            raise IOError("STUDIO5090.zip does not hold a STUDIO5090/STUDIO5090 folder")
        for info in z.infolist():
            target = _safe_target(output_dir, info.filename)
            if target is None:
                continue
            if info.is_dir():
                os.makedirs(target, exist_ok=True)
                continue
            if os.path.exists(target):
                skipped += 1          # never overwrite the user's files
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            tmp = target + ".s5090part"
            with z.open(info) as src, open(tmp, "wb") as dst:
                while True:
                    chunk = src.read(1024 * 256)
                    if not chunk:
                        break
                    dst.write(chunk)
            os.replace(tmp, target)
            written += 1
    return written, skipped


def _install_worker():
    import folder_paths
    output_dir = folder_paths.get_output_directory()
    root = os.path.join(output_dir, "STUDIO5090")
    zip_path = os.path.join(root, "STUDIO5090_download.zip")
    try:
        os.makedirs(root, exist_ok=True)
        print(f"[Studio5090] Downloading the starter project from {ZIP_URL}")
        _download(zip_path)
        _set(state="extracting")
        written, skipped = _extract(zip_path, output_dir)
        _set(state="done", written=written, skipped=skipped,
             message=f"{written} files installed" + (f", {skipped} already there" if skipped else ""))
        print(f"[Studio5090] Starter project installed in {starter_path()} "
                     f"({written} files written, {skipped} already there).  Restart ComfyUI.")
    except Exception as e:
        _set(state="error", message=str(e))
        logging.warning(f"[Studio5090] Starter project install failed: {e}")
    finally:
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)
        except Exception:
            pass


def start_install():
    with _install_lock:
        if _install["state"] in ("downloading", "extracting"):
            return dict(_install)
        _install.update(state="downloading", done=0, total=0, message="",
                        written=0, skipped=0)
        snap = dict(_install)
    threading.Thread(target=_install_worker, name="Studio5090StarterInstall",
                     daemon=True).start()
    return snap


def register_routes(routes):
    from aiohttp import web

    @routes.get("/studio5090/starter_status")
    async def starter_status(request):
        return web.json_response(status())

    @routes.post("/studio5090/starter_install")
    async def starter_install(request):
        return web.json_response(start_install())

    @routes.get("/studio5090/documentation.pdf")
    async def documentation(request):
        """The Documentation PDF from the latest GitHub release, sent so the
        browser opens it in its own PDF viewer instead of downloading it."""
        import aiohttp
        try:
            timeout = aiohttp.ClientTimeout(total=300, sock_connect=30)
            async with aiohttp.ClientSession(timeout=timeout, trust_env=True) as session:
                async with session.get(DOCS_URL, ssl=_ssl_context()) as r:
                    if r.status != 200:
                        raise IOError(f"HTTP {r.status}")
                    resp = web.StreamResponse(headers={
                        "Content-Type": "application/pdf",
                        "Content-Disposition": 'inline; filename="Studio5090.Documentation.pdf"'})
                    if r.content_length:
                        resp.content_length = r.content_length
                    await resp.prepare(request)
                    async for chunk in r.content.iter_chunked(1024 * 256):
                        await resp.write(chunk)
                    await resp.write_eof()
                    return resp
        except Exception as e:
            logging.warning(f"[Studio5090] Could not open the Documentation PDF here ({e}), "
                            f"sending the browser to GitHub instead.")
            raise web.HTTPFound(DOCS_URL)

    @routes.get("/studio5090/starter_install_status")
    async def starter_install_progress(request):
        return web.json_response(install_status())
