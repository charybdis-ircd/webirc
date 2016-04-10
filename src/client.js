webirc = webirc || {};
webirc.eventtypes = {
  EVENT_SERVER: 0,
  EVENT_MESSAGE: 1,
  EVENT_NOTICE: 2,
  EVENT_CHANNEL: 3
};
webirc.buffer = function (cli, name) {
  var buf = {
    owner: cli,
    name: name,
    construct: function () {
      buf.dom = document.createElement('div');
      buf.dom.classList.add('webirc-buffer');
      buf.dom.classList.add('webirc-buffer-hidden');
    },
    active: false,
    write: function (text) {
      var el = document.createElement('div');
      el.appendChild(document.createTextNode(text));
      buf.dom.appendChild(el);
    },
    write_error: function (text) {
      buf.write("* " + text);
    },
    switch_to: function () {
      for (var buffer of buf.owner.buffers) {
        buffer.active = false;
        buffer.dom.classList.add('webirc-buffer-hidden');
      }
      buf.dom.classList.remove('webirc-buffer-hidden');
      buf.active = true;
      buf.owner.signal_dispatch("buffer switch", buf);
    },
    close: function () {
      for (var i = 0; i < buf.owner.buffers.length; i++) {
        if (buf.owner.buffers[i] === buf) {
          buf.owner.buffers.splice(i, 1);
          break;
        }
      }
      buf.owner.signal_dispatch("buffer close", buf);
      delete buf;
    }
  };

  buf.construct();
  buf.owner.buffers.push(buf);
  buf.owner.signal_dispatch("buffer new", buf);

  return buf;
};
webirc.connection = function (cfg) {
  var conn = {
    endpoint: cfg.endpoint,
    nickname: cfg.nickname || "Guest",
    realname: cfg.realname || "webirc user",
    onmessage: cfg.onmessage || null,
    onopen: cfg.onopen || null,
    onsend: cfg.onsend || null,
    ws: null,
  };
  conn.ws = new WebSocket(conn.endpoint);
  conn.send = function (data) {
    conn.ws.send(data + "\r\n");
    if (conn.onsend)
      conn.onsend(conn, data);
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
webirc.client = function (cfg, sel, sel_sb) {
  var cli = {
    conn: null,
    connected: false,
    root: sel,
    root_sb: sel_sb,
    commands: {},
    signals: {},
    buffers: [],
    current_buffer: null,
    command_attach: function (cmdname, callable) {
      cmdname = cmdname.toLowerCase();
      if (cli.commands[cmdname])
        console.log("warning: replacing command handler for command: " + cmdname);
      cli.commands[cmdname] = callable;
    },
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
    signal_count: function (signame) {
      var handlers = cli.signals[signame.toLowerCase()];
      if (!handlers)
        return 0;
      return handlers.length;
    },
    onopen: function (conn) {
      cli.connected = true;
      cli.signal_dispatch("irc connect", cli, conn);
    },
    onmessage: function (conn, event) {
      cli.signal_dispatch("irc input", cli, conn, event);
    },
    onsend: function (conn, data) {
      cli.signal_dispatch("irc output", cli, conn, data);
    },
    process_input: function (input) {
      if (!cli.connected) {
        cli.signal_dispatch("input not connected", cli, input);
        return;
      }
      if (input[0] == "/") {
        return cli.command_dispatch.apply(null, input.slice(1).split(" "));
      }
      cli.conn.send("PRIVMSG " + cli.current_buffer.name + " :" + input);
    },
    buffer_new: function (name) {
      return new webirc.buffer(cli, name);
    },
    buffer_find: function (name) {
      for (var buffer of cli.buffers) {
        if (buffer.name == name)
          return buffer;
      }
      return null;
    },
    buffer_close: function (name) {
      var buf = cli.buffer_find(name);
      if (buf)
        buf.close();
    },
  }
  cli.signal_attach("buffer switch", function (buf) {
    cli.current_buffer = buf;
  });
  cli.signal_attach("irc command JOIN", function(cli, conn, event) {
    var buf = cli.buffer_new(event.parameters[0]);
    buf.switch_to();
  });
  cli.command_attach("buffer", function (args) {
    var buf = cli.buffer_find(args[0]);
    if (!buf) {
      cli.current_buffer.write_error("No buffer found for '" + args[0] + "'");
      return;
    }
    buf.switch_to();
  });
  cli.conn = new webirc.connection({
    endpoint: cfg.endpoint,
    nickname: cfg.nickname,
    realname: cfg.realname,
    onopen: cli.onopen,
    onmessage: cli.onmessage,
    onsend: cli.onsend,
  });
  cli.ui = new webirc.ui(cli, cli.root, cli.root_sb);
  cli.root_buf = cli.buffer_new('Server');
  cli.root_buf.switch_to();
  cli.rawlog_buf = cli.buffer_new('Raw Log');

  // rawlog handlers
  cli.signal_attach("irc input", function (cli, conn, event) {
    cli.signal_dispatch("irc command " + event.command, cli, conn, event);
    cli.rawlog_buf.write("<< " + event.raw);

    if (!cli.signal_count("irc command " + event.command))
      cli.root_buf.write("unhandled input: " + event.raw);
  });
  cli.signal_attach("irc output", function (cli, conn, data) {
    cli.rawlog_buf.write(">> " + data);
  });

  cli.signal_attach("irc command PING", function (cli, conn, event) {
    cli.conn.send("PONG :" + event.parameters[0]);
  });

  return cli;
};
webirc.ui_sidebar = function (cli, sel) {
  var sb = {
    root: sel,
    tiles: [],
    tile: function (buffer) {
      var tile = {
        buffer: buffer,
        construct: function () {
          tile.root = document.createElement('div');
          tile.root.classList.add("webirc-tile");

          tile.badge = document.createElement('span');
          tile.badge.classList.add("webirc-tile-badge");

          tile.name = document.createTextNode(buffer.name);

          tile.root.appendChild(tile.name);
          tile.root.appendChild(tile.badge);

          tile.root.addEventListener('click', function () {
            tile.buffer.switch_to();
          });
        },
        set_active: function () {
          tile.root.classList.add("webirc-tile-active");
        },
        set_inactive: function () {
          tile.root.classList.remove("webirc-tile-active");
        },
      };

      tile.construct();
      return tile;
    },
    tile_attach: function (buffer) {
      var tile = new sb.tile(buffer);
      console.log(sb);
      sb.root.appendChild(tile.root);
      sb.tiles.push(tile);
      return tile;
    },
    tile_lookup: function (buffer) {
      for (var tile of sb.tiles) {
        if (buffer == tile.buffer)
          return tile;
      }
      return null;
    },
    tile_clear_active: function (buffer) {
      for (var tile of sb.tiles) {
        tile.set_inactive();
      }
    },
    tile_set_active: function (buffer) {
      sb.tile_clear_active();
      var tile = sb.tile_lookup(buffer);
      if (!tile)
        return;
      tile.set_active();
    }
  };

  cli.signal_attach("buffer new", function (buffer) {
    sb.tile_attach(buffer);
  });

  cli.signal_attach("buffer switch", function (buffer) {
    sb.tile_clear_active();
    sb.tile_set_active(buffer);
  });

  return sb;
};
webirc.ui = function (cli, selector, sel_sb) {
  var ui = {
    cli: cli,
    root: selector,
    root_sb: sel_sb,
  };

  ui.bufholder = document.createElement('div');
  ui.bufholder.setAttribute('id', 'webirc-buffer-container');
  ui.root.appendChild(ui.bufholder);

  ui.ic = document.createElement('div');
  ui.ic.setAttribute('id', 'webirc-input-container');
  ui.root.appendChild(ui.ic);

  ui.inputbox = document.createElement('input');
  ui.inputbox.setAttribute('id', 'webirc-input');
  ui.ic.appendChild(ui.inputbox);

  ui.sidebar = new webirc.ui_sidebar(cli, ui.root_sb);

  // XXX - IE
  window.addEventListener("keyup", function (e) {
    if (e.code != 'Enter')
      return;
    cli.process_input(ui.inputbox.value);
    ui.inputbox.value = "";
  });

  cli.signal_attach("buffer new", function (buf) {
    ui.bufholder.appendChild(buf.dom);
  });

  return ui;
};
webirc.build_client = function (cfg, selector_main, selector_sidebar) {
  var sel = document.querySelector(selector_main);
  if (!sel) {
    throw new Error('selector ' + selector_main + ' was not found');
  }

  var sel_sb = document.querySelector(selector_sidebar);
  if (!sel_sb) {
    throw new Error('selector ' + selector_sidebar + ' was not found');
  }

  var cli = new webirc.client(cfg, sel, sel_sb);
  return cli;
};
