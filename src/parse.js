webirc = webirc || {};
webirc.irc = webirc.irc || {};

// This function is based on https://raw.githubusercontent.com/caffeinery/coffea-irc-parser/master/src/parse.js
//
// Copyright (c) 2016 Michael Harker
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
webirc.irc.parse = function (line) {
  var tags = {};
  var userinfo = {};
  var command = '';
  var params = '';
  var trailing = '';
  var pos = 0;
  var parse_error = new Error('This message is not a valid IRC Message.');

  /**
   * IRCv3 MESSAGE TAGS
   */
  if (line.charCodeAt(pos) === 64) { // The line begins with an @, parse message-tags
    var message_tags;

    if (line.indexOf(' ', pos) === -1) {
      throw parse_error;
    }

    pos++;
    message_tags = line.slice(pos, line.indexOf(' ', pos)).split(';'); // Remove the @ before the tags, split the tags.

    for (var tag of message_tags) {
      var pair = tag.split('=');
      tags[pair[0]] = (pair[1] || true); // Either the tag exists or has a value.
    }

    pos = line.indexOf(' ', pos) + 1;
  }

  /**
   * REMOVE TRAILING WHITESPACE
   */
  while (line.charCodeAt(pos) === 32) pos++; // While space, ignore & move on

  /**
   * GET USER INFORMATION
   */
  if (line.charCodeAt(pos) === 58) { // :
    var prefix = line.slice(pos, line.indexOf(' ', pos));
    var ppos = 0;

    if (prefix.indexOf('!', ppos) !== -1) {
      // :nick!user@host
      userinfo.nick = prefix.slice(ppos + 1, prefix.indexOf('!', ppos)); // Extract nickname
      ppos = prefix.indexOf('!', ppos) + 1;

      userinfo.ident = prefix.slice(ppos, prefix.indexOf('@', ppos)); // Extract ident
      ppos = prefix.indexOf('@', ppos) + 1;

      userinfo.hostname = prefix.slice(ppos); // Extract hostname

      userinfo.is_user = true;
    } else {
      // :sendak.freenode.net
      userinfo.is_user = false;

      userinfo.sender = prefix.slice(ppos + 1);
    }

    pos = pos + prefix.length + 1;
  } else {
    // messages without a prefix should be assumed to come from a server.
    userinfo.is_user = false;
    userinfo.sender = null;
  }

  /**
   * REMOVE TRAILING WHITESPACE
   */
  while (line.charCodeAt(pos) === 32) pos++;

  /**
   * GET COMMAND (PRIVMSG | NOTICE)
   */
  if (line.indexOf(' ', pos) === -1) {
    if (line.length > pos) {
      command = line.slice(pos);
      return {
        tags: tags,
        userinfo: userinfo,
        command: command,
        raw: line
      }
    }
    throw parse_error;
  } else {
    command = line.slice(pos, line.indexOf(' ', pos));
  }

  pos = line.indexOf(' ', pos);

  /**
   * REMOVE TRAILING WHITESPACE
   */
  while (line.charCodeAt(pos) === 32) pos++;

  /**
   * GET MESSAGE PARAMETERS AND TRAILING
   */
  while (pos < line.length) {
    var space = line.indexOf(' ', pos);

    if (line.charCodeAt(pos) === 58) {
      trailing = line.slice(pos + 1); // Anything after the colon is "trailing"
      break;
    }

    // Loop parameters
    if (space > -1) {
      params += ' ' + line.slice(pos, space);
      pos = space + 1;

      while (line.charCodeAt(pos) === 32) pos++;
      continue;
    }

    // We hit the end, it was a fun ride while it lasted. :(
    if (space === -1) {
      params += line.slice(pos);
      break;
    }
  }

  params = params.trim().split(' ');
  params.push(trailing);

  // Return the message back to the user.
  return {
    tags: tags,
    userinfo: userinfo,
    command: command,
    parameters: params,
    raw: line
  }
}
