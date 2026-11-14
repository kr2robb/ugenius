// src/channel.ts
var net = process.getBuiltinModule("node:net"), { Duplex } = process.getBuiltinModule("node:stream"), CHANNEL_MARK = "acde-listen-channel/1";
var EMPTY = Buffer.alloc(0);
function encode(type, stream, payload = EMPTY) {
  if (payload.length > 65536)
    throw RangeError(`acde: channel payload of ${payload.length} bytes`);
  let frame = Buffer.allocUnsafe(9 + payload.length);
  return frame[0] = type, frame.writeUInt32BE(stream, 1), frame.writeUInt32BE(payload.length, 5), frame.set(payload, 9), frame;
}
function u32(value) {
  let bytes = Buffer.allocUnsafe(4);
  return bytes.writeUInt32BE(value), bytes;
}

class Decoder {
  #pending = EMPTY;
  push(chunk) {
    let bytes = this.#pending.length ? Buffer.concat([this.#pending, chunk]) : chunk, frames = [], at = 0;
    while (bytes.length - at >= 9) {
      let size = bytes.readUInt32BE(at + 5);
      if (size > 65536)
        throw Error(`acde: channel frame of ${size} bytes (at most 65536)`);
      if (bytes.length - at - 9 < size)
        break;
      let payload = Buffer.from(bytes.subarray(at + 9, at + 9 + size));
      frames.push({ type: bytes[at], stream: bytes.readUInt32BE(at + 1), payload }), at += 9 + size;
    }
    return this.#pending = at < bytes.length ? Buffer.from(bytes.subarray(at)) : EMPTY, frames;
  }
}

