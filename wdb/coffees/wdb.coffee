# This file is part of wdb
#
# wdb Copyright (C) 2012  Florian Mounier, Kozea
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

#### Initializations ####

time = ->
    d = new Date()
    "#{d.getHours()}:#{d.getMinutes()}:#{d.getSeconds()}.#{d.getMilliseconds()}"

cm = null
cm_theme = 'tomorrow-night'

started = false
stop = false
ws = null
cwd = null
backsearch = null
get_random_port = () ->
    10000 + parseInt(Math.random() * 50000)
__ws_ports = __ws_alt_ports
if not __ws_ports
    __ws_ports = []
    for i in [0..5]
        __ws_ports.push(get_random_port())
__ws_port_index = 0
cmd_hist = {}
session_cmd_hist = {}
waited_for_ws = 0
$source = null
$traceback = null

send = (msg) ->
    console.log time(), '->', msg
    ws.send msg

@indexedDB = @indexedDB or @mozIndexedDB or @webkitIndexedDB or @msIndexedDB
@IDBTransaction = @IDBTransaction or @webkitIDBTransaction or @msIDBTransaction
@IDBKeyRange = @IDBKeyRange or @webkitIDBKeyRange or @msIDBKeyRange

fallback = ->
    file_cache = {}
    @get = (type) -> (obj, callback) -> callback(obj of file_cache and file_cache[obj])
    @set = (type) -> (obj) -> file_cache[obj.name] = obj

if not @indexedDB
    fallback()
else
    open = @indexedDB.open('wdbdb', 2)
    open.onerror = (event) -> console.log('Error when opening wdbdb', event)
    open.onupgradeneeded = (event) ->
        db = event.target.result
        db.createObjectStore("cmd", { keyPath: "name" })

    open.onsuccess = (event) =>
        console.info 'wdbdb is open'
        @wdbdb = open.result
        @get = (type) ->
            (key, callback, notfound, always) ->
                rq = @wdbdb.transaction([type]).objectStore(type).get(key)
                rq.onsuccess = (event) ->
                    if event.target.result
                        callback(event.target.result)
                    else
                        notfound and notfound()
                    always and always()
                if notfound
                    rq.onerror = (event) ->
                        notfound()
                        always and always()
                null
        @set = (type) ->
            (obj) ->
                rq = @wdbdb.transaction([type], 'readwrite')
                os = rq.objectStore(type)
                os.put(obj)
                rq.onerror = (event) -> console.log('Add error', event)
                null

        @wdbdb.transaction(['cmd']).objectStore('cmd').openCursor().onsuccess = (event) ->
            cursor = event.target.result
            if cursor
                cmd_hist[cursor.value.name] = cursor.value.history
                cursor.continue()

    open.onerror = (event) ->
        console.log('Error when opening wdbdb', event)
        fallback()

make_ws = ->
    # Open a websocket in case of request break
    sck = "ws://" + document.location.hostname + ":" + __ws_ports[__ws_port_index]
    console.log 'Opening new socket', sck
    new_ws = new WebSocket sck
    new_ws.onclose = (m) =>
        console.log "WebSocket closed #{m}"
        if not stop
            if waited_for_ws > 5000
                waited_for_ws = 0
                __ws_port_index++
            if __ws_port_index < __ws_ports.length
                waited_for_ws += 500
                setTimeout (=>
                    @ws = ws = make_ws()), 500

    new_ws.onerror = (m) =>
        console.log "WebSocket error #{m}"
        if not stop
            setTimeout (=>
                @ws = ws = make_ws()), 1000

    new_ws.onopen = (m) ->
        # We are connected, ie: in request break
        console.log "WebSocket is open", m
        # Start by getting current trace
        if not started
            register_handlers()
            started = true
        start()

        $('#waiter').remove()
        $('#wdb').show()
        $('#eval').focus()

    new_ws.onmessage = (m) ->
        if stop
            return
        # Open a websocket in case of request break
        message = m.data
        pipe = message.indexOf('|')
        if pipe > -1
            cmd = message.substr(0, pipe)
            data = JSON.parse message.substr(pipe + 1)
        else
            cmd = message
        console.log time(), '<-', cmd
        treat = switch cmd
            when 'Init'       then init
            when 'Title'      then title
            when 'Trace'      then trace
            when 'Select'     then select
            when 'Print'      then print
            when 'Echo'       then echo
            when 'BreakSet'   then breakset
            when 'BreakUnset' then breakunset
            when 'Dump'       then dump
            when 'Suggest'    then suggest
            when 'Log'        then log
            when 'Die'        then die
        if not treat
            console.log 'Unknown command', cmd
        else
            treat data
    new_ws

