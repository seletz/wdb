// Generated by CoffeeScript 1.6.2
(function() {
  var $source, $traceback, backsearch, breakset, breakunset, cm, cm_theme, cmd_hist, code, create_code_mirror, cwd, die, dump, echo, ellipsize, execute, fallback, format_fun, get_mode, get_random_port, historize, i, init, last_cmd, log, make_ws, open, print, print_help, print_hist, register_handlers, searchback, searchback_stop, select, send, session_cmd_hist, start, started, stop, suggest, suggest_stop, termscroll, time, title, toggle_break, toggle_edition, trace, waited_for_ws, ws, __ws_port_index, __ws_ports, _i,
    _this = this,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  time = function() {
    var d;

    d = new Date();
    return "" + (d.getHours()) + ":" + (d.getMinutes()) + ":" + (d.getSeconds()) + "." + (d.getMilliseconds());
  };

  cm = null;

  cm_theme = 'tomorrow-night';

  started = false;

  stop = false;

  ws = null;

  cwd = null;

  backsearch = null;

  get_random_port = function() {
    return 10000 + parseInt(Math.random() * 50000);
  };

  __ws_ports = __ws_alt_ports;

  if (!__ws_ports) {
    __ws_ports = [];
    for (i = _i = 0; _i <= 5; i = ++_i) {
      __ws_ports.push(get_random_port());
    }
  }

  __ws_port_index = 0;

  cmd_hist = {};

  session_cmd_hist = {};

  waited_for_ws = 0;

  $source = null;

  $traceback = null;

  send = function(msg) {
    console.log(time(), '->', msg);
    return ws.send(msg);
  };

  this.indexedDB = this.indexedDB || this.mozIndexedDB || this.webkitIndexedDB || this.msIndexedDB;

  this.IDBTransaction = this.IDBTransaction || this.webkitIDBTransaction || this.msIDBTransaction;

  this.IDBKeyRange = this.IDBKeyRange || this.webkitIDBKeyRange || this.msIDBKeyRange;

  fallback = function() {
    var file_cache;

    file_cache = {};
    this.get = function(type) {
      return function(obj, callback) {
        return callback(obj in file_cache && file_cache[obj]);
      };
    };
    return this.set = function(type) {
      return function(obj) {
        return file_cache[obj.name] = obj;
      };
    };
  };

  if (!this.indexedDB) {
    fallback();
  } else {
    open = this.indexedDB.open('wdbdb', 2);
    open.onerror = function(event) {
      return console.log('Error when opening wdbdb', event);
    };
    open.onupgradeneeded = function(event) {
      var db;

      db = event.target.result;
      return db.createObjectStore("cmd", {
        keyPath: "name"
      });
    };
    open.onsuccess = function(event) {
      console.info('wdbdb is open');
      _this.wdbdb = open.result;
      _this.get = function(type) {
        return function(key, callback, notfound, always) {
          var rq;

          rq = this.wdbdb.transaction([type]).objectStore(type).get(key);
          rq.onsuccess = function(event) {
            if (event.target.result) {
              callback(event.target.result);
            } else {
              notfound && notfound();
            }
            return always && always();
          };
          if (notfound) {
            rq.onerror = function(event) {
              notfound();
              return always && always();
            };
          }
          return null;
        };
      };
      _this.set = function(type) {
        return function(obj) {
          var os, rq;

          rq = this.wdbdb.transaction([type], 'readwrite');
          os = rq.objectStore(type);
          os.put(obj);
          rq.onerror = function(event) {
            return console.log('Add error', event);
          };
          return null;
        };
      };
      return _this.wdbdb.transaction(['cmd']).objectStore('cmd').openCursor().onsuccess = function(event) {
        var cursor;

        cursor = event.target.result;
        if (cursor) {
          cmd_hist[cursor.value.name] = cursor.value.history;
          return cursor["continue"]();
        }
      };
    };
    open.onerror = function(event) {
      console.log('Error when opening wdbdb', event);
      return fallback();
    };
  }

  make_ws = function() {
    var new_ws, sck,
      _this = this;

    sck = "ws://" + document.location.hostname + ":" + __ws_ports[__ws_port_index];
    console.log('Opening new socket', sck);
    new_ws = new WebSocket(sck);
    new_ws.onclose = function(m) {
      console.log("WebSocket closed " + m);
      if (!stop) {
        if (waited_for_ws > 5000) {
          waited_for_ws = 0;
          __ws_port_index++;
        }
        if (__ws_port_index < __ws_ports.length) {
          waited_for_ws += 500;
          return setTimeout((function() {
            return _this.ws = ws = make_ws();
          }), 500);
        }
      }
    };
    new_ws.onerror = function(m) {
      console.log("WebSocket error " + m);
      if (!stop) {
        return setTimeout((function() {
          return _this.ws = ws = make_ws();
        }), 1000);
      }
    };
    new_ws.onopen = function(m) {
      console.log("WebSocket is open", m);
      if (!started) {
        register_handlers();
        started = true;
      }
      start();
      $('#waiter').remove();
      $('#wdb').show();
      return $('#eval').focus();
    };
    new_ws.onmessage = function(m) {
      var cmd, data, message, pipe, treat;

      if (stop) {
        return;
      }
      message = m.data;
      pipe = message.indexOf('|');
      if (pipe > -1) {
        cmd = message.substr(0, pipe);
        data = JSON.parse(message.substr(pipe + 1));
      } else {
        cmd = message;
      }
      console.log(time(), '<-', cmd);
      treat = (function() {
        switch (cmd) {
          case 'Init':
            return init;
          case 'Title':
            return title;
          case 'Trace':
            return trace;
          case 'Select':
            return select;
          case 'Print':
            return print;
          case 'Echo':
            return echo;
          case 'BreakSet':
            return breakset;
          case 'BreakUnset':
            return breakunset;
          case 'Dump':
            return dump;
          case 'Suggest':
            return suggest;
          case 'Log':
            return log;
          case 'Die':
            return die;
        }
      })();
      if (!treat) {
        return console.log('Unknown command', cmd);
      } else {
        return treat(data);
      }
    };
    return new_ws;
  };

  $(function() {
    var end, xhr;

    setTimeout(function() {
      var dot;

      $('#deactivate').click(function() {
        $.get('/__wdb/off').done(function() {
          return location.reload(true);
        });
        return false;
      });
      $('#waiter').html('Wdb is tracing your request.<small>It may take some time.</small>');
      dot = function() {
        if ($('#waiter').length) {
          $('#waiter small').text($('#waiter small').text() + '.');
          return setTimeout(dot, 250);
        }
      };
      return dot();
    }, 250);
    end = function(page) {
      var e;

      stop = true;
      if (ws) {
        try {
          send('Quit');
          ws.close();
        } catch (_error) {
          e = _error;
          ({});
        }
      }
      document.open();
      document.write(page);
      return document.close();
    };
    _this.ws = ws = make_ws();
    _this.onbeforeunload = function() {
      var e;

      try {
        console.log('Try jit quit');
        send('Quit');
      } catch (_error) {
        e = _error;
        ({});
      }
      return void 0;
    };
    if (__ws_alt_ports) {
      return;
    }
    if (__ws_post) {
      xhr = $.ajax(location.href, {
        type: 'POST',
        data: __ws_post.data,
        contentType: __ws_post.enctype,
        traditional: true,
        headers: {
          'X-Debugger': 'WDB-' + __ws_ports.join(',')
        }
      });
    } else {
      xhr = $.ajax(location.href, {
        headers: {
          'X-Debugger': 'WDB-' + __ws_ports.join(',')
        }
      });
    }
    return xhr.done(function(data) {
      return end(data);
    }).fail(function(data) {
      if (data.responseText) {
        return end(data.responseText);
      }
    });
  });

  start = function() {
    send('Start');
    $source = $('#source');
    return $traceback = $('#traceback');
  };

  init = function(data) {
    return cwd = data.cwd;
  };

  title = function(data) {
    $('#title').text(data.title).append($('<small>').text(data.subtitle));
    $('#source').css({
      height: $(window).height() - $('#title').outerHeight(true) - 10
    });
    return $traceback.css({
      height: $(window).height() - $('#title').outerHeight(true) - 10
    });
  };

  trace = function(data) {
    var $tracecode, $tracefile, $tracefilelno, $tracefun, $tracefunfun, $traceline, $tracelno, frame, suffix, _j, _len, _ref;

    $traceback.empty();
    _ref = data.trace;
    for (_j = 0, _len = _ref.length; _j < _len; _j++) {
      frame = _ref[_j];
      $traceline = $('<div>').addClass('traceline').attr('id', 'trace-' + frame.level).attr('data-level', frame.level);
      $tracefile = $('<span>').addClass('tracefile').text(frame.file);
      $tracelno = $('<span>').addClass('tracelno').text(frame.lno);
      $tracefun = $('<span>').addClass('tracefun').text(frame["function"]);
      $tracefilelno = $('<div>').addClass('tracefilelno').append($tracefile).append($tracelno);
      $tracefunfun = $('<div>').addClass('tracefunfun').append($tracefun);
      if (frame.file.indexOf('site-packages') > 0) {
        suffix = frame.file.split('site-packages').slice(-1)[0];
        $tracefile.text(suffix);
        $tracefile.prepend($('<span>').addClass('tracestar').text('*').attr({
          title: frame.file
        }));
      }
      if (frame.file.indexOf(cwd) === 0) {
        suffix = frame.file.split(cwd).slice(-1)[0];
        $tracefile.text(suffix);
        $tracefile.prepend($('<span>').addClass('tracestar').text('.').attr({
          title: frame.file
        }));
      }
      $tracecode = $('<div>').addClass('tracecode');
      code($tracecode, frame.code);
      $traceline.append($tracefilelno);
      $traceline.append($tracecode);
      $traceline.append($tracefunfun);
      $traceback.prepend($traceline);
    }
    return $('.traceline').on('click', function() {
      return send('Select|' + $(this).attr('data-level'));
    });
  };

  CodeMirror.keyMap.wdb = {
    "Esc": function(cm) {
      return toggle_edition(false);
    },
    fallthrough: ["default"]
  };

  CodeMirror.commands.save = function() {
    return send("Save|" + cm._fn + "|" + (cm.getValue()));
  };

  get_mode = function(fn) {
    var ext;

    ext = fn.split('.').splice(-1)[0];
    if (ext === 'py') {
      return 'python';
    } else if (ext === 'jinja2') {
      return 'jinja2';
    }
  };

  create_code_mirror = function(file, name, rw) {
    if (rw == null) {
      rw = false;
    }
    window.cm = cm = CodeMirror((function(elt) {
      $('#source').prepend(elt);
      return $(elt).addClass(rw ? 'rw' : 'ro');
    }), {
      value: file,
      mode: get_mode(name),
      readOnly: !rw,
      theme: cm_theme,
      keyMap: 'wdb',
      gutters: ["breakpoints", "CodeMirror-linenumbers"],
      lineNumbers: true
    });
    cm._bg_marks = {
      cls: {},
      marks: {}
    };
    cm._rw = rw;
    cm._fn = name;
    cm._file = file;
    cm.on("gutterClick", function(cm, n) {
      return toggle_break(n + 1);
    });
    cm.addClass = function(lno, cls) {
      cm.addLineClass(lno - 1, 'background', cls);
      if (cm._bg_marks.cls[lno]) {
        return cm._bg_marks.cls[lno] = cm._bg_marks.cls[lno] + ' ' + cls;
      } else {
        return cm._bg_marks.cls[lno] = cls;
      }
    };
    cm.removeClass = function(lno, cls) {
      cm.removeLineClass(lno - 1, 'background', cls);
      return delete cm._bg_marks.cls[lno];
    };
    cm.addMark = function(lno, cls, char) {
      cm._bg_marks.marks[lno] = [cls, char];
      return cm.setGutterMarker(lno - 1, "breakpoints", $('<div>', {
        "class": cls
      }).html(char).get(0));
    };
    return cm.removeMark = function(lno) {
      delete cm._bg_marks.marks[lno];
      return cm.setGutterMarker(lno - 1, "breakpoints", null);
    };
  };

  toggle_edition = function(rw) {
    var char, cls, lno, marks, scroll, _ref;

    cls = $.extend({}, cm._bg_marks.cls);
    marks = $.extend({}, cm._bg_marks.marks);
    scroll = $('#source .CodeMirror-scroll').scrollTop();
    $('#source .CodeMirror').remove();
    create_code_mirror(cm._file, cm._fn, rw);
    for (lno in cls) {
      cm.addClass(lno, cls[lno]);
    }
    for (lno in marks) {
      _ref = marks[lno], cls = _ref[0], char = _ref[1];
      cm.addMark(lno, cls, char);
    }
    return $('#source .CodeMirror-scroll').scrollTop(scroll);
  };

  select = function(data) {
    var $hline, $scroll, current_frame, lno, _j, _k, _len, _ref, _ref1, _ref2;

    $source = $('#source');
    current_frame = data.frame;
    $('.traceline').removeClass('selected');
    $('#trace-' + current_frame.level).addClass('selected');
    $('#eval').val('').attr('data-index', -1).attr('rows', 1);
    if (!window.cm) {
      create_code_mirror(data.file, data.name);
    } else {
      cm = window.cm;
      if (cm._fn === data.name) {
        for (lno in cm._bg_marks.cls) {
          cm.removeLineClass(lno - 1, 'background');
        }
        for (lno in cm._bg_marks.marks) {
          cm.setGutterMarker(lno - 1, 'breakpoints', null);
        }
      } else {
        cm.setValue(data.file);
        cm._fn = data.name;
        cm._file = data.file;
      }
      cm._bg_marks.cls = {};
      cm._bg_marks.marks = {};
    }
    _ref = data.breaks;
    for (_j = 0, _len = _ref.length; _j < _len; _j++) {
      lno = _ref[_j];
      cm.addClass(lno, 'breakpoint');
    }
    cm.addClass(current_frame.lno, 'highlighted');
    cm.addMark(current_frame.lno, 'highlighted', '➤');
    for (lno = _k = _ref1 = current_frame.flno, _ref2 = current_frame.llno + 1; _ref1 <= _ref2 ? _k < _ref2 : _k > _ref2; lno = _ref1 <= _ref2 ? ++_k : --_k) {
      cm.addClass(lno, 'ctx');
      if (lno === current_frame.flno) {
        cm.addClass(lno, 'ctx-top');
      } else if (lno === current_frame.llno) {
        cm.addClass(lno, 'ctx-bottom');
      }
    }
    cm.scrollIntoView({
      line: current_frame.lno,
      ch: 1
    }, 1);
    $scroll = $('#source .CodeMirror-scroll');
    $hline = $('#source .highlighted');
    return $scroll.scrollTop($hline.offset().top - $scroll.offset().top + $scroll.scrollTop() - $scroll.height() / 2);
  };

  ellipsize = function(code_elt) {
    return code_elt.find('span.cm-string').each(function() {
      var txt;

      txt = $(this).text();
      if (txt.length > 128) {
        $(this).text('');
        $(this).append($('<span class="short close">').text(txt.substr(0, 128)));
        return $(this).append($('<span class="long">').text(txt.substr(128)));
      }
    });
  };

  code = function(parent, code, classes, html) {
    var cls, code_elt, _j, _k, _len, _len1;

    if (classes == null) {
      classes = [];
    }
    if (html == null) {
      html = false;
    }
    if (html) {
      code_elt = $('<code>', {
        'class': 'cm-s-' + cm_theme
      }).html(code);
      for (_j = 0, _len = classes.length; _j < _len; _j++) {
        cls = classes[_j];
        code_elt.addClass(cls);
      }
      parent.append(code_elt);
      code_elt.add(code_elt.find('*')).contents().filter(function() {
        return this.nodeType === 3 && this.nodeValue.length > 0;
      }).wrap('<span>').parent().each(function() {
        var span;

        span = this;
        $(span).addClass('waiting_for_hl');
        return setTimeout((function() {
          CodeMirror.runMode($(span).text(), "python", span);
          $(span).removeClass('waiting_for_hl');
          return ellipsize(code_elt);
        }), 50);
      });
    } else {
      code_elt = $('<code>', {
        'class': 'cm-s-' + cm_theme
      });
      for (_k = 0, _len1 = classes.length; _k < _len1; _k++) {
        cls = classes[_k];
        code_elt.addClass(cls);
      }
      parent.append(code_elt);
      CodeMirror.runMode(code, "python", code_elt.get(0));
      ellipsize(code_elt);
    }
    return code_elt;
  };

  historize = function(snippet) {
    var filename, index;

    filename = $('.selected .tracefile').text();
    if (!(filename in cmd_hist)) {
      cmd_hist[filename] = [];
    }
    if (!(filename in session_cmd_hist)) {
      session_cmd_hist[filename] = [];
    }
    while ((index = cmd_hist[filename].indexOf(snippet)) !== -1) {
      cmd_hist[filename].splice(index, 1);
    }
    cmd_hist[filename].unshift(snippet);
    session_cmd_hist[filename].unshift(snippet);
    return set('cmd')({
      name: filename,
      history: cmd_hist[filename]
    });
  };

  last_cmd = null;

  execute = function(snippet) {
    var cmd, data, key, space;

    snippet = snippet.trim();
    historize(snippet);
    cmd = function(cmd) {
      send(cmd);
      return last_cmd = cmd;
    };
    if (snippet.indexOf('.') === 0) {
      space = snippet.indexOf(' ');
      if (space > -1) {
        key = snippet.substr(1, space - 1);
        data = snippet.substr(space + 1);
      } else {
        key = snippet.substr(1);
        data = '';
      }
      switch (key) {
        case 's':
          cmd('Step');
          break;
        case 'n':
          cmd('Next');
          break;
        case 'r':
          cmd('Return');
          break;
        case 'c':
          cmd('Continue');
          break;
        case 'u':
          cmd('Until');
          break;
        case 'j':
          cmd('Jump|' + data);
          break;
        case 'b':
          toggle_break(data);
          break;
        case 't':
          toggle_break(data, true);
          break;
        case 'f':
          print_hist(session_cmd_hist[$('.selected .tracefile').text()]);
          break;
        case 'd':
          cmd('Dump|' + data);
          break;
        case 'e':
          toggle_edition(!cm._rw);
          break;
        case 'q':
          cmd('Quit');
          break;
        case 'h':
          print_help();
      }
      return;
    } else if (snippet.indexOf('?') === 0) {
      cmd('Dump|' + snippet.slice(1).trim());
      suggest_stop();
      return;
    } else if (snippet === '' && last_cmd) {
      cmd(last_cmd);
      return;
    }
    if (snippet) {
      return send("Eval|" + snippet);
    }
  };

  print_hist = function(hist) {
    return print({
      "for": 'History',
      result: hist.slice(0).reverse().filter(function(e) {
        return e.indexOf('.') !== 0;
      }).join('\n')
    });
  };

  print_help = function() {
    return print({
      "for": 'Supported commands',
      result: '.s or [Ctrl] + [↓] or [F11]  : Step into\n.n or [Ctrl] + [→] or [F10]  : Step over (Next)\n.r or [Ctrl] + [↑] or [F9]   : Step out (Return)\n.c or [Ctrl] + [←] or [F8]   : Continue\n.u or [F7]                   : Until (Next over loops)\n.j lineno                    : Jump to lineno (Must be at bottom frame and in the same function)\n.b [file:]lineno[, condition]: Break on file at lineno (file is the current file by default)\n.t [file:]lineno[, condition]: Same as b but break only once\n.f                           : Echo all typed commands in the current debugging session\n.d expression                : Dump the result of expression in a table\n.q                           : Quit\n.h                           : Get some help\n.e                           : Toggle file edition mode\nexpr !> file                 : Write the result of expr in file\n!< file                      : Eval the content of file\n[Enter]                      : Eval the current selected text in page, useful to eval code in the source'
    });
  };

  termscroll = function() {
    return $('#interpreter').stop(true).animate({
      scrollTop: $('#scrollback').height()
    }, 1000);
  };

  print = function(data) {
    var snippet;

    suggest_stop();
    snippet = $('#eval').val();
    code($('#scrollback'), data["for"], ['prompted']);
    code($('#scrollback'), data.result, [], true);
    $('#eval').val('').attr('data-index', -1).attr('rows', 1);
    return termscroll();
  };

  echo = function(data) {
    code($('#scrollback'), data["for"], ['prompted']);
    code($('#scrollback'), data.val || '', [], true);
    return termscroll();
  };

  dump = function(data) {
    var $attr_tbody, $container, $core_tbody, $method_tbody, $table, $tbody, key, val, _ref;

    code($('#scrollback'), data["for"], ['prompted']);
    $container = $('<div>');
    $table = $('<table>', {
      "class": 'object'
    }).appendTo($container);
    $table.append($('<tbody>', {
      "class": 'toggle hidden'
    }).append($('<tr>').append($('<td>', {
      "class": 'core',
      colspan: 2
    }).text('Core Members'))));
    $core_tbody = $('<tbody>', {
      "class": 'core hidden'
    }).appendTo($table);
    $table.append($('<tbody>', {
      "class": 'toggle hidden'
    }).append($('<tr>').append($('<td>', {
      "class": 'method',
      colspan: 2
    }).text('Methods'))));
    $method_tbody = $('<tbody>', {
      "class": 'method hidden'
    }).appendTo($table);
    $table.append($('<tbody>', {
      "class": 'toggle shown'
    }).append($('<tr>').append($('<td>', {
      "class": 'attr',
      colspan: 2
    }).text('Attributes'))));
    $attr_tbody = $('<tbody>', {
      "class": 'attr shown'
    }).appendTo($table);
    _ref = data.val;
    for (key in _ref) {
      val = _ref[key];
      $tbody = $attr_tbody;
      if (key.indexOf('__') === 0 && key.indexOf('__', key.length - 2) !== -1) {
        $tbody = $core_tbody;
      } else if (val.type.indexOf('method') !== -1) {
        $tbody = $method_tbody;
      }
      $tbody.append($('<tr>').append($('<td>').text(key)).append($('<td>').html(val.val)));
    }
    code($('#scrollback'), $container.html(), [], true);
    termscroll();
    return $('#eval').val('');
  };

  breakset = function(data) {
    var $eval;

    if (data.lno) {
      cm.removeClass(data.lno, 'ask-breakpoint');
      cm.addClass(data.lno, 'breakpoint');
      if (data.cond) {
        $line.attr('title', "On [" + data.cond + "]");
      }
    }
    $eval = $('#eval');
    if ($eval.val().indexOf('.b ') === 0 || $eval.val().indexOf('.t ') === 0) {
      return $eval.val('');
    }
  };

  breakunset = function(data) {
    var $eval;

    cm.removeClass(data.lno, 'ask-breakpoint');
    $eval = $('#eval');
    if ($eval.val().indexOf('.b ') === 0) {
      return $eval.val('');
    }
  };

  toggle_break = function(lno, temporary) {
    var cls, cmd;

    cmd = temporary ? 'TBreak' : 'Break';
    if (('' + lno).indexOf(':') > -1) {
      send(cmd + '|' + lno);
      return;
    }
    cls = cm.lineInfo(lno - 1).bgClass || '';
    if (cls.split(' ').indexOf('breakpoint') > -1) {
      cm.removeMark(lno);
      cm.removeClass(lno, 'breakpoint');
      cm.addClass(lno, 'ask-breakpoint');
      return send('Unbreak|' + lno);
    } else {
      cm.addClass(lno, 'breakpoint');
      cm.addMark(lno, 'breakpoint', temporary ? '○' : '●');
      return send(cmd + '|' + lno);
    }
  };

  format_fun = function(p) {
    var cls, param, tags, _j, _len, _ref;

    tags = [
      $('<span>', {
        "class": 'fun_name',
        title: p.module
      }).text(p.call_name), $('<span>', {
        "class": 'fun_punct'
      }).text('(')
    ];
    _ref = p.params;
    for (i = _j = 0, _len = _ref.length; _j < _len; i = ++_j) {
      param = _ref[i];
      cls = 'fun_param';
      if (i === p.index || (i === p.params.length - 1 && p.index > i)) {
        cls = 'fun_param active';
      }
      tags.push($('<span>', {
        "class": cls
      }).text(param));
      if (i !== p.params.length - 1) {
        tags.push($('<span>', {
          "class": 'fun_punct'
        }).text(', '));
      }
    }
    tags.push($('<span>', {
      "class": 'fun_punct'
    }).text(')'));
    return tags;
  };

  suggest = function(data) {
    var $appender, $comp, $eval, $tbody, $td, added, base_len, completion, index, _j, _len, _ref, _ref1;

    $eval = $('#eval');
    $comp = $('#completions table').empty();
    $comp.append($('<thead><tr><th id="comp-desc" colspan="5">'));
    added = [];
    if (data.params) {
      $('#comp-desc').append(format_fun(data.params));
    }
    if (data.completions.length) {
      $tbody = $('<tbody>');
      base_len = data.completions[0].base.length;
      $eval.data({
        root: $eval.val().substr(0, $eval.val().length - base_len)
      });
    }
    _ref = data.completions;
    for (index = _j = 0, _len = _ref.length; _j < _len; index = ++_j) {
      completion = _ref[index];
      if (_ref1 = completion.base + completion.complete, __indexOf.call(added, _ref1) >= 0) {
        continue;
      }
      added.push(completion.base + completion.complete);
      if (index % 5 === 0) {
        $tbody.append($appender = $('<tr>'));
      }
      $appender.append($td = $('<td>').attr('title', completion.description).append($('<span>').addClass('base').text(completion.base)).append($('<span>').addClass('completion').text(completion.complete)));
      if (!completion.complete) {
        $td.addClass('active complete');
        $('#comp-desc').html($td.attr('title'));
      }
    }
    $comp.append($tbody);
    return termscroll();
  };

  suggest_stop = function() {
    return $('#completions table').empty();
  };

  log = function(data) {
    return console.log(data.message);
  };

  searchback = function() {
    var h, index, re, val, _j, _len, _ref;

    suggest_stop();
    index = backsearch;
    val = $('#eval').val();
    _ref = cmd_hist[$('.selected .tracefile').text()];
    for (_j = 0, _len = _ref.length; _j < _len; _j++) {
      h = _ref[_j];
      re = new RegExp('(' + val + ')', 'gi');
      if (re.test(h)) {
        index--;
        if (index === 0) {
          $('#backsearch').html(h.replace(re, '<span class="backsearched">$1</span>'));
          return;
        }
      }
    }
    if (backsearch === 1) {
      searchback_stop();
      return;
    }
    return backsearch = Math.max(backsearch - 1, 1);
  };

  searchback_stop = function(validate) {
    if (validate) {
      $('#eval').val($('#backsearch').text());
    }
    $('#backsearch').html('');
    return backsearch = null;
  };

  die = function() {
    $('#source,#traceback').remove();
    $('h1').html('Dead<small>Program has exited</small>');
    ws.close();
    if (__ws_alt_ports) {
      return setTimeout((function() {
        return close();
      }), 1000);
    }
  };

  register_handlers = function() {
    $('body,html').on('keydown', function(e) {
      if (cm._rw) {
        return true;
      }
      if ((e.ctrlKey && e.keyCode === 37) || e.keyCode === 119) {
        send('Continue');
        return false;
      }
      if ((e.ctrlKey && e.keyCode === 38) || e.keyCode === 120) {
        send('Return');
        return false;
      }
      if ((e.ctrlKey && e.keyCode === 39) || e.keyCode === 121) {
        send('Next');
        return false;
      }
      if ((e.ctrlKey && e.keyCode === 40) || e.keyCode === 122) {
        send('Step');
        return false;
      }
      if (e.keyCode === 118) {
        send('Until');
        return false;
      }
    });
    $('#eval').on('keydown', function(e) {
      var $active, $eval, $tds, base, completion, endPos, filename, index, startPos, to_set, txtarea;

      $eval = $(this);
      if (e.altKey && e.keyCode === 82 && backsearch) {
        backsearch = Math.max(backsearch - 1, 1);
        searchback();
        return false;
      }
      if (e.ctrlKey) {
        if (e.keyCode === 82) {
          if (backsearch === null) {
            backsearch = 1;
          } else {
            if (e.shiftKey) {
              backsearch = Math.max(backsearch - 1, 1);
            } else {
              backsearch++;
            }
          }
          searchback();
          return false;
        } else if (e.keyCode === 67) {
          searchback_stop();
        } else {
          e.stopPropagation();
          return;
        }
      }
      if (e.keyCode === 13) {
        if (backsearch) {
          searchback_stop(true);
          return false;
        }
        if ($('#completions table td.active').length && !$('#completions table td.complete').length) {
          suggest_stop();
          return false;
        }
        $eval = $(this);
        if (!e.shiftKey) {
          execute($eval.val());
          return false;
        } else {
          $eval.attr('rows', parseInt($eval.attr('rows')) + 1);
          return termscroll();
        }
      } else if (e.keyCode === 27) {
        suggest_stop();
        searchback_stop();
        return false;
      } else if (e.keyCode === 9) {
        if (e.shiftKey) {
          $eval = $(this);
          txtarea = $eval.get(0);
          startPos = txtarea.selectionStart;
          endPos = txtarea.selectionEnd;
          if (startPos || startPos === '0') {
            $eval.val($eval.val().substring(0, startPos) + '    ' + $eval.val().substring(endPos, $eval.val().length));
          } else {
            $eval.val($eval.val() + '    ');
          }
          return false;
        }
        if (backsearch) {
          return false;
        }
        $tds = $('#completions table td');
        $active = $tds.filter('.active');
        if ($tds.length) {
          if (!$active.length) {
            $active = $tds.first().addClass('active');
          } else {
            index = $tds.index($active);
            if (index === $tds.length - 1) {
              index = 0;
            } else {
              index++;
            }
            $active.removeClass('active complete');
            $active = $tds.eq(index).addClass('active');
          }
          base = $active.find('.base').text();
          completion = $active.find('.completion').text();
          $eval.val($eval.data().root + base + completion);
          $('#comp-desc').text($active.attr('title'));
          termscroll();
        }
        return false;
      } else if (e.keyCode === 38) {
        $eval = $(this);
        filename = $('.selected .tracefile').text();
        if (!e.shiftKey) {
          if (filename in cmd_hist) {
            index = parseInt($eval.attr('data-index')) + 1;
            if (index >= 0 && index < cmd_hist[filename].length) {
              to_set = cmd_hist[filename][index];
              if (index === 0) {
                $eval.attr('data-current', $eval.val());
              }
              $eval.val(to_set).attr('data-index', index).attr('rows', to_set.split('\n').length);
              return false;
            }
          }
        }
      } else if (e.keyCode === 40) {
        $eval = $(this);
        filename = $('.selected .tracefile').text();
        if (!e.shiftKey) {
          if (filename in cmd_hist) {
            index = parseInt($eval.attr('data-index')) - 1;
            if (index >= -1 && index < cmd_hist[filename].length) {
              if (index === -1) {
                to_set = $eval.attr('data-current');
              } else {
                to_set = cmd_hist[filename][index];
              }
              $eval.val(to_set).attr('data-index', index).attr('rows', to_set.split('\n').length);
              return false;
            }
          }
        }
      }
    });
    $("#scrollback").on('click', 'a.inspect', function() {
      send('Inspect|' + $(this).attr('href'));
      return false;
    }).on('click', '.short.close', function() {
      return $(this).addClass('open').removeClass('close').next('.long').show('fast');
    }).on('click', '.long,.short.open', function() {
      var elt;

      elt = $(this).hasClass('long') ? $(this) : $(this).next('.long');
      return elt.hide('fast').prev('.short').removeClass('open').addClass('close');
    }).on('click', '.toggle', function() {
      return $(this).add($(this).next()).toggleClass('hidden', 'shown');
    });
    $("#source").on('dblclick', function(e) {
      return !cm._rw && toggle_edition(true);
    });
    $("#sourcecode").on('mouseup', 'span', function(e) {
      var target;

      if (e.which === 2) {
        target = $(this).text().trim();
        historize(target);
        return send('Dump|' + target);
      }
    });
    $(document).on('keydown', function(e) {
      var sel;

      if (e.keyCode === 13) {
        sel = document.getSelection().toString().trim();
        if (sel) {
          historize(sel);
          return send('Dump|' + sel);
        }
      }
    });
    return $('#eval').on('input', function() {
      var hist, txt;

      txt = $(this).val();
      if (backsearch) {
        if (!txt) {
          searchback_stop();
        } else {
          backsearch = 1;
          searchback();
        }
        return;
      }
      hist = session_cmd_hist[$('.selected .tracefile').text()] || [];
      if (txt && txt[0] !== '.') {
        return send('Complete|' + hist.slice(0).reverse().filter(function(e) {
          return e.indexOf('.') !== 0;
        }).join('\n') + '\n' + txt);
      } else {
        return suggest_stop();
      }
    }).on('blur', function() {
      return searchback_stop();
    });
  };

}).call(this);

/*
//@ sourceMappingURL=wdb.map
*/
