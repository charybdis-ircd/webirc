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
  conn.send = function (data) {
    conn.ws.send(data + "\r\n");
  };
  conn.ws.onmessage = function (event) {
    var msg = webirc.irc.parse(event.data);
    if (conn.onmessage)
      conn.onmessage(conn, msg);
  };
  conn.ws.onopen = function (event) {
    // XXX CAP
    conn.send("NICK " + conn.nickname);
    conn.send("USER webirc * * :" + conn.realname);
    if (conn.onopen)
      conn.onopen(conn);
  };
  return conn;
};
webirc.client = function (cfg) {
  var cli = {
    conn: null,
    connected: false,
    commands: {},
    signals: {},
    buffers: [],
    current_buffer: null,
    command_dispatch: function (cmdname) {
      var command = cli.commands[cmdname.toLowerCase()];
      var args = Array.prototype.slice.call(arguments, 1);
      if (!command) {
        // command not found, pass it through to the server.
        cli.conn.send(cmdname + " " + args.join(" "));
        return;
      }
      return command(args);
    },
    signal_attach: function (signame, callable) {
      var handlers = cli.signals[signame.toLowerCase()] || [];
      handlers.push(callable);
      cli.signals[signame.toLowerCase()] = handlers;
    },
    signal_dispatch: function (signame) {
      var handlers = cli.signals[signame.toLowerCase()];
      if (!handlers)
        return;
      var args = Array.prototype.slice.call(arguments, 1);
      for (var handler of handlers) {
        handler.apply(null, args);
      }
    },
    onopen: function (conn) {
      cli.connected = true;
      cli.signal_dispatch("irc connect", cli, conn);
    },
    onmessage: function (conn, event) {
      cli.signal_dispatch("irc input", cli, conn, event);
      cli.signal_dispatch("irc command " + event.command, cli, conn, event);
    },
    process_input: function (input) {
      if (!cli.connected) {
        cli.signal_dispatch("input not connected", cli, input);
        return;
      }
      if (input[0] == "/") {
        return cli.command_dispatch.apply(null, input.slice(1).split(" "));
      }
      cli.conn.send("PRIVMSG " + current_buffer + " :" + input);
    }
  }
  cli.signal_attach("irc command JOIN", function(cli, conn, event) {
    current_buffer = event.parameters[0];
  });
  cli.conn = new webirc.connection({
    endpoint: cfg.endpoint,
    nickname: cfg.nickname,
    realname: cfg.realname,
    onopen: cli.onopen,
    onmessage: cli.onmessage,
  });
  return cli;
};
webirc.build_client = function (cfg, selector) {
  var sel = document.querySelector(selector);
  if (!sel) {
    throw new Error('selector ' + selector + ' was not found');
  }

  var buf = document.createElement('div');
  buf.setAttribute('id', 'webirc-buffer');
  sel.appendChild(buf);
  var ic = document.createElement('div');
  ic.setAttribute('id', 'webirc-input-container');
  sel.appendChild(ic);
  var input = document.createElement('input');
  input.setAttribute('id', 'webirc-input');
  ic.appendChild(input);

  var cli = new webirc.client(cfg);
  window.addEventListener("keyup", function (e) {
    if (e.code != 'Enter')
      return;
    cli.process_input(input.value);
    input.value = "";
  });

  cli.signal_attach("irc input", function (cli, conn, event) {
    var el = document.createElement('div');
    el.appendChild(document.createTextNode(event.raw));
    buf.appendChild(el);
  });

  return cli;
};