#### Loading ####
$ =>
    setTimeout(->
        $('#deactivate').click () ->
            $.get('/__wdb/off').done(() -> location.reload(true))
            false

        $('#waiter').html('Wdb is tracing your request.<small>It may take some time.</small>')
        dot = ->
            if $('#waiter').length
                $('#waiter small').text($('#waiter small').text() + '.')
                setTimeout(dot, 250)
        dot()
    , 250)

    # Try getting the original page
    end = (page) ->
        stop = true
        if ws
            try
                send('Quit')
                ws.close()
            catch e
                {}
        document.open()
        document.write page
        document.close()

    @ws = ws = make_ws()
    
    @onbeforeunload = ->
        try
            console.log('Try jit quit')
            send('Quit')
        catch e
            {}
        undefined

    if __ws_alt_ports  # alt_ports -> Outside of WSGI
        return

    if __ws_post
        xhr = $.ajax(location.href,
            type: 'POST',
            data: __ws_post.data,
            contentType: __ws_post.enctype,
            traditional: true,
            headers: 'X-Debugger': 'WDB-' + __ws_ports.join(','))
    else
        xhr = $.ajax(location.href,
            headers: 'X-Debugger': 'WDB-' + __ws_ports.join(','))

    xhr.done((data) => end(data))
       .fail (data) =>
            if data.responseText
                end(data.responseText)


start = ->
    send('Start')
    $source = $('#source')
    $traceback = $('#traceback')

init = (data) ->
    cwd = data.cwd

title = (data) ->
    $('#title').text(data.title).append($('<small>').text(data.subtitle))
    $('#source').css(height: $(window).height() - $('#title').outerHeight(true) - 10)
    $traceback.css(height: $(window).height() - $('#title').outerHeight(true) - 10)

trace = (data) ->
    $traceback.empty()
    for frame in data.trace
        $traceline = $('<div>')
            .addClass('traceline')
            .attr('id', 'trace-' + frame.level)
            .attr('data-level', frame.level)

        $tracefile = $('<span>').addClass('tracefile').text(frame.file)
        $tracelno = $('<span>').addClass('tracelno').text(frame.lno)
        $tracefun = $('<span>').addClass('tracefun').text(frame.function)

        $tracefilelno = $('<div>')
            .addClass('tracefilelno')
            .append($tracefile)
            .append($tracelno)

        $tracefunfun = $('<div>')
            .addClass('tracefunfun')
            .append($tracefun)

        if frame.file.indexOf('site-packages') > 0
            suffix = frame.file.split('site-packages').slice(-1)[0]
            $tracefile.text(suffix)
            $tracefile.prepend($('<span>').addClass('tracestar').text('*').attr(title: frame.file))

        if frame.file.indexOf(cwd) == 0
            suffix = frame.file.split(cwd).slice(-1)[0]
            $tracefile.text(suffix)
            $tracefile.prepend($('<span>').addClass('tracestar').text('.').attr(title: frame.file))

        $tracecode = $('<div>').addClass('tracecode')

        code($tracecode, frame.code)
        $traceline.append $tracefilelno
        $traceline.append $tracecode
        $traceline.append $tracefunfun
        $traceback.prepend $traceline

    $('.traceline').on('click', ->
        send('Select|' + $(@).attr('data-level'))
    )