class Mux {
  #options;
  #decoder = new Decoder;
  #streams = /* @__PURE__ */ new Map;
  #draining = /* @__PURE__ */ new Set;
  #closing = !1;
  constructor(options) {
    this.#options = options;
  }
  get active() {
    return this.#streams.size;
  }
  receive(chunk) {
    for (let frame of this.#decoder.push(chunk))
      this.#dispatch(frame);
  }
  send(type, stream, payload) {
    this.#options.write(encode(type, stream, payload));
  }
  close(reason) {
    for (let stream of [...this.#streams.values()])
      stream.reset(reason);
    this.#draining.clear();
  }
  forget(id, draining) {
    if (this.#streams.delete(id), draining)
      this.#draining.add(id);
    this.#options.changed?.();
  }
  #dispatch({ type, stream: id, payload }) {
    let stream = this.#streams.get(id);
    switch (type) {
      case 1:
        if (stream || this.#draining.has(id) || id === 0)
          return;
        if (this.#closing)
          this.send(4, id, Buffer.from("the backend is shutting down"));
        else
          this.#open(id, payload);
        return;
      case 2:
        if (stream)
          stream.received(payload);
        else
          this.#refuse(id, "no such stream");
        return;
      case 3:
        if (stream)
          stream.ended();
        else if (!this.#draining.delete(id))
          this.#refuse(id, "no such stream");
        return;
      case 4:
        if (stream)
          stream.reset(payload.toString("utf8") || "reset by the runtime");
        else
          this.#draining.delete(id);
        return;
      case 5:
        if (stream && payload.length === 4)
          stream.grant(payload.readUInt32BE(0));
        return;
      case 6:
        if (id !== 0 || this.#closing)
          return;
        this.#closing = !0, this.#options.shutdown?.();
        return;
    }
  }
  #refuse(id, reason) {
    this.#draining.delete(id), this.send(4, id, Buffer.from(reason));
  }
  #open(id, payload) {
    if (payload.length !== 2)
      return this.send(4, id, Buffer.from("bad OPEN payload"));
    let port = payload.readUInt16BE(0), accept = this.#options.lookup(port);
    if (!accept)
      return this.send(4, id, Buffer.from(`no server listens on port ${port}`));
    let socket = new ChannelSocket(this, id);
    this.#streams.set(id, socket), this.#options.changed?.(), accept(socket);
  }
}

class ChannelSocket extends Duplex {
  remoteAddress = void 0;
  remotePort = void 0;
  connecting = !1;
  #mux;
  #id;
  #credit = 262144;
  #allowed = 262144;
  #owed = 0;
  #pending = [];
  #finish = null;
  #sentFin = !1;
  #gotFin = !1;
  #reset = !1;
  #idle = 0;
  #timer;
  constructor(mux, id) {
    super({ allowHalfOpen: !0 });
    this.#mux = mux, this.#id = id;
  }
  get stream() {
    return this.#id;
  }
  received(data) {
    if (this.#gotFin)
      return this.#abort("DATA after FIN");
    if (data.length > this.#allowed)
      return this.#abort("DATA beyond the granted window");
    this.#allowed -= data.length, this.#owed += data.length, this.#touch(), this.push(data);
  }
  ended() {
    if (this.#gotFin)
      return;
    this.#gotFin = !0, this.push(null);
  }
  grant(bytes) {
    this.#credit += bytes, this.#flush();
  }
  reset(reason) {
    if (this.destroyed)
      return;
    this.#reset = !0, this.destroy(Object.assign(Error(reason), { code: "ECONNRESET" }));
  }
  setTimeout(ms, callback) {
    if (callback)
      this.once("timeout", callback);
    return this.#idle = ms > 0 ? ms : 0, this.#touch(), this;
  }
  setNoDelay() {
    return this;
  }
  setKeepAlive() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
  address() {
    return {};
  }
  destroySoon() {
    if (this.writableFinished)
      this.destroy();
    else
      this.once("finish", () => this.destroy()), this.end();
  }
  _read() {
    if (this.#owed < 32768)
      return;
    let owed = this.#owed;
    this.#owed = 0, this.#allowed += owed, this.#mux.send(5, this.#id, u32(owed));
  }
  _write(chunk, _encoding, done) {
    this.#pending.push({ data: chunk, done }), this.#touch(), this.#flush();
  }
  _final(done) {
    this.#finish = done, this.#flush();
  }
  _destroy(error, done) {
    clearTimeout(this.#timer);
    let closedBoth = this.#sentFin && this.#gotFin;
    if (this.#reset || closedBoth)
      this.#mux.forget(this.#id, !1);
    else if (error)
      this.#mux.send(4, this.#id, Buffer.from(error.message || "closed")), this.#mux.forget(this.#id, !1);
    else {
      if (!this.#sentFin)
        this.#mux.send(3, this.#id);
      this.#sentFin = !0, this.#mux.forget(this.#id, !0);
    }
    done(error);
  }
  #abort(reason) {
    this.#mux.send(4, this.#id, Buffer.from(reason)), this.reset(reason);
  }
  #touch() {
    if (clearTimeout(this.#timer), this.#idle === 0 || this.destroyed)
      return;
    this.#timer = setTimeout(() => this.emit("timeout"), this.#idle), this.#timer.unref?.();
  }
  #flush() {
    while (this.#pending.length > 0 && this.#credit > 0 && !this.destroyed) {
      let item = this.#pending[0], take = Math.min(this.#credit, 65536, item.data.length);
      if (this.#mux.send(2, this.#id, item.data.subarray(0, take)), this.#credit -= take, item.data = item.data.subarray(take), item.data.length === 0)
        this.#pending.shift(), item.done();
    }
    if (this.#pending.length === 0 && this.#finish && !this.destroyed) {
      let finish = this.#finish;
      this.#finish = null, this.#sentFin = !0, this.#mux.send(3, this.#id), finish();
    }
  }
}
var accepts = /* @__PURE__ */ new Map, channel = null, quitting = !1;
function gone(reason) {
  channel?.mux.close(reason), process.stderr.write(`acde: the backend channel closed (${reason}); exiting
`), process.exit(0);
}
function hold() {
  if (!channel)
    return;
  if (quitting && accepts.size === 0 && channel.mux.active === 0) {
    let { output } = channel;
    channel = null, output.end(() => process.exit(0));
  } else if (accepts.size > 0 || channel.mux.active > 0)
    channel.input.ref();
  else
    channel.input.unref();
}
function shutdown() {
  quitting = !0;
  for (let { stop } of [...accepts.values()])
    stop();
  hold();
}
function open() {
  let input = new net.Socket({ fd: 3, readable: !0, writable: !1 }), output = new net.Socket({ fd: 4, readable: !1, writable: !0 }), mux = new Mux({ write: (frame) => void output.write(frame), lookup: (port) => accepts.get(port)?.accept, changed: hold, shutdown });
  return input.on("data", (chunk) => {
    try {
      mux.receive(chunk);
    } catch (error) {
      gone(error.message);
    }
  }), input.on("end", () => gone("end of input")), input.on("error", (error) => gone(error.message)), output.on("error", (error) => gone(error.message)), { mux, input, output };
}
function channelMode(env, bun) {
  return !bun && env.ACDE_APP_CHANNEL === "fd";
}
function serveChannel(port, accept, stop) {
  if (accepts.has(port))
    return !1;
  return accepts.set(port, { accept, stop }), channel ??= open(), hold(), !0;
}
function unserveChannel(port) {
  accepts.delete(port), hold();
}
var stoppers = /* @__PURE__ */ new Set, control = null, controlLost = !1;
function lost(error) {
  process.stderr.write(`acde: the control channel failed (${error.message}); not reading it
`), control?.close(), control = null, controlLost = !0;
}
function onControl() {
  let decoder = new Decoder;
  return (chunk) => {
    for (let { type, stream } of decoder.push(chunk)) {
      if (type !== 6 || stream !== 0 || quitting)
        continue;
      quitting = !0;
      let stopping = [...stoppers].map(async (stop) => await stop());
      Promise.allSettled(stopping).then(() => process.exit(0));
    }
  };
}
function readControl() {
  let receive = onControl();
  if (typeof Bun < "u") {
    let reader = Bun.file(3).stream().getReader();
    return (async () => {
      for (;; ) {
        let { done, value } = await reader.read();
        if (done)
          return;
        receive(Buffer.from(value));
      }
    })().catch(lost), { close: () => void reader.cancel().catch(() => {
      return;
    }) };
  }
  let input = new net.Socket({ fd: 3, readable: !0, writable: !1 });
  return input.on("data", (chunk) => {
    try {
      receive(chunk);
    } catch (error) {
      lost(error);
    }
  }), input.on("error", lost), { close: () => input.destroy() };
}
function controlMode(env, bun) {
  return !channelMode(env, bun) && env.ACDE_APP_CONTROL === "fd";
}
function serveControl(stop) {
  if (stoppers.add(stop), !control && !controlLost)
    try {
      control = readControl();
    } catch (error) {
      lost(error);
    }
  return () => {
    if (!stoppers.delete(stop) || stoppers.size > 0 || quitting)
      return;
    control?.close(), control = null;
  };
}

// src/sockets.ts
var path = process.getBuiltinModule("node:path");
function paths(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}
function socketDir(env = process.env, platform = process.platform) {
  let set = env.ACDE_APP_SOCKETS;
  if (set)
    return set;
  let id = env.ACDE_APP_ID;
  if (!id || !/^[\w-]+$/.test(id))
    throw Error("acde: no ACDE_APP_SOCKETS or ACDE_APP_ID: cannot tell which unix socket directory to listen in");
  let runtime = env.XDG_RUNTIME_DIR || (platform === "win32" ? "" : `/run/user/${process.getuid?.() ?? 0}`);
  if (!runtime)
    throw Error("acde: no ACDE_APP_SOCKETS or XDG_RUNTIME_DIR: on Windows the runtime names the directory");
  return paths(platform).join(runtime, "acde", "apps", id);
}
function socketPath(port, env = process.env, platform = process.platform) {
  let socket = paths(platform).join(socketDir(env, platform), `${port}.sock`), bytes = Buffer.byteLength(socket);
  if (platform === "win32" && bytes > 107) {
    let message = `acde: the socket path ${socket} is ${bytes} bytes, Windows allows 107: use a shorter directory`;
    throw Object.assign(Error(message), { code: "ENAMETOOLONG" });
  }
  return socket;
}

// src/listen.ts
var dgram = process.getBuiltinModule("node:dgram"), { chmodSync, lstatSync, mkdirSync, unlinkSync } = process.getBuiltinModule("node:fs"), http = process.getBuiltinModule("node:http"), https = process.getBuiltinModule("node:https"), net2 = process.getBuiltinModule("node:net"), { dirname } = process.getBuiltinModule("node:path"), { Readable } = process.getBuiltinModule("node:stream"), tls = process.getBuiltinModule("node:tls"), INSTALLED = Symbol.for("acde.listen"), SERVE = Symbol.for("acde.serve"), live = /* @__PURE__ */ new Set;
function toPort(value) {
  if (value === void 0 || value === null || value === "")
    return;
  let port = typeof value === "string" ? Number(value) : value;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535)
    throw RangeError(`acde: bad port ${String(value)}`);
  return port;
}
function envPort() {
  let env = process.env;
  return toPort(env.BUN_PORT) ?? toPort(env.PORT) ?? toPort(env.NODE_PORT) ?? 3000;
}
function refuse(what) {
  throw Object.assign(Error(`acde: ${what}: an acde app listens on unix sockets only`), { code: "EACCES" });
}
function prepare(port) {
  let path = socketPath(port), dir = dirname(path);
  if (mkdirSync(dir, { recursive: !0, mode: 448 }), process.platform !== "win32")
    chmodSync(dir, 448);
  if (!live.has(path))
    try {
      if (lstatSync(path).isSocket())
        unlinkSync(path);
    } catch (error) {
      if (error.code !== "ENOENT")
        throw error;
    }
  return path;
}
function controlled(stop) {
  return controlMode(process.env, typeof Bun < "u") ? serveControl(stop) : () => {
    return;
  };
}
function onSocket(options, path) {
  let mapped = Object.create(options);
  for (let key of ["port", "hostname", "host", "reusePort", "ipv6Only"])
    mapped[key] = void 0;
  return mapped.unix = path, mapped;
}
var announced = /* @__PURE__ */ new Set;
function announce(port) {
  if (announced.has(port))
    return;
  announced.add(port), console.log(`acde: port ${port} is served through acde, not over TCP: the app's pages reach it ` + `(a relative URL such as /api/…, or localhost:${port}); other programs on this machine cannot`);
}
function looksBound(server, port, hostname) {
  let host = hostname && hostname !== "0.0.0.0" && hostname !== "::" ? hostname : "localhost", shown = host.includes(":") ? `[${host}]` : host;
  return Object.defineProperties(server, {
    port: { configurable: !0, value: port },
    hostname: { configurable: !0, value: host },
    url: { configurable: !0, value: new URL(`http://${shown}:${port}/`) }
  }), server;
}
function onUnix(original, fallback) {
  return function(...args) {
    let options = args[0];
    if (options === null || typeof options !== "object" || options.unix != null)
      return original.apply(Bun, args);
    let port = toPort(options.port) ?? fallback(), path = prepare(port), server = original.call(Bun, onSocket(options, path), ...args.slice(1));
    live.add(path), announce(port);
    let stop = server.stop, release = controlled(() => server.stop());
    return server.stop = function(...rest) {
      return live.delete(path), release(), stop.apply(server, rest);
    }, looksBound(server, port, options.hostname);
  };
}
function patchBun() {
  if (typeof Bun > "u")
    return;
  let bun = Bun;
  bun.serve = onUnix(bun.serve, envPort), bun.listen = onUnix(bun.listen, () => 0);
  let udp = bun.udpSocket;
  if (udp)
    bun.udpSocket = function(...args) {
      let options = args[0];
      if (options && typeof options === "object" && toPort(options.port))
        refuse(`UDP socket on port ${String(options.port)}`);
      return udp.apply(Bun, args);
    };
}
function nodeArgs(args) {
  let rest = [...args], cb = typeof rest.at(-1) === "function" ? [rest.pop()] : [], first = rest[0];
  if (first !== null && typeof first === "object") {
    let o = first;
    if (o.path != null)
      return null;
    if ("fd" in o || "_handle" in o || first instanceof net2.Server || first instanceof net2.Socket)
      refuse("listen on a handle or file descriptor");
    let options = {};
    for (let key of ["backlog", "exclusive", "readableAll", "writableAll", "signal"])
      if (o[key] !== void 0)
        options[key] = o[key];
    return { port: toPort(o.port) ?? 0, host: typeof o.host === "string" ? o.host : void 0, options, cb };
  }
  if (typeof first === "string" && !(Number(first) >= 0))
    return null;
  let options = {}, backlog = rest.slice(1).find((arg) => typeof arg === "number");
  if (backlog !== void 0)
    options.backlog = backlog;
  return { port: toPort(first) ?? 0, host: typeof rest[1] === "string" ? rest[1] : void 0, options, cb };
}
function listenChannel(server, mapped) {
  let { port } = mapped, host = mapped.host && net2.isIP(mapped.host) ? mapped.host : "::";
  for (let cb of mapped.cb)
    server.once("listening", cb);
  if (!serveChannel(port, (socket) => void server.emit("connection", socket), () => server.close())) {
    let message = `acde: listen EADDRINUSE: port ${port} is already served`, taken = Object.assign(Error(message), { code: "EADDRINUSE" });
    return process.nextTick(() => server.emit("error", taken)), server;
  }
  let listening = !0, close = Object.getPrototypeOf(server).close, stop = () => {
    if (!listening)
      return !1;
    return listening = !1, unserveChannel(port), !0;
  };
  Object.defineProperties(server, {
    listening: { configurable: !0, get: () => listening },
    address: {
      configurable: !0,
      writable: !0,
      value: () => listening ? { address: host, family: net2.isIPv6(host) ? "IPv6" : "IPv4", port } : null
    },
    close: {
      configurable: !0,
      writable: !0,
      value: function(cb) {
        let was = stop();
        if (typeof cb === "function") {
          let notRunning = Object.assign(Error("Server is not running."), { code: "ERR_SERVER_NOT_RUNNING" });
          this.once("close", () => was ? cb() : cb(notRunning));
        }
        return close.call(this);
      }
    }
  });
  let signal = mapped.options.signal;
  if (signal?.aborted)
    stop();
  else
    signal?.addEventListener("abort", () => server.close(), { once: !0 });
  return process.nextTick(() => listening ? server.emit("listening") : void 0), server;
}
var patched = /* @__PURE__ */ new WeakSet;
function patchListen(proto) {
  if (!Object.hasOwn(proto, "listen") || patched.has(proto))
    return;
  patched.add(proto);
  let target = proto, listen = target.listen;
  target.listen = function(...args) {
    let mapped = nodeArgs(args);
    if (!mapped)
      return listen.apply(this, args);
    if (channelMode(process.env, typeof Bun < "u"))
      return announce(mapped.port), listenChannel(this, mapped);
    let path = prepare(mapped.port), server = this;
    delete server.address;
    let address = server.address, host = mapped.host && net2.isIP(mapped.host) ? mapped.host : "::";
    return Object.defineProperty(server, "address", {
      configurable: !0,
      writable: !0,
      value: function() {
        let real = address.call(this);
        return real == null ? real : { address: host, family: net2.isIPv6(host) ? "IPv6" : "IPv4", port: mapped.port };
      }
    }), server.once("listening", () => {
      live.add(path), announce(mapped.port);
      let release = controlled(() => new Promise((done) => server.close(done)));
      server.once("close", release);
    }), server.once("close", () => live.delete(path)), listen.call(this, { ...mapped.options, path }, ...mapped.cb);
  };
}
function patchUdp() {
  let proto = dgram.Socket.prototype, bind = proto.bind;
  proto.bind = function(...args) {
    let first = args[0], port = first !== null && typeof first === "object" ? first.port : typeof first === "function" ? 0 : first;
    if (toPort(port))
      refuse(`UDP bind to port ${String(port)}`);
    return bind.apply(this, args);
  };
}
var HOP = /* @__PURE__ */ new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "http2-settings", "proxy-connection"]);
function toRequest(req, signal) {
  let headers = /* @__PURE__ */ new Headers;
  for (let i = 0;i + 1 < req.rawHeaders.length; i += 2) {
    let name = req.rawHeaders[i];
    if (name.startsWith(":") || HOP.has(name.toLowerCase()))
      continue;
    try {
      headers.append(name, req.rawHeaders[i + 1]);
    } catch {}
  }
  let method = req.method ?? "GET", body = method === "GET" || method === "HEAD" ? null : Readable.toWeb(req), init = { method, headers, signal, ...body && { body, duplex: "half" } };
  return new Request(new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`).href, init);
}
async function send(response, req, res) {
  let head = [];
  for (let [name, value] of response.headers)
    if (name !== "set-cookie")
      head.push(name, value);
  for (let cookie of response.headers.getSetCookie())
    head.push("set-cookie", cookie);
  if (res.writeHead(response.status, response.statusText || void 0, head), !response.body || req.method === "HEAD") {
    res.end(), await response.body?.cancel().catch(() => {
      return;
    });
    return;
  }
  let reader = response.body.getReader();
  res.once("close", () => {
    if (!res.writableFinished)
      reader.cancel().catch(() => {
        return;
      });
  });
  let writable = () => new Promise((resolve) => {
    let done = () => {
      res.off("drain", done), res.off("close", done), resolve();
    };
    res.on("drain", done), res.on("close", done);
  });
  for (;; ) {
    let { done, value } = await reader.read();
    if (done || res.destroyed)
      break;
    if (!res.write(value))
      await writable();
  }
  if (!res.destroyed)
    res.end();
}
async function respond(app, server, req, res) {
  let aborted = new AbortController;
  res.once("close", () => {
    if (!res.writableFinished)
      aborted.abort();
  });
  try {
    let response;
    try {
      response = await app.fetch(toRequest(req, aborted.signal), server);
    } catch (error) {
      if (typeof app.error !== "function")
        throw error;
      response = await app.error(error);
    }
    if (res.destroyed)
      return;
    if (!(response instanceof Response))
      throw TypeError(`acde: the fetch handler returned ${response === void 0 ? "nothing" : typeof response}, not a Response`);
    await send(response, req, res);
  } catch (error) {
    if (console.error(error), res.headersSent)
      res.destroy();
    else
      res.writeHead(500, { "content-type": "text/plain" }).end("Internal Server Error");
  }
}
function serve(app) {
  if (!app || typeof app.fetch !== "function")
    return;
  let port = toPort(app.port) ?? envPort(), hostname = typeof app.hostname === "string" ? app.hostname : "localhost", facade = { upgrade: () => !1, requestIP: () => null, port, hostname }, server = http.createServer((req, res) => void respond(app, facade, req, res));
  if (typeof app.unix === "string" && app.unix)
    server.listen(app.unix);
  else if (typeof app.hostname === "string" && app.hostname)
    server.listen(port, app.hostname);
  else
    server.listen(port);
  return server;
}
var global = globalThis;
if (!global[INSTALLED]) {
  if (global[INSTALLED] = CHANNEL_MARK, typeof Bun > "u")
    global[SERVE] = serve;
  if (patchBun(), typeof Bun > "u")
    process.setSourceMapsEnabled?.(!0);
  for (let Server of [net2.Server, http.Server, https.Server, tls.Server])
    patchListen(Server.prototype);
  patchUdp();
}
