webirc = webirc || {};
webirc.connection = function (cfg) {
  var conn = {
    endpoint: cfg.endpoint,
    nickname: cfg.nickname || "Guest",
    realname: cfg.realname || "webirc user",
    onmessage: cfg.onmessage || null,
    onopen: cfg.onopen || null,
    ws: null,
  };
  conn.ws = new WebSocket(conn.endpoint);
  conn.ws.onmessage = function (event) {
    var msg = webirc.irc.parse(event.data);
    if (conn.onmessage)
      conn.onmessage(conn, msg);
  };
  conn.ws.onopen = function (event) {
    // XXX CAP
    conn.ws.send("NICK " + conn.nickname + "\r\n");
    conn.ws.send("USER webirc x x :" + conn.realname + "\r\n");
    if (conn.onopen)
      conn.onopen(conn);
  };
  return conn;
};