CodeMirror.keyMap.wdb = (
    "Esc": (cm) -> toggle_edition false,
    fallthrough: ["default"]
)

CodeMirror.commands.save = ->
    send("Save|#{cm._fn}|#{cm.getValue()}")

get_mode = (fn) ->
    ext = fn.split('.').splice(-1)[0]
    if ext == 'py'
        'python'
    else if ext == 'jinja2'
        'jinja2'

create_code_mirror = (file, name, rw=false)->
    window.cm = cm = CodeMirror ((elt) ->
        $('#source').prepend(elt)
        $(elt).addClass(if rw then 'rw' else 'ro')
        ) , (
        value: file,
        mode:  get_mode(name),
        readOnly: !rw,
        theme: cm_theme,
        keyMap: 'wdb',
        gutters: ["breakpoints", "CodeMirror-linenumbers"],
        lineNumbers: true)
    cm._bg_marks = cls: {}, marks: {}
    cm._rw = rw
    cm._fn = name
    cm._file = file

    cm.on("gutterClick", (cm, n) ->
        toggle_break n + 1
    )

    cm.addClass = (lno, cls) ->
        cm.addLineClass(lno - 1, 'background', cls)
        if cm._bg_marks.cls[lno]
            cm._bg_marks.cls[lno] = cm._bg_marks.cls[lno] + ' ' + cls
        else
            cm._bg_marks.cls[lno] = cls

    cm.removeClass = (lno, cls) ->
        cm.removeLineClass(lno - 1, 'background', cls)
        delete cm._bg_marks.cls[lno]

    cm.addMark = (lno, cls, char) ->
        cm._bg_marks.marks[lno] = [cls, char]
        cm.setGutterMarker(lno - 1, "breakpoints", $('<div>', class: cls).html(char).get(0))

    cm.removeMark = (lno) ->
        delete cm._bg_marks.marks[lno]
        cm.setGutterMarker(lno - 1, "breakpoints", null)

toggle_edition = (rw) ->
    cls = $.extend({}, cm._bg_marks.cls)
    marks = $.extend({}, cm._bg_marks.marks)
    scroll = $('#source .CodeMirror-scroll').scrollTop()
    $('#source .CodeMirror').remove()
    create_code_mirror cm._file, cm._fn, rw
    for lno of cls
        cm.addClass(lno, cls[lno])
    for lno of marks
        [cls, char] = marks[lno]
        cm.addMark(lno, cls, char)
    $('#source .CodeMirror-scroll').scrollTop(scroll)

select = (data) ->
    $source = $ '#source'
    current_frame = data.frame
    $('.traceline').removeClass('selected')
    $('#trace-' + current_frame.level).addClass('selected')
    $('#eval').val('').attr('data-index', -1).attr('rows', 1)

    if not window.cm
        create_code_mirror data.file, data.name
    else
        cm = window.cm
        if cm._fn == data.name
            for lno of cm._bg_marks.cls
                cm.removeLineClass(lno - 1, 'background')
            for lno of cm._bg_marks.marks
                cm.setGutterMarker(lno - 1, 'breakpoints', null)
        else
            cm.setValue data.file
            cm._fn = data.name
            cm._file = data.file
        cm._bg_marks.cls = {}
        cm._bg_marks.marks = {}

    for lno in data.breaks
        cm.addClass(lno, 'breakpoint')

    cm.addClass(current_frame.lno, 'highlighted')
    cm.addMark(current_frame.lno, 'highlighted', '➤')

    for lno in [current_frame.flno...current_frame.llno + 1]
        cm.addClass(lno, 'ctx')
        if lno == current_frame.flno
            cm.addClass(lno, 'ctx-top')
        else if lno == current_frame.llno
            cm.addClass(lno, 'ctx-bottom')

    cm.scrollIntoView(line: current_frame.lno, ch: 1, 1)
    $scroll = $ '#source .CodeMirror-scroll'
    $hline = $ '#source .highlighted'
    $scroll.scrollTop $hline.offset().top - $scroll.offset().top + $scroll.scrollTop() - $scroll.height() / 2

