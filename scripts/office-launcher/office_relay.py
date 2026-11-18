"""Opt-in loopback transport for the private Office presence adapter.

Trust boundary: a paired browser on an exact permitted Omnira origin must obtain
DTOs through its own authenticated, project-scoped APIs. A DTO source label is not
an authentication credential. This transport does not independently attest a DTO,
start work, access cookies, call models, or supply a native Unreal consumer.
Nothing runs on import, and it is not installed as a background service.
"""
from __future__ import annotations

import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
from urllib.parse import urlencode, urlsplit

from office_presence import AVATAR, AvatarBinding, PresenceReceiver, write_presence

PRODUCTION_ORIGIN = 'https://omniraos.se'
MAX_BODY = 280000


def _exact_object(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def _no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key')
        result[key] = value
    return result


class OfficeRelay:
    def __init__(self, output_dir: Path, *, avatars, allowed_origins=(PRODUCTION_ORIGIN,)):
        if (not avatars or len(avatars) > 20 or len(set(avatars)) != len(avatars)
                or any(not isinstance(a, str) or not AVATAR.fullmatch(a) for a in avatars)):
            raise ValueError('An explicit bounded avatar allowlist is required')
        for origin in allowed_origins:
            parsed = urlsplit(origin)
            if (parsed.scheme != 'https' or not parsed.hostname or parsed.username
                    or parsed.password or parsed.path or parsed.query or parsed.fragment
                    or parsed.netloc != parsed.hostname):
                raise ValueError('Use exact HTTPS application origins without paths or wildcards')
        if not allowed_origins or len(allowed_origins) > 4:
            raise ValueError('An explicit origin allowlist is required')
        self.output_dir = Path(output_dir)
        self.avatars, self.allowed_origins = tuple(avatars), tuple(allowed_origins)
        self.session_key = secrets.token_urlsafe(32)
        self._lock = threading.Lock()
        self._receiver = None
        self._connection_id = None
        self._writer_lease = None
        self._halt = threading.Event()
        self._server = None
        self._threads = []
        self.port = None

    def pairing_url(self, origin=PRODUCTION_ORIGIN):
        if origin not in self.allowed_origins or self.port is None:
            raise ValueError('Start the relay with the exact application origin first')
        return origin + '/atlas/office/connect#' + urlencode({
            'officePort': self.port, 'officeKey': self.session_key})

    def _write(self):
        if self._receiver is not None:
            write_presence(self.output_dir / (self._receiver.binding.avatar_id + '.json'), self._receiver)

    def _clear(self):
        if self._receiver is not None:
            self._receiver = PresenceReceiver(self._receiver.binding)
            self._write()

    def _acquire_writer(self):
        handle = (self.output_dir / '.office-relay.lock').open('a+b')
        try:
            handle.seek(0, 2)
            if handle.tell() == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            raise RuntimeError('This output directory already has an active relay') from None
        self._writer_lease = handle

    def _release_writer(self):
        if self._writer_lease is not None:
            self._writer_lease.close()  # OS releases the lease, including on process death.
            self._writer_lease = None

    def start(self):
        if self._server is not None or self._halt.is_set():
            raise RuntimeError('A relay instance starts once')
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._acquire_writer()
        relay = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.0'

            def setup(self):
                super().setup()
                self.connection.settimeout(3)

            def log_message(self, *_):
                pass  # No URLs, credentials or DTOs in access logs.

            def _origin(self):
                origins = self.headers.get_all('Origin', [])
                hosts = self.headers.get_all('Host', [])
                return (len(origins) == 1 and origins[0] in relay.allowed_origins
                        and hosts == ['127.0.0.1:' + str(relay.port)])

            def _reply(self, status, payload=None):
                body = b'' if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
                self.send_response(status)
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Vary', 'Origin')
                if self._origin():
                    self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                    self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers', 'authorization, content-type')
                    # Chromium's legacy private-network preflight; newer browsers may
                    # separately require the user's local-network permission prompt.
                    self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.end_headers()
                if body:
                    self.wfile.write(body)

            def _gate(self, *, preflight=False):
                if not self._origin():
                    self._reply(403, {'error': 'forbidden'})
                    return False
                if preflight:
                    requested = self.headers.get('Access-Control-Request-Method')
                    names = self.headers.get('Access-Control-Request-Headers', '').lower().split(',')
                    if requested not in ('GET', 'POST') or any(n.strip() not in ('authorization', 'content-type') for n in names if n.strip()):
                        self._reply(403, {'error': 'forbidden'})
                        return False
                else:
                    auth = self.headers.get_all('Authorization', [])
                    if (len(auth) != 1 or not auth[0].isascii()
                            or not hmac.compare_digest(auth[0], 'Bearer ' + relay.session_key)):
                        self._reply(403, {'error': 'forbidden'})
                        return False
                return True

            def do_OPTIONS(self):
                if self._gate(preflight=True):
                    if self.path not in ('/status', '/bind', '/snapshot', '/disconnect'):
                        self._reply(404, {'error': 'not_found'})
                    else:
                        self._reply(204)

            def do_GET(self):
                if not self._gate():
                    return
                if self.path != '/status':
                    self._reply(404, {'error': 'not_found'})
                    return
                with relay._lock:
                    self._reply(200, {'protocol': 1, 'avatars': list(relay.avatars),
                        'presence': None if relay._receiver is None else relay._receiver.view()})

            def do_POST(self):
                if not self._gate():
                    return
                if self.path not in ('/bind', '/snapshot', '/disconnect'):
                    self._reply(404, {'error': 'not_found'})
                    return
                lengths = self.headers.get_all('Content-Length', [])
                if (len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit()
                        or self.headers.get_all('Transfer-Encoding')):
                    self._reply(400, {'error': 'invalid_length'})
                    return
                length = int(lengths[0])
                if length > MAX_BODY:
                    self._reply(413, {'error': 'too_large'})
                    return
                if self.headers.get_all('Content-Type') != ['application/json']:
                    self._reply(415, {'error': 'json_required'})
                    return
                try:
                    raw = self.rfile.read(length)
                    if len(raw) != length:
                        raise ValueError('Incomplete body')
                    data = json.loads(raw.decode('utf-8'), object_pairs_hook=_no_duplicate_keys,
                                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
                    keys = {'/bind': ('protocol', 'avatarId', 'projectId', 'agentId'),
                            '/snapshot': ('protocol', 'connectionId', 'binding', 'snapshot'),
                            '/disconnect': ('protocol', 'connectionId')}[self.path]
                    if not _exact_object(data, keys) or type(data['protocol']) is not int or data['protocol'] != 1:
                        raise ValueError('Invalid protocol')
                    with relay._lock:
                        if self.path != '/bind':
                            supplied = data['connectionId']
                            if (relay._connection_id is None or not isinstance(supplied, str)
                                    or not supplied.isascii()
                                    or not hmac.compare_digest(supplied, relay._connection_id)):
                                self._reply(409, {'error': 'connection_superseded'})
                                return
                        if self.path == '/bind':
                            if data['avatarId'] not in relay.avatars:
                                raise ValueError('Unknown avatar')
                            selected = AvatarBinding(data['avatarId'], data['projectId'], data['agentId'])
                            relay._clear()
                            relay._receiver = PresenceReceiver(selected)
                            relay._connection_id = secrets.token_urlsafe(18)
                            relay._write()
                        elif self.path == '/disconnect':
                            relay._clear()
                            relay._receiver = None
                            relay._connection_id = None
                        elif relay._receiver is None:
                            self._reply(409, {'error': 'binding_required'})
                            return
                        else:
                            relay._receiver.accept(data['binding'], data['snapshot'])
                            relay._write()
                        result = {'protocol': 1, 'presence':
                            None if relay._receiver is None else relay._receiver.view()}
                        if self.path == '/bind':
                            result['connectionId'] = relay._connection_id
                        self._reply(200, result)
                except (ValueError, TypeError, UnicodeError, RecursionError):
                    self._reply(400, {'error': 'invalid_payload'})
                except OSError:
                    self._reply(503, {'error': 'local_write_unavailable'})

        try:
            # A previous process may have died with a still-fresh projection.
            # Only the exclusive writer may invalidate these exact avatar files.
            for avatar in self.avatars:
                (self.output_dir / (avatar + '.json')).unlink(missing_ok=True)
            self._server = HTTPServer(('127.0.0.1', 0), Handler)
        except BaseException:
            self._release_writer()
            raise
        self.port = self._server.server_address[1]
        def refresh():
            while not self._halt.wait(1):
                with self._lock:
                    try:
                        self._write()
                    except OSError:
                        # A transient disk error must not permanently disable expiry.
                        # Retry at the next bounded one-second tick without renewing data.
                        continue
        self._threads = [threading.Thread(target=self._server.serve_forever,
                                         kwargs={'poll_interval': 0.05}, daemon=True),
                         threading.Thread(target=refresh, daemon=True)]
        try:
            for thread in self._threads:
                thread.start()
        except BaseException:
            self.stop()
            raise

    def stop(self):
        self._halt.set()
        try:
            if self._server is not None:
                try:
                    # shutdown() waits forever if serve_forever() never started.
                    if self._threads and self._threads[0].is_alive():
                        self._server.shutdown()
                finally:
                    self._server.server_close()
            for thread in self._threads:
                if thread.ident is not None:
                    thread.join(timeout=4)
            with self._lock:
                self._clear()
        finally:
            self._server = None
            self._release_writer()
