"use strict";
$(() => {
    var thingpediaUrl = document.body.dataset.thingpediaUrl;
    var url = new URL('ws/conversation', location.href);
    if (url.protocol === 'https:')
        url.protocol = 'wss:';
    else
        url.protocol = 'ws:';
    url = url.toString();

    var ws;
    var open = false;
    var recording = false;

    var pastCommandsUp = []; // array accessed by pressing up arrow
    var pastCommandsDown = []; // array accessed by pressing down arrow
    var currCommand = ""; // current command between pastCommandsUp and pastCommandsDown

    function refreshToolbar() {
        const saveButton = $('#save-log');
        $.get('/api/conversation/recording').then((res) => {
            if (res.status === 'on') {
                recording = true;
                $('#recording-toggle').attr("checked", true);
                saveButton.removeClass('hidden');
            } else {
                recording = false;
                $('#recording-toggle').attr("checked", false);
            }
        });
        $.get('/api/conversation/log').then((res) => {
            if (res)
                saveButton.removeClass('hidden');
        });
    }

    refreshToolbar();

    function updateFeedback(thinking) {
        if (!ws || !open) {
            $('#input-form-group').addClass('has-warning');
            $('#input-form-group .spinner-container').addClass('hidden');
-           $('#input-form-group .glyphicon-warning-sign, #input-form-group .help-block').removeClass('hidden');
            return;
        }

        $('#input-form-group').removeClass('has-warning');
        $('#input-form-group .glyphicon-warning-sign, #input-form-group .help-block').addClass('hidden');
        if (thinking)
            $('#input-form-group .spinner-container').removeClass('hidden');
        else
            $('#input-form-group .spinner-container').addClass('hidden');
    }

    (function() {
        var reconnectTimeout = 100;

        function connect() {
            ws = new WebSocket(url);
            refreshToolbar();

            ws.onmessage = function(event) {
                if (!open) {
                    open = true;
                    reconnectTimeout = 100;
                    updateFeedback(false);
                }
                onWebsocketMessage(event);
            };

            ws.onclose = function() {
                console.error('Web socket closed');
                ws = undefined;
                updateFeedback(false);

                // reconnect immediately if the connection previously succeeded, otherwise
                // try again in a little bit
                if (open) {
                    setTimeout(connect, 100);
                } else {
                    reconnectTimeout = 1.5 * reconnectTimeout;
                    setTimeout(connect, reconnectTimeout);
                }
            };
        }

        connect();
    })();

    function syncCancelButton(msg) {
        var visible = msg.ask !== null;
        if (visible)
            $('#cancel').removeClass('hidden');
        else
            $('#cancel').addClass('hidden');
    }

    var container = $('#chat');
    var currentGrid = null;

    function almondMessage(icon) {
        var msg = $('<span>').addClass('message-container from-almond');
        icon = icon || 'org.thingpedia.builtin.thingengine.builtin';
        var src = thingpediaUrl + '/api/v3/devices/icon/' + icon;
        msg.append($('<img>').addClass('icon').attr('src', src));
        container.append(msg);

        if (recording)
            vote();
        return msg;
    }

    function vote() {
        const upvote = $('<i>').addClass('far fa-thumbs-up').attr('id', 'upvoteLast');
        const downvote = $('<i>').addClass('far fa-thumbs-down').attr('id', 'downvoteLast');
        const comment = $('<i>').addClass('far fa-comment-alt').attr('id', 'commentLast')
            .attr('data-toggle', 'modal')
            .attr('data-target', '#comment-popup');
        upvote.click((event) => {
            $.post('/api/conversation/vote/up').then((res) => {
                if (res.status === 'ok') {
                    upvote.attr('class', 'fa fa-thumbs-up');
                    downvote.attr('class', 'far fa-thumbs-down');
                }
            });
            event.preventDefault();
        });
        downvote.click((event) => {
            $.post('/api/conversation/vote/down').then((res) => {
                if (res.status === 'ok') {
                    upvote.attr('class', 'far fa-thumbs-up');
                    downvote.attr('class', 'fa fa-thumbs-down');
                }
            });
            event.preventDefault();
        });
        const div = $('<span>').addClass('comment-options');
        div.append(upvote);
        div.append(downvote);
        div.append(comment);
        container.append(div);
        return div;
    }

    function maybeScroll(container) {
        if (!$('#input:focus').length)
            return;

        scrollChat();
        setTimeout(scrollChat, 1000);
    }

    function scrollChat() {
        let chat = document.getElementById('conversation');
        chat.scrollTop = chat.scrollHeight;
    }

    function textMessage(text, icon) {
        var container = almondMessage(icon);
        container.append($('<span>').addClass('message message-text')
            .text(text));
        maybeScroll(container);
    }

    function picture(url, icon) {
        var container = almondMessage(icon);
        container.append($('<img>').addClass('message message-picture')
            .attr('src', url));
        maybeScroll(container);
    }

    function rdl(rdl, icon) {
        var container = almondMessage(icon);
        var rdlMessage = $('<a>').addClass('message message-rdl')
            .attr('href', rdl.webCallback).attr("target", "_blank").attr("rel", "noopener nofollow");
        rdlMessage.append($('<span>').addClass('message-rdl-title')
            .text(rdl.displayTitle));
        if (rdl.pictureUrl) {
            rdlMessage.append($('<span>').addClass('message-rdl-content')
                .append($('<img>').attr('src', rdl.pictureUrl)));
        }
        rdlMessage.append($('<span>').addClass('message-rdl-content')
            .text(rdl.displayText));
        container.append(rdlMessage);
        maybeScroll(container);
    }

    function getGrid() {
        if (!currentGrid) {
            var wrapper = $('<div>').addClass('message-container button-grid container');
            currentGrid = $('<div>').addClass('row');
            wrapper.append(currentGrid);
            container.append(wrapper);
        }
        return currentGrid;
    }

    function choice(idx, title) {
        var holder = $('<div>').addClass('col-xs-12 col-sm-6');
        var btn = $('<a>').addClass('message message-choice btn btn-default')
            .attr('href', '#').text(title);
        btn.click((event) => {
            handleChoice(idx);
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function buttonMessage(title, json) {
        var holder = $('<div>').addClass('col-xs-12 col-sm-6');
        var btn = $('<a>').addClass('message message-button btn btn-default')
            .attr('href', '#').text(title);
        btn.click((event) => {
            handleParsedCommand(json, title);
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function linkMessage(title, url) {
        /*if (url === '/apps')
            url = '/me';
        else if (url.startsWith('/devices'))
            url = '/me' + url;*/

        var holder = $('<div>').addClass('col-xs-12 col-sm-6');
        var btn = $('<a>').addClass('message message-button btn btn-default')
            .attr('href', url).attr("target", "_blank").attr("rel", "noopener").text(title);
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function yesnoMessage() {
        var holder = $('<div>').addClass('col-xs-6 col-sm-4 col-md-3');
        var btn = $('<a>').addClass('message message-yesno btn btn-default')
            .attr('href', '#').text("Yes");
        btn.click((event) => {
            handleSpecial('yes', "Yes");
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        holder = $('<div>').addClass('col-xs-6 col-sm-4 col-md-3');
        btn = $('<a>').addClass('message message-yesno btn btn-default')
            .attr('href', '#').text("No");
        btn.click(function(event) {
            handleSpecial('no', "No");
            event.preventDefault();
        });
        holder.append(btn);
        getGrid().append(holder);
        maybeScroll(holder);
    }

    function collapseButtons() {
        $('.message-button, .message-choice, .message-yesno').remove();
        $('.comment-options').remove();
    }

    function syncKeyboardType(ask) {
        if (ask === 'password')
            $('#input').attr('type', 'password');
        else
            $('#input').attr('type', 'text');
    }

    function onWebsocketMessage(event) {
        var parsed = JSON.parse(event.data);
        console.log('received ' + event.data);
        switch (parsed.type) {
        case 'text':
        case 'result':
            // FIXME: support more type of results
            textMessage(parsed.text, parsed.icon);
            currentGrid = null;
            break;

        case 'picture':
            picture(parsed.url, parsed.icon);
            currentGrid = null;
            break;

        case 'rdl':
            rdl(parsed.rdl, parsed.icon);
            currentGrid = null;
            break;

        case 'choice':
            choice(parsed.idx, parsed.title);
            break;

        case 'button':
            buttonMessage(parsed.title, parsed.json);
            break;

        case 'link':
            linkMessage(parsed.title, parsed.url);
            break;

        case 'askSpecial':
            syncKeyboardType(parsed.ask);
            syncCancelButton(parsed);
            if (parsed.ask === 'yesno')
                yesnoMessage();
            break;

        case 'hypothesis':
            $('#input').val(parsed.hypothesis);
            break;

        case 'command':
            $('#input').val('');
            collapseButtons();
            appendUserMessage(parsed.command);
            break;
        }

        updateFeedback(false);
    }

    function handleSlashR(line) {
        line = line.trim();
        if (line.startsWith('{'))
            handleParsedCommand(JSON.parse(line));
        else
            handleParsedCommand({ code: line.split(' '), entities: {} });
    }

    function handleCommand(text) {
        if (text.startsWith('\\r')) {
            handleSlashR(text.substring(3));
            return;
        }
        if (text.startsWith('\\t')) {
            handleThingTalk(text.substring(3));
            return;
        }

        updateFeedback(true);
        ws.send(JSON.stringify({ type: 'command', text: text }));
    }
    function handleParsedCommand(json, title) {
        updateFeedback(true);
        ws.send(JSON.stringify({ type: 'parsed', json: json, title: title }));
    }
    function handleThingTalk(tt) {
        updateFeedback(true);
        ws.send(JSON.stringify({ type: 'tt', code: tt }));
    }
    function handleChoice(idx, title) {
        handleParsedCommand({ code: ['bookkeeping', 'choice', String(idx)], entities: {} }, title);
    }
    function handleSpecial(special, title) {
        handleParsedCommand({ code: ['bookkeeping', 'special', 'special:'+special ], entities: {} }, title);
    }

    function appendUserMessage(text) {
        container.append($('<span>').addClass('message message-text from-user')
            .text(text));
    }

    $('#input-form').submit((event) => {
        var text = $('#input').val();
        if (currCommand !== "")
          pastCommandsUp.push(currCommand);
        if (pastCommandsDown.length !== 0) {
          pastCommandsUp = pastCommandsUp.concat(pastCommandsDown);
          pastCommandsDown = [];
        }
        pastCommandsUp.push(text);

        $('#input').val('');

        handleCommand(text);
        event.preventDefault();
    });
    $('#cancel').click(() => {
        handleSpecial('nevermind', "Cancel.");
    });

    $('#input-form').on('keydown', (event) => { // button is pressed
      if (event.keyCode === 38) {  // Up
        // removes last item from array pastCommandsUp, displays it as currCommand, adds current input text to pastCommandsDown
        currCommand = pastCommandsUp.pop();
        if ($('#input').val() !== "")
          pastCommandsDown.push($('#input').val());
        $('#input').val(currCommand);
      }

      if (event.keyCode === 40) {  // Down
        // removes last item from array pastCommandsDown, displays it as currCommand, adds current input text to pastCommandsUp
        currCommand = pastCommandsDown.pop();
        if ($('#input').val() !== "")
          pastCommandsUp.push($('#input').val());
        $('#input').val(currCommand);
      }
    });

    $('#recording-toggle').change(() => {
        if ($('#recording-toggle').prop('checked')) {
            recording = true;
            $.post('/api/conversation/startRecording', '_csrf=' + document.body.dataset.csrfToken);
            $('#save-log').removeClass('hidden');
        } else {
            recording = false;
            $.post('/api/conversation/endRecording', '_csrf=' + document.body.dataset.csrfToken);
            $.post('/api/conversation/save');
        }
    });

    $('#save-log').click(() => {
        $.post('/api/conversation/save').then((res) => {
            if (res.status === 'ok')
                window.open("/api/conversation/log", "Almond Conversation Log");
        });
    });

    $('#comment-popup').submit((event) => {
        event.preventDefault();
        $.post('/api/conversation/comment', { comment: $('#comment-block').val() }).then((res) => {
            if (res.status === 'ok') {
                $('#commentLast').attr('class', 'fa fa-comment-alt');
                $('#comment-popup').modal('toggle');
            }
        });
    });
});