ellipsize = (code_elt) ->
    code_elt.find('span.cm-string').each ->
        txt = $(@).text()
        if txt.length > 128
            $(@).text ''
            $(@).append $('<span class="short close">').text(txt.substr(0, 128))
            $(@).append $('<span class="long">').text(txt.substr(128))

code = (parent, code, classes=[], html=false) ->
    if html
        code_elt = $('<code>', 'class': 'cm-s-' + cm_theme).html(code)
        for cls in classes
            code_elt.addClass(cls)
        parent.append code_elt
        code_elt.add(code_elt.find('*')).contents().filter(->
            @nodeType == 3 and @nodeValue.length > 0
        )
        .wrap('<span>')
        .parent()
        .each ->
            span = @
            $(span).addClass('waiting_for_hl')
            setTimeout (->
                CodeMirror.runMode $(span).text(), "python", span
                $(span).removeClass('waiting_for_hl')
                ellipsize code_elt
            ), 50
    else
        code_elt = $('<code>', 'class': 'cm-s-' + cm_theme)
        for cls in classes
            code_elt.addClass(cls)
        parent.append code_elt
        CodeMirror.runMode code, "python", code_elt.get(0)
        ellipsize code_elt

    code_elt


historize = (snippet) ->
    filename = $('.selected .tracefile').text()
    if not (filename of cmd_hist)
        cmd_hist[filename] = []
    if not (filename of session_cmd_hist)
        session_cmd_hist[filename] = []

    while (index = cmd_hist[filename].indexOf(snippet)) != -1
        cmd_hist[filename].splice(index, 1)

    cmd_hist[filename].unshift snippet
    session_cmd_hist[filename].unshift snippet

    set('cmd')(name: filename, history: cmd_hist[filename])

last_cmd = null
execute = (snippet) ->
    snippet = snippet.trim()
    historize snippet

    cmd = (cmd) ->
            send cmd
            last_cmd = cmd

    if snippet.indexOf('.') == 0
        space = snippet.indexOf(' ')
        if space > -1
            key = snippet.substr(1, space - 1)
            data = snippet.substr(space + 1)
        else
            key = snippet.substr(1)
            data = ''
        switch key
            when 's' then cmd 'Step'
            when 'n' then cmd 'Next'
            when 'r' then cmd 'Return'
            when 'c' then cmd 'Continue'
            when 'u' then cmd 'Until'
            when 'j' then cmd 'Jump|' + data
            when 'b' then toggle_break data
            when 't' then toggle_break(data, true)
            when 'f' then print_hist session_cmd_hist[$('.selected .tracefile').text()]
            when 'd' then cmd 'Dump|' + data
            when 'e' then toggle_edition(not cm._rw)
            when 'q' then cmd 'Quit'
            when 'h' then print_help()
        return
    else if snippet.indexOf('?') == 0
        cmd 'Dump|' + snippet.slice(1).trim()
        suggest_stop()
        return
    else if snippet == '' and last_cmd
        cmd last_cmd
        return
    if snippet
        send("Eval|#{snippet}")

print_hist = (hist) ->
    print for: 'History', result: hist.slice(0).reverse().filter((e) -> e.indexOf('.') != 0).join('\n')

print_help = ->
    print for: 'Supported commands', result: '''
.s or [Ctrl] + [↓] or [F11]  : Step into
.n or [Ctrl] + [→] or [F10]  : Step over (Next)
.r or [Ctrl] + [↑] or [F9]   : Step out (Return)
.c or [Ctrl] + [←] or [F8]   : Continue
.u or [F7]                   : Until (Next over loops)
.j lineno                    : Jump to lineno (Must be at bottom frame and in the same function)
.b [file:]lineno[, condition]: Break on file at lineno (file is the current file by default)
.t [file:]lineno[, condition]: Same as b but break only once
.f                           : Echo all typed commands in the current debugging session
.d expression                : Dump the result of expression in a table
.q                           : Quit
.h                           : Get some help
.e                           : Toggle file edition mode
expr !> file                 : Write the result of expr in file
!< file                      : Eval the content of file
[Enter]                      : Eval the current selected text in page, useful to eval code in the source'''

termscroll = ->
    $('#interpreter').stop(true).animate((scrollTop: $('#scrollback').height()), 1000)

print = (data) ->
    suggest_stop()
    snippet = $('#eval').val()
    code($('#scrollback'), data.for, ['prompted'])
    code($('#scrollback'), data.result, [], true)
    $('#eval').val('').attr('data-index', -1).attr('rows', 1)
    termscroll()

echo = (data) ->
    code($('#scrollback'), data.for, ['prompted'])
    code($('#scrollback'), data.val or '', [], true)
    termscroll()

dump = (data) ->
    code($('#scrollback'), data.for, ['prompted'])
    $container = $('<div>')
    $table = $('<table>', class: 'object').appendTo($container)
    $table.append($('<tbody>', class: 'toggle hidden').append($('<tr>').append($('<td>', class: 'core', colspan: 2).text('Core Members'))))
    $core_tbody = $('<tbody>', class: 'core hidden').appendTo($table)

    $table.append($('<tbody>', class: 'toggle hidden').append($('<tr>').append($('<td>', class: 'method', colspan: 2).text('Methods'))))
    $method_tbody = $('<tbody>', class: 'method hidden').appendTo($table)

    $table.append($('<tbody>', class: 'toggle shown').append($('<tr>').append($('<td>', class: 'attr', colspan: 2).text('Attributes'))))
    $attr_tbody = $('<tbody>', class: 'attr shown').appendTo($table)

    for key, val of data.val
        $tbody = $attr_tbody
        if key.indexOf('__') == 0 and key.indexOf('__', key.length - 2) != -1
            $tbody = $core_tbody
        else if val.type.indexOf('method') != -1
            $tbody = $method_tbody

        $tbody.append($('<tr>')
            .append($('<td>').text(key))
            .append($('<td>').html(val.val)))
    code($('#scrollback'), $container.html(), [], true)
    termscroll()
    $('#eval').val('')

breakset = (data) ->
    if data.lno
        cm.removeClass(data.lno, 'ask-breakpoint')
        cm.addClass(data.lno, 'breakpoint')

        if data.cond
            $line.attr('title', "On [#{data.cond}]")
    $eval = $('#eval')
    if $eval.val().indexOf('.b ') == 0 or $eval.val().indexOf('.t ') == 0
        $eval.val('')

breakunset = (data) ->
    cm.removeClass(data.lno, 'ask-breakpoint')
    $eval = $('#eval')
    if $eval.val().indexOf('.b ') == 0
        $eval.val('')

toggle_break = (lno, temporary) ->
    cmd = if temporary then 'TBreak' else 'Break'
    if ('' + lno).indexOf(':') > -1
        send(cmd + '|' + lno)
        return
    cls = cm.lineInfo(lno - 1).bgClass or ''
    if cls.split(' ').indexOf('breakpoint') > -1
        cm.removeMark(lno)
        cm.removeClass(lno, 'breakpoint')
        cm.addClass(lno, 'ask-breakpoint')
        send('Unbreak|' + lno)
    else
        cm.addClass(lno, 'breakpoint')
        cm.addMark(lno, 'breakpoint', if temporary then '○' else '●')
        send(cmd + '|' + lno)


format_fun = (p) ->
    tags = [
        $('<span>', class: 'fun_name', title: p.module).text(p.call_name),
        $('<span>', class: 'fun_punct').text('(')]
    for param, i in p.params
        cls = 'fun_param'
        if i == p.index or (i == p.params.length - 1 and p.index > i)
            cls = 'fun_param active'
        tags.push $('<span>', class: cls).text(param)
        if i != p.params.length - 1
            tags.push $('<span>', class: 'fun_punct').text(', ')

    tags.push $('<span>', class: 'fun_punct').text(')')
    tags

suggest = (data) ->
    $eval = $('#eval')
    $comp = $('#completions table').empty()
    $comp.append($('<thead><tr><th id="comp-desc" colspan="5">'))
    added = []
    if data.params
        $('#comp-desc').append(format_fun(data.params))
    if data.completions.length
        $tbody = $('<tbody>')
        base_len = data.completions[0].base.length
        $eval.data(root: $eval.val().substr(0, $eval.val().length - base_len))
    for completion, index in data.completions
        if (completion.base + completion.complete) in added
            continue
        added.push(completion.base + completion.complete)
        if index % 5 == 0
            $tbody.append($appender = $('<tr>'))

        $appender.append($td = $('<td>').attr('title', completion.description)
            .append($('<span>').addClass('base').text(completion.base))
            .append($('<span>').addClass('completion').text(completion.complete)))
        if not completion.complete
            $td.addClass('active complete')
            $('#comp-desc').html($td.attr('title'))

    $comp.append($tbody)
    termscroll()

suggest_stop = ->
    $('#completions table').empty()

log = (data) ->
    console.log data.message

searchback = ->
    suggest_stop()
    index = backsearch
    val = $('#eval').val()
    for h in cmd_hist[$('.selected .tracefile').text()]
        re = new RegExp('(' + val + ')', 'gi')
        if re.test(h)
            index--
            if index == 0
                $('#backsearch').html(h.replace(re, '<span class="backsearched">$1</span>'))
                return
    if backsearch == 1
        searchback_stop()
        return
    backsearch = Math.max(backsearch - 1, 1)

searchback_stop = (validate) ->
    if validate
        $('#eval').val($('#backsearch').text())
    $('#backsearch').html('')
    backsearch = null

die = ->
    $('#source,#traceback').remove()
    $('h1').html('Dead<small>Program has exited</small>')
    ws.close()
    if __ws_alt_ports
        setTimeout (-> close()), 1000

register_handlers = ->
    $('body,html').on 'keydown', (e) ->
        if cm._rw
            return true
        if (e.ctrlKey and e.keyCode == 37) or e.keyCode == 119 # ctrl + left  or F8
            send('Continue')
            return false
        if (e.ctrlKey and e.keyCode == 38) or e.keyCode == 120 # ctrl + up    or F9
            send('Return')
            return false
        if (e.ctrlKey and e.keyCode == 39) or e.keyCode == 121 # ctrl + right or F10
            send('Next')
            return false
        if (e.ctrlKey and e.keyCode == 40) or e.keyCode == 122 # ctrl + down  or F11
            send('Step')
            return false
        if e.keyCode == 118 # F7
            send('Until')
            return false

    $('#eval').on 'keydown', (e) ->
        $eval = $(@)
        if e.altKey and e.keyCode == 82 and backsearch # R
            backsearch = Math.max(backsearch - 1, 1)
            searchback()
            return false

        if e.ctrlKey
            if e.keyCode == 82 # R
                if backsearch is null
                    backsearch = 1
                else
                    if e.shiftKey
                        backsearch = Math.max(backsearch - 1, 1)
                    else
                        backsearch++
                searchback()
                return false
            else if e.keyCode == 67 # C
                searchback_stop()
            else
                e.stopPropagation()
                return

        if e.keyCode == 13 # Enter
            if backsearch
                searchback_stop true
                return false
            if $('#completions table td.active').length and not $('#completions table td.complete').length
                suggest_stop()
                return false
            $eval = $(@)
            if not e.shiftKey
                execute $eval.val()
                return false
            else
                $eval.attr('rows', parseInt($eval.attr('rows')) + 1)
                termscroll()

        else if e.keyCode == 27 # Escape
            suggest_stop()
            searchback_stop()
            return false

        else if e.keyCode == 9 # Tab
            if e.shiftKey
                $eval = $(@)
                txtarea = $eval.get(0)
                startPos = txtarea.selectionStart
                endPos = txtarea.selectionEnd
                if startPos or startPos == '0'
                    $eval.val($eval.val().substring(0, startPos) + '    ' + $eval.val().substring(endPos, $eval.val().length))
                else
                    $eval.val($eval.val() + '    ')
                return false
            if backsearch
                return false
            $tds = $('#completions table td')
            $active = $tds.filter('.active')
            if $tds.length
                if not $active.length
                    $active = $tds.first().addClass('active')
                else
                    index = $tds.index($active)
                    if index is $tds.length - 1
                        index = 0
                    else
                        index++
                    $active.removeClass('active complete')
                    $active = $tds.eq(index).addClass('active')
                base = $active.find('.base').text()
                completion = $active.find('.completion').text()
                $eval.val($eval.data().root + base + completion)
                $('#comp-desc').text($active.attr('title'))
                termscroll()
            return false

        else if e.keyCode == 38  # Up
            $eval = $(@)
            filename = $('.selected .tracefile').text()
            if not e.shiftKey
                if filename of cmd_hist
                    index = parseInt($eval.attr('data-index')) + 1
                    if index >= 0 and index < cmd_hist[filename].length
                        to_set = cmd_hist[filename][index]
                        if index == 0
                            $eval.attr('data-current', $eval.val())
                        $eval.val(to_set)
                            .attr('data-index', index)
                            .attr('rows', to_set.split('\n').length)
                        return false

        else if e.keyCode == 40  # Down
            $eval = $(@)
            filename = $('.selected .tracefile').text()
            if not e.shiftKey
                if filename of cmd_hist
                    index = parseInt($eval.attr('data-index')) - 1
                    if index >= -1 and index < cmd_hist[filename].length
                        if index == -1
                            to_set = $eval.attr('data-current')
                        else
                            to_set = cmd_hist[filename][index]
                        $eval.val(to_set)
                            .attr('data-index', index)
                            .attr('rows', to_set.split('\n').length)
                        return false


    $("#scrollback").on('click', 'a.inspect', ->
        send('Inspect|' + $(@).attr('href'))
        false
    ).on('click', '.short.close', ->
        $(@).addClass('open').removeClass('close').next('.long').show('fast')
    ).on('click', '.long,.short.open', ->
        elt = if $(@).hasClass('long') then $(@) else $(@).next('.long')
        elt.hide('fast').prev('.short').removeClass('open').addClass('close')
    ).on('click', '.toggle', ->
        $(@).add($(@).next()).toggleClass('hidden', 'shown')
    )

    $("#source").on('dblclick', (e) ->
        not cm._rw and toggle_edition(true)
    )

    $("#sourcecode").on('mouseup', 'span', (e) ->
        if e.which == 2 # Middle
            target = $(@).text().trim()
            historize target
            send 'Dump|' + target
    )

    $(document).on('keydown', (e) ->
        if e.keyCode == 13
            sel = document.getSelection().toString().trim()
            if sel
                historize sel
                send 'Dump|' + sel
    )

    $('#eval').on('input', ->
        txt = $(@).val()
        if backsearch
            if not txt
                searchback_stop()
            else
                backsearch = 1
                searchback()
            return
        hist = session_cmd_hist[$('.selected .tracefile').text()] or []
        if txt and txt[0] != '.'
            send('Complete|' + hist.slice(0).reverse().filter((e) -> e.indexOf('.') != 0).join('\n') + '\n' + txt)
        else
            suggest_stop()
    ).on('blur', ->
        searchback_stop()
        # suggest_stop()
    )

